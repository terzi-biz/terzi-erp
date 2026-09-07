/**
 * Фінанси в розрізі одного замовлення: план/факт, дебіторка, кредиторка,
 * маржа та ФОТ по об'єкту з графіком виплат (аванс 20-го, залишок 5-го).
 *
 * Усі підсумки — детерміновані агрегати з БД; жодних оцінок і хардкоду ставок.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { payrollScheduleFor } from "./payroll-engine";

const num = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

async function assertFinance(context: any) {
  const { data, error } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  if (error) { console.error("is_finance_user", error); throw new Error("Не вдалося перевірити права доступу"); }
  if (data !== true) throw new Error("Немає доступу до фінансових даних");
  return true;
}

export const getOrderFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const orderId = data.order_id;

    const [{ data: estimates }, { data: invoices }, { data: payments }, { data: expenses }, { data: tx }, { data: payrollItems }] =
      await Promise.all([
        context.supabase.from("estimates").select("total_client,total_cost,status,created_at").eq("order_id", orderId),
        context.supabase.from("invoices").select("id,number,total,paid,status,issue_date,due_date").eq("order_id", orderId),
        context.supabase.from("payments").select("amount,direction,paid_at").eq("order_id", orderId),
        context.supabase.from("expenses").select("amount,category,name,spent_at,supplier").eq("order_id", orderId),
        context.supabase.from("finance_transactions").select("kind,amount,amount_uah,op_date").eq("order_id", orderId),
        context.supabase
          .from("payroll_items")
          .select("amount,item_type,name,calculation:calculation_id(status,total_payable,paid_amount,advance_amount,period:period_id(period))")
          .eq("order_id", orderId),
      ]);

    const est = (estimates ?? []) as any[];
    const revenuePlan = r2(est.reduce((s, e) => s + num(e.total_client), 0));
    const costPlan = r2(est.reduce((s, e) => s + num(e.total_cost), 0));

    const inv = ((invoices ?? []) as any[]).filter((i) => !["cancelled", "draft"].includes(i.status));
    const invoiced = r2(inv.reduce((s, i) => s + num(i.total), 0));
    const now = new Date();
    const receivable = r2(inv.reduce((s, i) => s + Math.max(num(i.total) - num(i.paid), 0), 0));
    const receivableOverdue = r2(
      inv.filter((i) => i.due_date && new Date(i.due_date) < now && num(i.total) > num(i.paid))
        .reduce((s, i) => s + (num(i.total) - num(i.paid)), 0),
    );

    const pays = (payments ?? []) as any[];
    const paymentsIn = r2(pays.filter((p) => p.direction !== "out").reduce((s, p) => s + num(p.amount), 0));
    const paymentsOut = r2(pays.filter((p) => p.direction === "out").reduce((s, p) => s + num(p.amount), 0));
    const expenseRows = (expenses ?? []) as any[];
    const expensesFact = r2(expenseRows.reduce((s, e) => s + num(e.amount), 0));

    const txRows = (tx ?? []) as any[];
    const finmapIncome = r2(txRows.filter((t) => t.kind === "income").reduce((s, t) => s + num(t.amount_uah ?? t.amount), 0));
    const finmapExpense = r2(txRows.filter((t) => t.kind === "expense").reduce((s, t) => s + num(t.amount_uah ?? t.amount), 0));

    // Факт беремо максимум з ERP-платежів і операцій Finmap, щоб не подвоювати одні й ті самі гроші.
    const revenueFact = r2(Math.max(paymentsIn, finmapIncome));
    const costFact = r2(Math.max(paymentsOut + expensesFact, finmapExpense));

    const profitPlan = r2(revenuePlan - costPlan);
    const profitFact = r2(revenueFact - costFact);
    const marginPlan = revenuePlan > 0 ? r2((profitPlan / revenuePlan) * 100) : 0;
    const marginFact = revenueFact > 0 ? r2((profitFact / revenueFact) * 100) : 0;

    // ФОТ по об'єкту
    const items = (payrollItems ?? []) as any[];
    const payrollAccrued = r2(items.reduce((s, i) => s + num(i.amount), 0));
    const payrollPaidShare = r2(
      items.reduce((s, i) => {
        const calc = i.calculation;
        const total = num(calc?.total_payable);
        const paid = num(calc?.paid_amount);
        if (total <= 0) return s;
        return s + num(i.amount) * (paid / total);
      }, 0),
    );
    const payrollDue = r2(Math.max(payrollAccrued - payrollPaidShare, 0));

    // Графік виплат по періодах, у які потрапили нарахування цього об'єкта.
    const byPeriod = new Map<string, { period: string; accrued: number; advancePercent: number }>();
    for (const i of items) {
      const raw = i.calculation?.period?.period as string | undefined;
      if (!raw) continue;
      const period = String(raw).slice(0, 7);
      const total = num(i.calculation?.total_payable);
      const advance = num(i.calculation?.advance_amount);
      const cur = byPeriod.get(period) ?? { period, accrued: 0, advancePercent: 0 };
      cur.accrued += num(i.amount);
      if (total > 0) cur.advancePercent = (advance / total) * 100;
      byPeriod.set(period, cur);
    }
    const payrollSchedule = [...byPeriod.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((p) => {
        const { advanceDate, settlementDate } = payrollScheduleFor(p.period);
        const advanceAmount = r2((p.accrued * p.advancePercent) / 100);
        return {
          period: p.period,
          accrued: r2(p.accrued),
          advanceDate,
          advanceAmount,
          settlementDate,
          settlementAmount: r2(p.accrued - advanceAmount),
        };
      });

    // Кредиторка: борг по ФОТ + витрати без підтвердженої оплати з каси.
    const payable = r2(payrollDue + Math.max(expensesFact - paymentsOut, 0));

    return {
      order_id: orderId,
      plan: { revenue: revenuePlan, cost: costPlan, profit: profitPlan, margin: marginPlan },
      fact: { revenue: revenueFact, cost: costFact, profit: profitFact, margin: marginFact },
      variance: {
        revenue: r2(revenueFact - revenuePlan),
        cost: r2(costFact - costPlan),
        profit: r2(profitFact - profitPlan),
      },
      invoiced,
      receivable,
      receivableOverdue,
      payable,
      payroll: { accrued: payrollAccrued, paid: payrollPaidShare, due: payrollDue, schedule: payrollSchedule },
      invoices: inv.map((i) => ({
        id: i.id, number: i.number, total: num(i.total), paid: num(i.paid),
        rest: r2(num(i.total) - num(i.paid)), status: i.status, due_date: i.due_date,
      })),
      expenses: expenseRows.map((e) => ({
        name: e.name, category: e.category, amount: num(e.amount), spent_at: e.spent_at, supplier: e.supplier,
      })),
      finmap: { income: finmapIncome, expense: finmapExpense, transactions: txRows.length },
    };
  });
