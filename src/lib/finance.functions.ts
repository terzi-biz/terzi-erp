import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orderPnl, accountBalance } from "@/lib/finance-calc";

/** Фінанси: рахунки компанії, інвойси, оплати, витрати, P&L по замовленню. */

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();

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
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(200),
    kind: z.enum(["cash", "bank", "fop"]).default("bank"),
    currency: z.string().max(10).default("UAH"),
    opening_balance: z.number().default(0),
    archived: z.boolean().optional(),
  }).parse(d))
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
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    order_id: nullableUuid,
    client_id: nullableUuid,
    estimate_id: nullableUuid,
    kind: z.enum(["advance", "stage", "final", "other"]).default("stage"),
    status: z.enum(["draft", "issued", "partial", "paid", "overdue", "cancelled"]).default("draft"),
    issue_date: z.string().min(4),
    due_date: z.string().min(4).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    lines: z.array(z.object({
      name: z.string().min(1).max(300),
      unit: z.string().max(30).default("шт"),
      qty: z.number(),
      price: z.number(),
    })).default([]),
  }).parse(d))
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
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    invoice_id: nullableUuid,
    order_id: nullableUuid,
    account_id: nullableUuid,
    direction: z.enum(["in", "out"]).default("in"),
    amount: z.number().min(0),
    paid_at: z.string().min(4),
    method: z.string().max(60).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }).parse(d))
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
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
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
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    order_id: nullableUuid,
    account_id: nullableUuid,
    category: z.string().max(60).default("other"),
    name: z.string().min(1).max(300),
    amount: z.number().min(0),
    spent_at: z.string().min(4),
    supplier: z.string().max(200).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }).parse(d))
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
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) { console.error("deleteExpense", error); throw new Error("Не вдалося видалити витрату"); }
    return { ok: true };
  });

/** P&L по замовленню: план з кошторисів, факт з оплат і витрат. */
export const getOrderPnl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: uuid }).parse(d))
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
