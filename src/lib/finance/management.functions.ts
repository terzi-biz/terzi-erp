/**
 * Управлінська аналітика поверх Finmap: економіка робіт, кредиторка,
 * очікувані платежі, канонічні KPI (спільні для Finance Overview і Dashboard).
 *
 * Finmap — факт і планові операції. ERP — договори, замовлення, послуги,
 * кількості виробництва, нарахування ФОП. Дублювання логіки Finmap не створюємо.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { r2 } from "./core";
import { serviceEconomics, computePayables, type EconLine, type EconQuantity, type PayablesResult } from "./service-economics";
import { upcomingBuckets, toUpcomingRow, type UpcomingRow } from "./scheduled";
import { splitAmount, cashDateFilter, managementPeriodFilter, allocationStatusByDimension } from "./allocations";

const uuid = z.string().uuid();
const num = (v: unknown) => Number(v) || 0;

const periodInput = z.object({ from: z.string().min(4), to: z.string().min(4) });

async function assertFinance(context: any) {
  const { data, error } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  if (error) { console.error("is_finance_user", error); throw new Error("Не вдалося перевірити права доступу"); }
  if (data !== true) throw new Error("Немає доступу до фінансових даних");
}

async function audit(context: any, payload: Record<string, unknown>) {
  const { error } = await context.supabase.from("audit_logs").insert({
    actor_id: context.userId, module: "finance", is_critical: true, ...payload,
  });
  if (error) console.error("audit_logs", error);
}

const amt = (r: any) => num(r.amount_uah ?? r.amount);
/** Касова дата операції (для Cash Flow). */
const cash = (r: any) => (r.payment_date ?? r.op_date) as string | null;

/* ------------------------- Економіка робіт ------------------------- */

export const getServiceEconomics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    // Управлінський P&L: економічний період операції, а не касова дата.
    const [{ data: tx }, { data: cats }, { data: allocs }, { data: zones }, { data: orderSvc }] = await Promise.all([
      context.supabase
        .from("finance_transactions")
        .select("id,kind,amount,amount_uah,op_date,payment_date,period_start,period_end,state,order_id,category_id,service")
        .eq("state", "actual")
        .or(managementPeriodFilter(data.from, data.to)),
      context.supabase.from("finance_categories").select("id,name,cost_class").limit(2000),
      context.supabase.from("finance_allocations").select("transaction_id,dimension,service,order_id,amount").eq("dimension", "service"),
      context.supabase.from("order_zones").select("order_id,service,area,status,archived"),
      context.supabase.from("order_services").select("order_id,service"),
    ]);

    const { costClassOf, CANONICAL_TO_INTERNAL } = await import("./cost-class");
    const catById = new Map(((cats ?? []) as any[]).map((c) => [c.id, c]));
    const svcAllocs = new Map<string, { service: string | null; amount: number }[]>();
    for (const a of (allocs ?? []) as any[]) {
      const list = svcAllocs.get(a.transaction_id) ?? [];
      list.push({ service: a.service ?? null, amount: num(a.amount) });
      svcAllocs.set(a.transaction_id, list);
    }

    // Один напрямок на замовлення — детермінований fallback; змішані замовлення лишаються нерозподіленими.
    const orderServices = new Map<string, Set<string>>();
    for (const r of [...((orderSvc ?? []) as any[]), ...((zones ?? []) as any[])]) {
      if (!r.order_id || !r.service) continue;
      const s = orderServices.get(r.order_id) ?? new Set<string>();
      s.add(r.service);
      orderServices.set(r.order_id, s);
    }
    const soleService = (orderId: string | null) => {
      if (!orderId) return null;
      const s = orderServices.get(orderId);
      return s && s.size === 1 ? [...s][0]! : null;
    };

    const lines: EconLine[] = [];
    for (const t of (tx ?? []) as any[]) {
      if (t.kind === "transfer") continue;
      const cls = costClassOf(catById.get(t.category_id) ?? null) as any;
      const kind = t.kind === "income" ? "income" : "expense";
      const parts = svcAllocs.get(t.id);
      if (parts?.length) {
        for (const p of parts) lines.push({ service: p.service, orderId: t.order_id, kind, amount: p.amount, costClass: cls });
        const rest = r2(amt(t) - parts.reduce((s, p) => s + p.amount, 0));
        if (Math.abs(rest) > 0.01) lines.push({ service: null, orderId: t.order_id, kind, amount: rest, costClass: cls });
        continue;
      }
      lines.push({ service: t.service ?? soleService(t.order_id), orderId: t.order_id, kind, amount: amt(t), costClass: cls });
    }

    const quantities: EconQuantity[] = ((zones ?? []) as any[])
      .filter((z) => !z.archived && ["completed", "done", "handed_over"].includes(String(z.status ?? "")))
      .map((z) => ({ service: z.service ?? null, orderId: z.order_id, qty: num(z.area), unit: "м²" }));

    const res = serviceEconomics({ lines, quantities });
    return { ...res, directClasses: Object.keys(CANONICAL_TO_INTERNAL ?? {}).length ? undefined : undefined };
  });

