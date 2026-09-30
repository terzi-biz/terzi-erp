/**
 * Фінансові звіти за датою проведення операції (Finmap, Europe/Kyiv, тільки фактичні).
 * Прибуток по місяцях, витрати по статтях/класах, контрагенти. Детерміновано, доступ — фінансові ролі.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { costClassOf, COST_CLASS_LABELS, DIRECT_COST_CLASSES, type CostClass } from "./cost-class";

const NON_EBITDA: CostClass[] = ["taxes", "financing"];

async function fetchAll<T>(build: (a: number, b: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await build(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const periodSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getFinanceReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const { data: isFin } = await sb.rpc("is_finance_user", { _uid: context.userId });
    if (!isFin) throw new Error("Фінансові звіти доступні лише ролям admin / director / finance");

    const [tx, cats, cps] = await Promise.all([
      fetchAll<any>((a, b) => sb.from("finance_transactions")
        .select("id,kind,op_date,amount_uah,category_id,counterparty_id,approved")
        .eq("state", "actual").in("kind", ["income", "expense"])
        .gte("op_date", data.from).lte("op_date", data.to).range(a, b)),
      fetchAll<any>((a, b) => sb.from("finance_categories").select("id,name,parent_id,cost_class").range(a, b)),
      fetchAll<any>((a, b) => sb.from("finance_counterparties").select("id,name,kind").range(a, b)),
    ]);
    const catById = new Map(cats.map((c: any) => [c.id, c]));
    const cpById = new Map(cps.map((c: any) => [c.id, c]));

    // Місяці в межах періоду
    const monthKeys: string[] = [];
    {
      const [fy, fm] = data.from.split("-").map(Number);
      const [ty, tm] = data.to.split("-").map(Number);
      for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) {
        monthKeys.push(`${y}-${String(m).padStart(2, "0")}`);
        if (monthKeys.length > 36) break;
      }
    }
    type Month = { month: string; income: number; expense: number; direct: number; payroll: number; marketing: number; overhead: number; nonEbitda: number };
    const months = new Map<string, Month>(monthKeys.map((k) => [k, { month: k, income: 0, expense: 0, direct: 0, payroll: 0, marketing: 0, overhead: 0, nonEbitda: 0 }]));

    const byCat = new Map<string, { id: string; name: string; parent: string | null; cls: CostClass; total: number; count: number; byMonth: Record<string, number> }>();
    const byClass = new Map<CostClass, number>();
    const byCp = new Map<string, { id: string; name: string; kind: string | null; income: number; expense: number; count: number; last: string }>();

    let unapproved = 0;
    for (const t of tx) {
      if (t.approved === false) { unapproved++; continue; }
      const mk = String(t.op_date).slice(0, 7);
      const row = months.get(mk);
      const amt = Math.abs(Number(t.amount_uah || 0));
      const cat: any = t.category_id ? catById.get(t.category_id) : null;
      if (t.kind === "income") { if (row) row.income += amt; }
      else {
        const cls = costClassOf(cat);
        if (row) {
          row.expense += amt;
          if (DIRECT_COST_CLASSES.includes(cls)) row.direct += amt;
          else if (cls === "payroll") row.payroll += amt;
          else if (cls === "marketing") row.marketing += amt;
          else if (NON_EBITDA.includes(cls)) row.nonEbitda += amt;
          else row.overhead += amt;
        }
        byClass.set(cls, (byClass.get(cls) ?? 0) + amt);
        const key = t.category_id ?? "none";
        let e = byCat.get(key);
        if (!e) {
          const parent: any = cat?.parent_id ? catById.get(cat.parent_id) : null;
          e = { id: key, name: cat?.name ?? "Без статті", parent: parent?.name ?? null, cls, total: 0, count: 0, byMonth: {} };
          byCat.set(key, e);
        }
        e.total += amt; e.count++; e.byMonth[mk] = (e.byMonth[mk] ?? 0) + amt;
      }
      const cpKey = t.counterparty_id ?? "none";
      let c = byCp.get(cpKey);
      if (!c) {
        const cp: any = t.counterparty_id ? cpById.get(t.counterparty_id) : null;
        c = { id: cpKey, name: cp?.name ?? "Без контрагента", kind: cp?.kind ?? null, income: 0, expense: 0, count: 0, last: "" };
        byCp.set(cpKey, c);
      }
      if (t.kind === "income") c.income += amt; else c.expense += amt;
      c.count++; if (String(t.op_date) > c.last) c.last = String(t.op_date);
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const monthRows = [...months.values()].map((m) => {
      const grossProfit = m.income - m.direct;
      const ebitda = m.income - (m.expense - m.nonEbitda);
      const profit = m.income - m.expense;
      return {
        month: m.month,
        income: r2(m.income), expense: r2(m.expense), direct: r2(m.direct), payroll: r2(m.payroll),
        marketing: r2(m.marketing), overhead: r2(m.overhead), nonEbitda: r2(m.nonEbitda),
        grossProfit: r2(grossProfit), ebitda: r2(ebitda), profit: r2(profit),
        margin: m.income > 0 ? r2((profit / m.income) * 100) : null,
        payrollShare: m.income > 0 ? r2((m.payroll / m.income) * 100) : null,
        marketingShare: m.income > 0 ? r2((m.marketing / m.income) * 100) : null,
      };
    });
    const totals = monthRows.reduce((s, m) => ({
      income: s.income + m.income, expense: s.expense + m.expense, direct: s.direct + m.direct,
      payroll: s.payroll + m.payroll, marketing: s.marketing + m.marketing, overhead: s.overhead + m.overhead,
      nonEbitda: s.nonEbitda + m.nonEbitda,
    }), { income: 0, expense: 0, direct: 0, payroll: 0, marketing: 0, overhead: 0, nonEbitda: 0 });

    return {
      months: monthRows,
      totals: {
        ...totals,
        profit: totals.income - totals.expense,
        grossProfit: totals.income - totals.direct,
        ebitda: totals.income - (totals.expense - totals.nonEbitda),
        margin: totals.income > 0 ? ((totals.income - totals.expense) / totals.income) * 100 : null,
      },
      byClass: [...byClass.entries()].map(([cls, total]) => ({ cls, label: COST_CLASS_LABELS[cls], total: r2(total) })).sort((a, b) => b.total - a.total),
      categories: [...byCat.values()].map((c) => ({ ...c, clsLabel: COST_CLASS_LABELS[c.cls], total: r2(c.total) })).sort((a, b) => b.total - a.total),
      counterparties: [...byCp.values()].map((c) => ({ ...c, income: r2(c.income), expense: r2(c.expense), net: r2(c.income - c.expense) }))
        .sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
      excludedUnapproved: unapproved,
      txCount: tx.length - unapproved,
    };
  });
