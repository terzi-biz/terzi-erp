import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orderPnl, accountBalance } from "@/lib/finance-calc";
import {
  accountInput, invoiceInput, paymentInput, expenseInput, idInput, orderIdInput,
} from "@/lib/finance.schema";

/** Фінанси: рахунки компанії, інвойси, оплати, витрати, P&L по замовленню. */

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: accounts, error }, { data: payments }, { data: expenses }] = await Promise.all([
      context.supabase.from("finance_accounts").select("*").eq("archived", false).order("name"),
      context.supabase.from("payments").select("account_id,amount,direction"),
      context.supabase.from("expenses").select("account_id,amount"),
    ]);
    if (error) { console.error("listAccounts", error); throw new Error("Не вдалося завантажити рахунки"); }
    return (accounts ?? []).map((a: any) => ({
      ...a,
      balance: accountBalance(
        Number(a.opening_balance) || 0,
        ((payments ?? []) as any[]).filter((p) => p.account_id === a.id),
        ((expenses ?? []) as any[]).filter((e) => e.account_id === a.id),
      ),
    }));
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("finance_accounts").update(rest).eq("id", id).select().single()
      : await context.supabase.from("finance_accounts").insert(rest).select().single();
    if (error) { console.error("saveAccount", error); throw new Error("Не вдалося зберегти рахунок"); }
    return out;
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select("*, lines:invoice_lines(*), order:order_id(number,name), client:client_id(name)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) { console.error("listInvoices", error); throw new Error("Не вдалося завантажити рахунки на оплату"); }
    return data ?? [];
  });

export const saveInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => invoiceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, lines, ...rest } = data;
    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    const payload: any = { ...rest, total };
    if (!id) payload.created_by = context.userId;
    const { data: inv, error } = id
      ? await context.supabase.from("invoices").update(payload).eq("id", id).select().single()
      : await context.supabase.from("invoices").insert(payload).select().single();
    if (error) { console.error("saveInvoice", error); throw new Error("Не вдалося зберегти рахунок"); }
    await context.supabase.from("invoice_lines").delete().eq("invoice_id", inv.id);
    if (lines.length) {
      const { error: le } = await context.supabase.from("invoice_lines")
        .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
      if (le) { console.error("saveInvoiceLines", le); throw new Error("Не вдалося зберегти позиції рахунку"); }
    }
    return inv;
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("*, order:order_id(number,name), account:account_id(name), invoice:invoice_id(number)")
      .order("paid_at", { ascending: false })
      .limit(300);
    if (error) { console.error("listPayments", error); throw new Error("Не вдалося завантажити платежі"); }
    return data ?? [];
  });

export const savePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("payments").update(payload).eq("id", id).select().single()
      : await context.supabase.from("payments").insert(payload).select().single();
    if (error) { console.error("savePayment", error); throw new Error("Не вдалося зберегти платіж"); }
    return out;
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payments").delete().eq("id", data.id);
    if (error) { console.error("deletePayment", error); throw new Error("Не вдалося видалити платіж"); }
    return { ok: true };
  });

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("expenses")
      .select("*, order:order_id(number,name), account:account_id(name)")
      .order("spent_at", { ascending: false })
      .limit(300);
    if (error) { console.error("listExpenses", error); throw new Error("Не вдалося завантажити витрати"); }
    return data ?? [];
  });

export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => expenseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("expenses").update(payload).eq("id", id).select().single()
      : await context.supabase.from("expenses").insert(payload).select().single();
    if (error) { console.error("saveExpense", error); throw new Error("Не вдалося зберегти витрату"); }
    return out;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) { console.error("deleteExpense", error); throw new Error("Не вдалося видалити витрату"); }
    return { ok: true };
  });

/** P&L по замовленню: план з кошторисів, факт з оплат і витрат. */
export const getOrderPnl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: estimates }, { data: payments }, { data: expenses }, { data: invoices }] = await Promise.all([
      context.supabase.from("estimates").select("total_client,total_cost,status").eq("order_id", data.order_id),
      context.supabase.from("payments").select("amount,direction").eq("order_id", data.order_id),
      context.supabase.from("expenses").select("amount").eq("order_id", data.order_id),
      context.supabase.from("invoices").select("total,paid,status").eq("order_id", data.order_id),
    ]);
    const est = (estimates ?? []) as any[];
    const pnl = orderPnl({
      estimateTotal: est.reduce((s, e) => s + (Number(e.total_client) || 0), 0),
      estimateCost: est.reduce((s, e) => s + (Number(e.total_cost) || 0), 0),
      payments: ((payments ?? []) as any[]).map((p) => ({ amount: Number(p.amount) || 0, direction: p.direction })),
      expenses: ((expenses ?? []) as any[]).map((e) => ({ amount: Number(e.amount) || 0 })),
    });
    const invoiced = ((invoices ?? []) as any[]).reduce((s, i) => s + (Number(i.total) || 0), 0);
    return { ...pnl, invoiced: Math.round(invoiced * 100) / 100, invoiceCount: (invoices ?? []).length };
  });