/* ---------------------------- Кредиторка ---------------------------- */

export const getPayables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: obligations }, { data: tx }, { data: cps }, { data: invoices }] = await Promise.all([
      context.supabase.from("supplier_obligations").select("*"),
      context.supabase
        .from("finance_transactions")
        .select("id,kind,amount,amount_uah,op_date,payment_date,state,counterparty_id,order_id")
        .eq("kind", "expense"),
      context.supabase.from("finance_counterparties").select("id,name,kind"),
      context.supabase.from("finmap_invoices").select("id,finmap_id,number,counterparty_id,counterparty_name,amount,amount_uah,issue_date,due_date,status,order_id,match_status"),
    ]);

    const cpName = new Map(((cps ?? []) as any[]).map((c) => [c.id, c.name]));
    const groups = new Map<string, { supplier: string; counterpartyId: string | null; obligations: any[]; paid: any[]; scheduled: any[] }>();
    const key = (cpId: string | null, name: string | null) => cpId ?? `name:${name ?? "—"}`;

    for (const o of (obligations ?? []) as any[]) {
      const k = key(o.counterparty_id, o.supplier_name);
      const g = groups.get(k) ?? {
        supplier: (o.supplier_name ?? cpName.get(o.counterparty_id) ?? "—") as string,
        counterpartyId: o.counterparty_id as string | null,
        obligations: [] as any[], paid: [] as any[], scheduled: [] as any[],
      };
      g.obligations.push(o);
      groups.set(k, g);
    }
    for (const t of (tx ?? []) as any[]) {
      const k = key(t.counterparty_id, null);
      const g = groups.get(k);
      if (!g) continue; // витрата без зобовʼязання не створює борг заднім числом
      if (String(t.state) === "scheduled") g.scheduled.push({ amount: amt(t) });
      else g.paid.push({ amount: amt(t), date: cash(t) });
    }

    const rows = [...groups.values()].map((g) => ({
      supplier: g.supplier,
      counterpartyId: g.counterpartyId,
      ...computePayable({ obligations: g.obligations, actualPaid: g.paid, scheduledPayments: g.scheduled, today }),
    })).sort((a, b) => b.remaining - a.remaining);

    return {
      rows,
      totals: {
        obligations: r2(rows.reduce((s, r) => s + r.obligations, 0)),
        scheduled: r2(rows.reduce((s, r) => s + r.scheduled, 0)),
        paid: r2(rows.reduce((s, r) => s + r.paid, 0)),
        remaining: r2(rows.reduce((s, r) => s + r.remaining, 0)),
        overdue: r2(rows.reduce((s, r) => s + r.overdue, 0)),
      },
      invoices: (invoices ?? []) as any[],
    };
  });

