/**
 * Плани прорабів + «Планування vs факт» (менеджери й прораби).
 * Факт = замовлення зі статусом contract / awaiting_prepayment / sold, місяць за ordered_at (fallback created_at).
 * Детерміновано, без AI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WON = ["contract", "awaiting_prepayment", "sold"];
const monthRe = /^\d{4}-\d{2}/;

function monthBounds(month: string) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}`, ym, days: last };
}

async function wonOrders(sb: any, month: string) {
  const { ym } = monthBounds(month);
  const out: any[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await sb.from("orders")
      .select("id,amount_total,manager_id,management_data,commercial_status,ordered_at,created_at")
      .in("commercial_status", WON).range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out.filter((o) => String(o.ordered_at ?? o.created_at ?? "").slice(0, 7) === ym);
}

async function canWrite(sb: any, uid: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", uid);
  const r = (data ?? []).map((x: any) => x.role);
  return r.includes("admin") || r.includes("director") || r.includes("finance");
}

export const listForemenPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(monthRe) }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const { start } = monthBounds(data.month);
    const [{ data: lines }, { data: orders }] = await Promise.all([
      sb.from("sales_plan_foremen").select("foreman_name,target,target_orders").eq("month", start),
      sb.from("orders").select("management_data").not("management_data->>foreman_name", "is", null).limit(5000),
    ]);
    const names = new Set<string>();
    for (const o of orders ?? []) {
      const n = String(o.management_data?.foreman_name ?? "").trim();
      if (n) names.add(n);
    }
    const map = new Map((lines ?? []).map((l: any) => [l.foreman_name, l]));
    for (const k of map.keys()) names.add(k as string);
    return {
      month: start,
      editable: await canWrite(sb, context.userId),
      foremen: [...names].sort((a, b) => a.localeCompare(b, "uk")).map((n) => {
        const l: any = map.get(n);
        return { name: n, target: Number(l?.target ?? 0), target_orders: Number(l?.target_orders ?? 0) };
      }),
    };
  });

export const upsertForemenTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    month: z.string().regex(monthRe),
    lines: z.array(z.object({
      name: z.string().trim().min(1).max(120),
      target: z.number().min(0),
      target_orders: z.number().int().min(0),
    })).max(200),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    if (!(await canWrite(sb, context.userId))) throw new Error("Немає права редагувати план");
    const { start } = monthBounds(data.month);
    const rows = data.lines.map((l) => ({
      month: start, foreman_name: l.name, target: l.target, target_orders: l.target_orders,
      updated_at: new Date().toISOString(), updated_by: context.userId,
    }));
    if (rows.length) {
      const { error } = await sb.from("sales_plan_foremen").upsert(rows, { onConflict: "month,foreman_name" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getPlanVsFact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(monthRe), today: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const { start, ym, days } = monthBounds(data.month);
    const [orders, { data: mLines }, { data: fLines }, { data: profiles }, { data: company }] = await Promise.all([
      wonOrders(sb, data.month),
      sb.from("sales_plan_managers").select("user_id,target").eq("month", start),
      sb.from("sales_plan_foremen").select("foreman_name,target,target_orders").eq("month", start),
      sb.from("profiles").select("user_id,display_name,email"),
      sb.from("sales_plan_months").select("company_target").eq("month", start).maybeSingle(),
    ]);
    const pName = new Map((profiles ?? []).map((p: any) => [p.user_id, p.display_name ?? p.email ?? "—"]));

    // Прогноз: лінійна екстраполяція для поточного місяця
    const today = data.today ?? new Date().toISOString().slice(0, 10);
    const elapsed = today.slice(0, 7) === ym ? Math.max(1, Number(today.slice(8, 10))) : today.slice(0, 7) > ym ? days : 0;
    const forecast = (fact: number) => (elapsed === 0 ? null : elapsed >= days ? fact : Math.round((fact / elapsed) * days));

    type Row = { key: string; name: string; fact: number; deals: number; plan: number | null; planDeals: number | null };
    const mgr = new Map<string, Row>();
    const frm = new Map<string, Row>();
    for (const l of mLines ?? []) mgr.set(l.user_id, { key: l.user_id, name: String(pName.get(l.user_id) ?? "—"), fact: 0, deals: 0, plan: Number(l.target) || null, planDeals: null });
    for (const l of fLines ?? []) frm.set(l.foreman_name, { key: l.foreman_name, name: l.foreman_name, fact: 0, deals: 0, plan: Number(l.target) || null, planDeals: Number(l.target_orders) || null });
    let total = 0;
    for (const o of orders) {
      const amt = Number(o.amount_total || 0);
      total += amt;
      const mk = o.manager_id ?? "none";
      let r = mgr.get(mk);
      if (!r) { r = { key: mk, name: o.manager_id ? String(pName.get(o.manager_id) ?? "—") : "Без менеджера", fact: 0, deals: 0, plan: null, planDeals: null }; mgr.set(mk, r); }
      r.fact += amt; r.deals++;
      const fn = String(o.management_data?.foreman_name ?? "").trim() || "Без прораба";
      let f = frm.get(fn);
      if (!f) { f = { key: fn, name: fn, fact: 0, deals: 0, plan: null, planDeals: null }; frm.set(fn, f); }
      f.fact += amt; f.deals++;
    }
    const finish = (m: Map<string, Row>) => [...m.values()]
      .filter((r) => r.fact > 0 || r.plan)
      .map((r) => ({ ...r, pct: r.plan ? (r.fact / r.plan) * 100 : null, forecast: forecast(r.fact) }))
      .sort((a, b) => (b.plan ?? 0) - (a.plan ?? 0) || b.fact - a.fact);
    const companyPlan = company ? Number((company as any).company_target) || null : null;
    return {
      month: start, elapsedDays: elapsed, days,
      company: { plan: companyPlan, fact: total, deals: orders.length, pct: companyPlan ? (total / companyPlan) * 100 : null, forecast: forecast(total) },
      managers: finish(mgr),
      foremen: finish(frm),
      factLabel: "Факт = сума замовлень зі статусом «Договір / Очікує аванс / Продано» за датою замовлення.",
    };
  });
