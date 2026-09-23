import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const monthRe = /^\d{4}-\d{2}$/;
const CONTRACT_STATUSES = ["contract", "awaiting_prepayment", "sold"];
const MEAS_DONE = ["completed", "done"];

function monthKey(d: Date) { return d.toISOString().slice(0, 7); }
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthKey(d);
}
const startOf = (ym: string) => `${ym}-01`;

/** Фактичні дані для калькулятора. Відсутнє → null, ніколи не вигадується. */
export const getMarketingCalculatorFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ month: z.string().regex(monthRe) }).parse(v))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const month = data.month;
    const firstPrev = addMonths(month, -10);
    const nextMonth = addMonths(month, 1);

    // Надходження Finmap (cash) по місяцях, без фінансових операцій.
    const { data: fcats } = await db.from("finance_categories").select("id").eq("cost_class", "financing");
    const excluded = new Set((fcats ?? []).map((c) => c.id));
    const { data: income, error: incErr } = await db.from("finance_transactions")
      .select("op_date,amount_uah,amount,category_id").eq("kind", "income")
      .gte("op_date", startOf(firstPrev)).lt("op_date", startOf(month)).limit(10000);
    const byMonth = new Map<string, number>();
    for (const t of income ?? []) {
      if (t.category_id && excluded.has(t.category_id)) continue;
      const k = String(t.op_date).slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(t.amount_uah ?? t.amount ?? 0));
    }
    const monthsList = Array.from({ length: 10 }, (_, i) => addMonths(month, i - 10));
    const revenue = monthsList.map((m) => ({ month: m, value: incErr ? null : byMonth.has(m) ? byMonth.get(m)! : null }));

    // Потокові конверсії за 90 днів до планового місяця.
    const convFrom = new Date(Date.parse(startOf(month)) - 90 * 86400000).toISOString();
    const convTo = new Date(Date.parse(startOf(month))).toISOString();
    const cnt = async (q: any) => { const { count, error } = await q; return error ? null : count ?? 0; };
    const [leads90, meas90, est90, contracts90] = await Promise.all([
      cnt(db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", convFrom).lt("created_at", convTo)),
      cnt(db.from("order_measurements").select("id", { count: "exact", head: true }).in("status", MEAS_DONE as any).gte("created_at", convFrom).lt("created_at", convTo)),
      cnt(db.from("estimates").select("id", { count: "exact", head: true }).gte("created_at", convFrom).lt("created_at", convTo)),
      cnt(db.from("orders").select("id", { count: "exact", head: true }).in("commercial_status", CONTRACT_STATUSES as any).gte("created_at", convFrom).lt("created_at", convTo)),
    ]);
    const ratio = (a: number | null, b: number | null) => (a != null && b ? Math.min(100, (a / b) * 100) : null);

    const { data: sold } = await db.from("orders").select("amount_total")
      .in("commercial_status", CONTRACT_STATUSES as any).gte("created_at", startOf(addMonths(month, -5))).lt("created_at", startOf(month)).limit(5000);
    const vals = (sold ?? []).map((o) => Number(o.amount_total ?? 0)).filter((v) => v > 0);
    const avgContractValue = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

    // Поточний (плановий) місяць — факт.
    const mFrom = startOf(month); const mTo = startOf(nextMonth);
    const { data: spendRows } = await db.from("marketing_daily_metrics").select("spend").gte("date", mFrom).lt("date", mTo).limit(20000);
    const spendFact = (spendRows ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
    const [leadsM, measM, contractsM] = await Promise.all([
      cnt(db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", mFrom).lt("created_at", mTo)),
      cnt(db.from("order_measurements").select("id", { count: "exact", head: true }).in("status", MEAS_DONE as any).gte("created_at", mFrom).lt("created_at", mTo)),
      cnt(db.from("orders").select("id", { count: "exact", head: true }).in("commercial_status", CONTRACT_STATUSES as any).gte("created_at", mFrom).lt("created_at", mTo)),
    ]);
    // Атрибутована виручка: договори місяця, пов'язані з лідом, що має маркетинговий канал.
    const { data: attrLeads } = await db.from("crm_leads").select("order_id").not("order_id", "is", null).not("marketing_channel_id", "is", null).limit(10000);
    const attrOrderIds = new Set((attrLeads ?? []).map((l) => l.order_id as string));
    const { data: monthOrders } = await db.from("orders").select("id,amount_total")
      .in("commercial_status", CONTRACT_STATUSES as any).gte("created_at", mFrom).lt("created_at", mTo).limit(5000);
    const attributedRevenue = (monthOrders ?? []).filter((o) => attrOrderIds.has(o.id)).reduce((s, o) => s + Number(o.amount_total ?? 0), 0);

    // Якість атрибуції (весь масив лідів за 90 днів).
    const [withChannel, withCampaign, withUtm] = await Promise.all([
      cnt(db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", convFrom).lt("created_at", convTo).not("marketing_channel_id", "is", null)),
      cnt(db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", convFrom).lt("created_at", convTo).not("marketing_campaign_id", "is", null)),
      cnt(db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", convFrom).lt("created_at", convTo).not("utm", "is", null)),
    ]);
    const { data: soldAll } = await db.from("orders").select("id").in("commercial_status", CONTRACT_STATUSES as any).gte("created_at", convFrom).lt("created_at", convTo).limit(5000);
    const soldLinked = (soldAll ?? []).filter((o) => attrOrderIds.has(o.id)).length;
    const { data: lastSync } = await db.from("marketing_daily_metrics").select("synced_at,date").order("synced_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();

    return {
      month,
      revenue,
      funnel: {
        leads90, meas90, est90, contracts90,
        leadToMeasPct: ratio(meas90, leads90),
        measToEstPct: ratio(est90, meas90),
        estToContractPct: ratio(contracts90, est90),
      },
      avgContractValue,
      current: { spendFact, leads: leadsM, measurements: measM, contracts: contractsM, attributedRevenue, actualCpl: leadsM ? spendFact / leadsM : null },
      health: {
        leadsTotal: leads90,
        channelSharePct: ratio(withChannel, leads90),
        campaignSharePct: ratio(withCampaign, leads90),
        utmSharePct: ratio(withUtm, leads90),
        contractsLinkedPct: ratio(soldLinked, soldAll?.length ?? null),
        lastSyncAt: lastSync?.synced_at ?? null,
        lastMetricDate: lastSync?.date ?? null,
      },
    };
  });

export const listCalculatorSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ month: z.string().regex(monthRe) }).parse(v))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase.from("marketing_calculator_snapshots")
      .select("id,plan_month,version,inputs,outputs,sources,engine_version,created_by_name,created_at")
      .eq("plan_month", data.month).order("version", { ascending: false });
    if (error) throw new Error("Не вдалося завантажити історію планів");
    return rows ?? [];
  });

export const saveCalculatorSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    month: z.string().regex(monthRe),
    inputs: z.record(z.string(), z.any()),
    outputs: z.record(z.string(), z.any()),
    sources: z.record(z.string(), z.any()),
    engineVersion: z.string().max(40),
  }).parse(v))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { data: last } = await db.from("marketing_calculator_snapshots").select("version")
      .eq("plan_month", data.month).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: profile } = await db.from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
    const { data: row, error } = await db.from("marketing_calculator_snapshots").insert({
      plan_month: data.month, version: (last?.version ?? 0) + 1, inputs: data.inputs, outputs: data.outputs,
      sources: data.sources, engine_version: data.engineVersion, created_by: context.userId,
      created_by_name: profile?.display_name ?? null,
    }).select("id,version").single();
    if (error) throw new Error("Не вдалося зафіксувати план");
    return row;
  });