const obligationInput = z.object({
  id: uuid.optional(),
  counterparty_id: uuid.nullish(),
  supplier_name: z.string().min(1).max(200),
  order_id: uuid.nullish(),
  finmap_invoice_id: uuid.nullish(),
  source: z.enum(["manual", "invoice", "procurement"]).default("manual"),
  amount: z.number().min(0),
  currency: z.string().max(10).default("UAH"),
  due_date: z.string().min(4).nullish(),
  status: z.enum(["open", "partial", "closed", "cancelled"]).default("open"),
  note: z.string().max(1000).nullish(),
});

/** Зобовʼязання перед постачальником — джерело ERP; рахунок Finmap не дублюється. */
export const saveSupplierObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => obligationInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("supplier_obligations").update(payload).eq("id", id).select().single()
      : await context.supabase.from("supplier_obligations").insert(payload).select().single();
    if (error) {
      console.error("saveSupplierObligation", error);
      throw new Error(error.code === "23505" ? "Для цього рахунку Finmap зобовʼязання вже створено" : "Не вдалося зберегти зобовʼязання");
    }
    await audit(context, { action: "supplier_obligation.save", entity_type: "supplier_obligation", entity_id: out.id, entity_label: out.supplier_name, new_value: out, financial_impact: out.amount });
    return out;
  });

/* ------------------------ Очікувані платежі ------------------------ */

export const getUpcomingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: sched }, { data: stages }, { data: obligations }] = await Promise.all([
      context.supabase
        .from("finance_transactions")
        .select("id,kind,amount,amount_uah,op_date,payment_date,state,order_id,counterparty:counterparty_id(name),category:category_id(name)")
        .eq("state", "scheduled"),
      context.supabase.from("order_payment_stages").select("id,order_id,due_date,amount,paid_amount,status").in("status", ["planned", "due", "partially_paid", "overdue"]),
      context.supabase.from("supplier_obligations").select("id,order_id,supplier_name,amount,due_date,status").in("status", ["open", "partial"]),
    ]);

    const rows: UpcomingRow[] = [];
    for (const t of (sched ?? []) as any[]) {
      rows.push({ ...toUpcomingRow({ ...t, counterparty_name: t.counterparty?.name ?? null, category_name: t.category?.name ?? null }) });
    }
    for (const s of (stages ?? []) as any[]) {
      const rest = r2(num(s.amount) - num(s.paid_amount));
      if (rest <= 0) continue;
      rows.push({ id: s.id, date: s.due_date ?? null, kind: "income", amount: rest, counterparty: null, category: "Етап договору", order_id: s.order_id, status: s.status ?? "planned", source: "erp" });
    }
    for (const o of (obligations ?? []) as any[]) {
      rows.push({ id: o.id, date: o.due_date ?? null, kind: "expense", amount: r2(num(o.amount)), counterparty: o.supplier_name, category: "Зобовʼязання постачальнику", order_id: o.order_id, status: o.status ?? "open", source: "erp" });
    }

    return { today, ...upcomingBuckets(rows, today) };
  });

/* ------------------- Канонічні управлінські KPI ------------------- */