/**
 * Каса по проєктах: один зріз по всіх замовленнях (план з кошторисів,
 * виставлено, отримано, витрати по категоріях, борг, маржа).
 */
export const listOrderCashflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: orders, error }, { data: estimates }, { data: invoices }, { data: payments }, { data: expenses }, { data: measurements }] =
      await Promise.all([
        context.supabase
          .from("orders")
          .select("id,number,name,address,commercial_status,financial_status,amount_total,paid_total,payment_status,crm_status,ordered_at,client:client_id(name)")
          .order("created_at", { ascending: false })
          .limit(500),
        context.supabase.from("estimates").select("order_id,total_client,total_cost"),
        context.supabase.from("invoices").select("order_id,total,paid,status"),
        context.supabase.from("payments").select("order_id,amount,direction"),
        context.supabase.from("expenses").select("order_id,amount,category"),
        context.supabase.from("order_measurements").select("order_id,weight_kg,status"),
      ]);
    if (error) { console.error("listOrderCashflow", error); throw new Error("Не вдалося завантажити касу по проєктах"); }

    const num = (v: unknown) => Number(v) || 0;
    const r2 = (v: number) => Math.round(v * 100) / 100;

    return ((orders ?? []) as any[]).map((o) => {
      const est = ((estimates ?? []) as any[]).filter((e) => e.order_id === o.id);
      const inv = ((invoices ?? []) as any[]).filter((i) => i.order_id === o.id && i.status !== "cancelled");
      const pay = ((payments ?? []) as any[]).filter((p) => p.order_id === o.id);
      const exp = ((expenses ?? []) as any[]).filter((e) => e.order_id === o.id);
      const meas = ((measurements ?? []) as any[]).filter((m) => m.order_id === o.id);

      const revenuePlan = r2(est.reduce((s, e) => s + num(e.total_client), 0));
      const costPlan = r2(est.reduce((s, e) => s + num(e.total_cost), 0));
      const invoiced = r2(inv.reduce((s, i) => s + num(i.total), 0));
      const income = r2(pay.filter((p) => p.direction === "in").reduce((s, p) => s + num(p.amount), 0));
      const outflow = r2(pay.filter((p) => p.direction === "out").reduce((s, p) => s + num(p.amount), 0));
      const costFact = r2(exp.reduce((s, e) => s + num(e.amount), 0) + outflow);

      const byCategory: Record<string, number> = {};
      for (const e of exp) byCategory[e.category ?? "other"] = r2((byCategory[e.category ?? "other"] ?? 0) + num(e.amount));

      const profitPlan = r2(revenuePlan - costPlan);
      const profitFact = r2(income - costFact);

      return {
        id: o.id,
        number: o.number,
        name: o.name,
        address: o.address,
        clientName: o.client?.name ?? null,
        commercialStatus: o.commercial_status,
        financialStatus: o.financial_status,
        // Поля keyCRM: сума замовлення, сплачено, статус оплати, статус CRM, дата замовлення
        crmAmount: r2(num(o.amount_total)),
        crmPaid: r2(num(o.paid_total)),
        crmPaymentStatus: o.payment_status ?? null,
        crmStatus: o.crm_status ?? null,
        orderedAt: o.ordered_at ?? null,
        crmDebt: r2(Math.max(0, num(o.amount_total) - num(o.paid_total))),
        measurementsCount: meas.length,
        measurementsKg: r2(meas.reduce((s, m) => s + num(m.weight_kg), 0)),
        revenuePlan,
        costPlan,
        invoiced,
        income,
        costFact,
        byCategory,
        debt: r2(Math.max(0, (invoiced || revenuePlan) - income)),
        profitPlan,
        profitFact,
        marginPlan: revenuePlan > 0 ? r2((profitPlan / revenuePlan) * 100) : 0,
        marginFact: income > 0 ? r2((profitFact / income) * 100) : 0,
        deviation: r2(profitFact - profitPlan),
      };
    });
  });

