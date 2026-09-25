import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { costClassOf } from "./cost-class";
import { planFromEstimates } from "./core";
import { buildCeoFinance, directionOf, type OrderFin } from "./ceo-finance";

const num = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const ACTIVE = new Set(["preparation", "awaiting_materials", "ready_to_plan", "planned", "crew_assigned", "in_progress", "paused", "works_done", "acceptance", "remarks"]);

/** Фінансовий екран CEO за період. Лише для фінансових ролей; всі рядки агрегуються на сервері. */
export const getCeoFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: ok, error: aErr } = await sb.rpc("is_finance_user", { _uid: context.userId });
    if (aErr) throw new Error("Не вдалося перевірити права доступу");
    if (ok !== true) throw new Error("Немає доступу до фінансових даних");

    const periods: string[] = [];
    for (let d = new Date(`${data.from.slice(0, 7)}-01T00:00:00Z`); d <= new Date(`${data.to}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
      periods.push(d.toISOString().slice(0, 7));
    }

    const [txR, ordersR, estR, svcR, catR, accR, invR, anR, perR] = await Promise.all([
      sb.from("finance_transactions").select("order_id,kind,amount,amount_uah,category_id").gte("op_date", data.from).lte("op_date", data.to).limit(50000),
      sb.from("orders").select("id,production_status").limit(10000),
      sb.from("estimates").select("id,order_id,total_client,total_cost,status,created_at,approved_at").not("order_id", "is", null).limit(30000),
      sb.from("order_services").select("order_id,service").limit(30000),
      sb.from("finance_categories").select("id,name,cost_class").limit(3000),
      sb.from("finance_accounts").select("actual_balance,opening_balance,archived,currency").eq("archived", false),
      sb.from("invoices").select("total,paid,status,due_date").not("status", "in", "(cancelled,draft)").limit(20000),
      sb.rpc("analytics_overview", { p_from: data.from, p_to: data.to }),
      sb.from("payroll_periods").select("id,period").in("period", periods),
    ]);
    for (const r of [txR, ordersR, estR, svcR, catR, accR, invR]) if (r.error) throw new Error(r.error.message);

    const cat = new Map(((catR.data ?? []) as any[]).map((c) => [c.id, c]));
    let cashIn = 0, cashOut = 0, commercial = 0, overhead = 0, taxes = 0, financing = 0, unlinkedPayroll = 0;
    const fact = new Map<string, { income: number; expense: number }>();
    for (const t of (txR.data ?? []) as any[]) {
      if (t.kind === "transfer") continue;
      const v = num(t.amount_uah ?? t.amount);
      if (t.kind === "income") cashIn += v; else cashOut += v;
      if (t.order_id) {
        const f = fact.get(t.order_id) ?? { income: 0, expense: 0 };
        if (t.kind === "income") f.income += v; else f.expense += v;
        fact.set(t.order_id, f);
        continue;
      }
      if (t.kind !== "expense") continue;
      const cls = costClassOf(cat.get(t.category_id) ?? null);
      if (cls === "marketing") commercial += v;
      else if (cls === "taxes") taxes += v;
      else if (cls === "financing") financing += v;
      else { overhead += v; if (cls === "payroll") unlinkedPayroll += v; }
    }

    const estBy = new Map<string, any[]>();
    for (const e of (estR.data ?? []) as any[]) estBy.set(e.order_id, [...(estBy.get(e.order_id) ?? []), e]);
    const svcBy = new Map<string, string[]>();
    for (const s of (svcR.data ?? []) as any[]) svcBy.set(s.order_id, [...(svcBy.get(s.order_id) ?? []), s.service]);

    let mixed = 0, unknownDir = 0;
    const orders: OrderFin[] = [];
    for (const o of (ordersR.data ?? []) as any[]) {
      const p = planFromEstimates(estBy.get(o.id) ?? []);
      const f = fact.get(o.id) ?? { income: 0, expense: 0 };
      const active = ACTIVE.has(o.production_status ?? "");
      if (!active && !f.income && !f.expense) continue;
      const dir = directionOf(svcBy.get(o.id) ?? []);
      if (f.income || f.expense) { if (dir.mixed) mixed++; if (dir.unknown) unknownDir++; }
      orders.push({ orderId: o.id, direction: dir.key, planRevenue: num(p.revenue), planCost: num(p.cost), factRevenue: f.income, factCost: f.expense, active });
    }

    const built = buildCeoFinance({ period: `${data.from}..${data.to}`, orders, commercial, overhead, taxes });

    const accounts = (accR.data ?? []) as any[];
    const withBalance = accounts.filter((a) => a.actual_balance != null && (a.currency ?? "UAH") === "UAH");
    const now = new Date();
    const inv = (invR.data ?? []) as any[];
    const receivable = r2(inv.reduce((s, i) => s + Math.max(num(i.total) - num(i.paid), 0), 0));
    const overdue = r2(inv.filter((i) => i.due_date && new Date(i.due_date) < now).reduce((s, i) => s + Math.max(num(i.total) - num(i.paid), 0), 0));

    // Продажі — з канонічного analytics_overview (той самий, що й CEO-звіт).
    const kpi = ((anR.data as any)?.kpi ?? {}) as Record<string, number | null>;
    const k = (n: string) => (kpi[n] == null ? null : Number(kpi[n]));
    const spend = k("marketing_spend"), leads = k("leads"), meas = k("measurements_completed"), contracts = k("contracts");
    const div = (a: number | null, b: number | null) => (a != null && b ? r2(a / b) : null);

    // ФОТ за групами — нарахування (не гроші), з розрахунків зарплати за місяці періоду.
    const periodIds = ((perR.data ?? []) as any[]).map((p) => p.id);
    const groups: Record<string, { base: number; kpi: number; bonus: number; total: number; paid: number; people: number }> = {
      production: { base: 0, kpi: 0, bonus: 0, total: 0, paid: 0, people: 0 },
      commercial: { base: 0, kpi: 0, bonus: 0, total: 0, paid: 0, people: 0 },
      administrative: { base: 0, kpi: 0, bonus: 0, total: 0, paid: 0, people: 0 },
    };
    let payrollAvailable = false;
    if (periodIds.length) {
      const { data: calcs } = await sb.from("payroll_calculations").select("payroll_group,base_amount,kpi_amount,bonus_amount,total_payable,paid_amount").in("period_id", periodIds);
      for (const c of (calcs ?? []) as any[]) {
        const g = groups[c.payroll_group];
        if (!g) continue;
        payrollAvailable = true;
        g.base += num(c.base_amount); g.kpi += num(c.kpi_amount); g.bonus += num(c.bonus_amount);
        g.total += num(c.total_payable); g.paid += num(c.paid_amount); g.people += 1;
      }
    }

    return {
      company: {
        ...built.company,
        cashIn: r2(cashIn), cashOut: r2(cashOut),
        cashBalance: withBalance.length ? r2(withBalance.reduce((s, a) => s + num(a.actual_balance), 0)) : null,
        receivable, receivableOverdue: overdue,
        commercial: r2(commercial), overhead: r2(overhead), financing: r2(financing), unlinkedPayroll: r2(unlinkedPayroll),
      },
      sales: {
        available: !anR.error,
        leads, measurements: meas, contracts, contractValue: k("contract_value"), spend,
        cpl: div(spend, leads), cac: div(spend, contracts), costPerMeasurement: div(spend, meas),
        conversion: leads && contracts != null ? r2((contracts / leads) * 100) : null,
      },
      production: built.production,
      directions: built.directions,
      directionNotes: { mixed, unknown: unknownDir },
      payroll: payrollAvailable ? Object.fromEntries(Object.entries(groups).map(([k2, g]) => [k2, {
        base: r2(g.base), kpi: r2(g.kpi), bonus: r2(g.bonus), total: r2(g.total), paid: r2(g.paid), people: g.people,
      }])) : null,
    };
  });