/** Єдине джерело KPI для Finance Overview і Dashboard — жодних окремих формул. */
export const getManagementKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: accounts }, { data: tx }, { data: sched }, { data: stages }, { data: obligations }, { data: payroll }] = await Promise.all([
      context.supabase.from("finance_accounts").select("id,name,currency,opening_balance,actual_balance").eq("archived", false),
      context.supabase.from("finance_transactions").select("kind,amount,amount_uah,op_date,payment_date,state").eq("state", "actual").gte("op_date", data.from).lte("op_date", data.to),
      context.supabase.from("finance_transactions").select("kind,amount,amount_uah,op_date,payment_date,state").eq("state", "scheduled"),
      context.supabase.from("order_payment_stages").select("amount,paid_amount,due_date,status"),
      context.supabase.from("supplier_obligations").select("amount,due_date,status"),
      context.supabase.from("payroll_calculations").select("total_payable,paid_amount,period:period_id(period)"),
    ]);

    const rows = ((tx ?? []) as any[]).filter((r) => r.kind !== "transfer");
    const income = r2(rows.filter((r) => r.kind === "income").reduce((s, r) => s + amt(r), 0));
    const expense = r2(rows.filter((r) => r.kind === "expense").reduce((s, r) => s + amt(r), 0));

    const within30 = (r: any) => { const d = cash(r); return !!d && d >= today && d <= in30; };
    const schedRows = (sched ?? []) as any[];
    const scheduledReceipts30 = r2(schedRows.filter((r) => r.kind === "income" && within30(r)).reduce((s, r) => s + amt(r), 0));
    const scheduledPayments30 = r2(schedRows.filter((r) => r.kind === "expense" && within30(r)).reduce((s, r) => s + amt(r), 0));

    const st = ((stages ?? []) as any[]).filter((s) => s.status !== "cancelled");
    const rest = (s: any) => Math.max(num(s.amount) - num(s.paid_amount), 0);
    const receivableRemaining = r2(st.reduce((s, x) => s + rest(x), 0));
    const receivableDue = r2(st.filter((x) => x.due_date && x.due_date <= today).reduce((s, x) => s + rest(x), 0));
    const receivableOverdue = r2(st.filter((x) => x.due_date && x.due_date < today).reduce((s, x) => s + rest(x), 0));

    const ob = ((obligations ?? []) as any[]).filter((o) => !["cancelled", "closed"].includes(String(o.status)));
    const payableRemaining = r2(ob.reduce((s, o) => s + num(o.amount), 0));
    const payableOverdue = r2(ob.filter((o) => o.due_date && o.due_date < today).reduce((s, o) => s + num(o.amount), 0));

    const pay = ((payroll ?? []) as any[]).filter((p) => {
      const per = p.period?.period as string | undefined;
      return !!per && per >= String(data.from).slice(0, 10) && per <= String(data.to).slice(0, 10);
    });
    const payrollAccrued = r2(pay.reduce((s, p) => s + num(p.total_payable), 0));
    const payrollPaid = r2(pay.reduce((s, p) => s + num(p.paid_amount), 0));

    return {
      period: { from: data.from, to: data.to },
      cashBalance: r2(((accounts ?? []) as any[]).reduce((s, a) => s + num(a.actual_balance ?? a.opening_balance), 0)),
      income, expense, profit: r2(income - expense),
      receivableRemaining, receivableDue, receivableOverdue,
      payableRemaining, payableOverdue,
      payrollAccrued, payrollPaid, payrollRemaining: r2(Math.max(payrollAccrued - payrollPaid, 0)),
      scheduledReceipts30, scheduledPayments30,
    };
  });

/* --------------------- Ручний розподіл (override) --------------------- */

const allocationInput = z.object({
  transaction_id: uuid,
  dimension: z.enum(["project", "category", "service"]),
  parts: z.array(z.object({
    ref: z.string().max(120).nullish(),
    name: z.string().max(300).nullish(),
    order_id: uuid.nullish(),
    category_id: uuid.nullish(),
    service: z.string().max(60).nullish(),
    amount: z.number().nullish(),
    share: z.number().nullish(),
  })).max(20),
});

/** Ручний розподіл TERZI має пріоритет над детермінованим мапінгом і пишеться в аудит. */
export const saveManualAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => allocationInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: tx, error: te } = await context.supabase
      .from("finance_transactions").select("id,amount,amount_uah").eq("id", data.transaction_id).maybeSingle();
    if (te || !tx) throw new Error("Операцію не знайдено");

    const total = amt(tx);
    const { parts, unallocated } = splitAmount(total, data.parts.map((p) => ({ id: p.ref ?? p.service ?? null, name: p.name, sum: p.amount, share: p.share })));
    const { data: before } = await context.supabase.from("finance_allocations").select("*").eq("transaction_id", tx.id).eq("dimension", data.dimension);

    await context.supabase.from("finance_allocations").delete().eq("transaction_id", tx.id).eq("dimension", data.dimension);
    if (parts.length) {
      const payload = parts.map((p, i) => ({
        transaction_id: tx.id,
        dimension: data.dimension,
        ref_finmap_id: p.ref,
        ref_name: p.name,
        order_id: data.parts[i]?.order_id ?? null,
        category_id: data.parts[i]?.category_id ?? null,
        service: data.parts[i]?.service ?? null,
        amount: p.amount,
        share: p.share,
        source: "manual",
        status: "ok",
        created_by: context.userId,
      }));
      const { error } = await context.supabase.from("finance_allocations").insert(payload);
      if (error) { console.error("saveManualAllocation", error); throw new Error("Не вдалося зберегти розподіл"); }
    }

    const status = parts.length === 0 ? "none" : Math.abs(unallocated) <= 0.01 ? "manual" : "partial";
    await context.supabase.from("finance_transactions").update({ allocation_status: status }).eq("id", tx.id);
    await audit(context, {
      action: "finance.allocation.manual", entity_type: "finance_transaction", entity_id: tx.id,
      old_value: before ?? null, new_value: { dimension: data.dimension, parts }, financial_impact: total,
    });
    return { ok: true, parts, unallocated, allocation_status: status };
  });

/* --------------------- Розширена звірка (Reconciliation) --------------------- */

/** Додаткові пункти звірки Етапу 2: розподіли, рахунки, зобовʼязання, ФОП. */
export const getManagementReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const [{ data: tx }, { data: invoices }, { data: obligations }, { data: cps }, { data: payrollPayments }] = await Promise.all([
      context.supabase
        .from("finance_transactions")
        .select("id,kind,amount,amount_uah,state,service,order_id,allocation_status,category_id")
        .eq("state", "actual").limit(20000),
      context.supabase.from("finmap_invoices").select("id,number,amount,amount_uah,order_id,match_status,counterparty_id"),
      context.supabase.from("supplier_obligations").select("id,supplier_name,amount,status,counterparty_id"),
      context.supabase.from("finance_counterparties").select("id,name,finmap_kind,employee_id,client_id"),
      context.supabase.from("payroll_payments").select("id,amount,calculation_id"),
    ]);

    const rows = ((tx ?? []) as any[]).filter((t) => t.kind !== "transfer");
    const agg = (list: any[]) => ({ count: list.length, amount: r2(list.reduce((s, t) => s + amt(t), 0)) });

    const noService = rows.filter((t) => !t.service && !["manual", "full"].includes(String(t.allocation_status)));
    const partial = rows.filter((t) => t.allocation_status === "partial");
    const needsReview = rows.filter((t) => t.allocation_status === "needs_review");

    const invList = (invoices ?? []) as any[];
    const employees = ((cps ?? []) as any[]).filter((c) => c.finmap_kind === "employee" && !c.employee_id);
    const payments = (payrollPayments ?? []) as any[];

    return {
      transactionsWithoutService: agg(noService),
      incompleteAllocation: agg(partial),
      allocationNeedsReview: agg(needsReview),
      invoicesWithoutErp: {
        count: invList.filter((i) => !i.order_id && i.match_status !== "matched").length,
        amount: r2(invList.filter((i) => !i.order_id && i.match_status !== "matched").reduce((s, i) => s + num(i.amount_uah ?? i.amount), 0)),
      },
      obligationsWithoutPayment: {
        count: ((obligations ?? []) as any[]).filter((o) => o.status === "open").length,
        amount: r2(((obligations ?? []) as any[]).filter((o) => o.status === "open").reduce((s, o) => s + num(o.amount), 0)),
      },
      employeesWithoutErp: { count: employees.length, rows: employees.slice(0, 50).map((c) => ({ id: c.id, name: c.name })) },
      payrollPaymentsWithoutRelation: {
        count: payments.filter((p) => !p.calculation_id).length,
        amount: r2(payments.filter((p) => !p.calculation_id).reduce((s, p) => s + num(p.amount), 0)),
      },
    };
  });
