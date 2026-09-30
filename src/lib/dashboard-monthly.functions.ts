/**
 * Помісячні підсумки CEO: кеш-результат і EBITDA з Finmap, замовлення, воронка і ROMI за джерелами.
 * Усі розрахунки детерміновані; фінанси повертаються тільки ролям із доступом до внутрішніх фінансів.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveChannel } from "@/lib/marketing/channels";

const CONTRACT = ["contract", "awaiting_prepayment", "sold"];
/** Статті, що не входять в EBITDA (податки, відсотки, кредити, амортизація, дивіденди). */
const NON_EBITDA = /налог|податк|єсв|есв|дивиденд|дивіденд|кредит|процент|відсот|амортиз/i;
const SPEND_MAP: [RegExp, string][] = [
  [/google|гугл/i, "Google Ads"], [/facebook|meta|инстаграм|instagram/i, "Meta Ads"],
  [/олх|olx/i, "OLX"], [/тикток|tiktok|тікток/i, "TikTok Ads"],
];
const label = (raw: unknown) => resolveChannel({ source: raw })?.label ?? "Інше / не вказано";

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

export const getMonthlySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), months: z.number().int().min(1).max(12).default(6) }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const [y, m] = data.month.split("-").map(Number);
    const startDate = new Date(Date.UTC(y, m - data.months, 1)).toISOString().slice(0, 10);
    const monthFrom = `${data.month}-01`;
    const monthTo = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const { data: isFin } = await sb.rpc("is_finance_user", { _uid: context.userId });

    const [orders, leads, meas] = await Promise.all([
      fetchAll<any>((a, b) => sb.from("orders").select("id,source,amount_total,paid_total,commercial_status,ordered_at,created_at")
        .or(`ordered_at.gte.${startDate},and(ordered_at.is.null,created_at.gte.${startDate})`).range(a, b)),
      fetchAll<any>((a, b) => sb.from("crm_leads").select("id,source").gte("created_at", monthFrom).lt("created_at", monthTo).range(a, b)),
      fetchAll<any>((a, b) => sb.from("order_measurements").select("id,lead_id,status,measured_at,scheduled_at,created_at")
        .gte("created_at", monthFrom).lt("created_at", monthTo).range(a, b)),
    ]);

    const monthsKeys: string[] = [];
    for (let i = data.months - 1; i >= 0; i--) monthsKeys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
    const months = new Map(monthsKeys.map((k) => [k, { month: k, orders: 0, ordersValue: 0, income: null as number | null, expense: null as number | null, cashProfit: null as number | null, ebitda: null as number | null, marketing: null as number | null }]));

    const bySource = new Map<string, { source: string; leads: number; measurements: number; orders: number; value: number; paid: number; spend: number | null }>();
    const src = (k: string) => { let e = bySource.get(k); if (!e) { e = { source: k, leads: 0, measurements: 0, orders: 0, value: 0, paid: 0, spend: null }; bySource.set(k, e); } return e; };

    let fOrders = 0, fValue = 0, fPaid = 0;
    for (const o of orders) {
      if (!CONTRACT.includes(o.commercial_status)) continue;
      const k = String(o.ordered_at ?? o.created_at).slice(0, 7);
      const row = months.get(k); if (!row) continue;
      row.orders++; row.ordersValue += Number(o.amount_total || 0);
      if (k === data.month) {
        const e = src(label(o.source)); e.orders++; e.value += Number(o.amount_total || 0); e.paid += Number(o.paid_total || 0);
        fOrders++; fValue += Number(o.amount_total || 0); fPaid += Number(o.paid_total || 0);
      }
    }
    const leadSrc = new Map<string, string>();
    for (const l of leads) { const k = label(l.source); leadSrc.set(l.id, k); src(k).leads++; }
    const missing = meas.filter((x) => x.lead_id && !leadSrc.has(x.lead_id)).map((x) => x.lead_id);
    if (missing.length) {
      for (let i = 0; i < missing.length; i += 200) {
        const { data: ls } = await sb.from("crm_leads").select("id,source").in("id", missing.slice(i, i + 200));
        for (const l of ls ?? []) leadSrc.set(l.id, label(l.source));
      }
    }
    let fMeas = 0;
    for (const x of meas) {
      if (["canceled", "cancelled"].includes(x.status)) continue;
      fMeas++; src(x.lead_id ? leadSrc.get(x.lead_id) ?? "Інше / не вказано" : "Без ліда").measurements++;
    }

    if (isFin) {
      const [tx, cats] = await Promise.all([
        fetchAll<any>((a, b) => sb.from("finance_transactions").select("kind,op_date,amount_uah,category_id").eq("state", "actual")
          .gte("op_date", startDate).lte("op_date", today).in("kind", ["income", "expense"]).range(a, b)),
        fetchAll<any>((a, b) => sb.from("finance_categories").select("id,name").range(a, b)),
      ]);
      const catName = new Map(cats.map((c: any) => [c.id, String(c.name ?? "")]));
      for (const r of months.values()) { r.income = 0; r.expense = 0; r.ebitda = 0; r.marketing = 0; }
      for (const t of tx) {
        const row = months.get(String(t.op_date).slice(0, 7)); if (!row) continue;
        const amt = Math.abs(Number(t.amount_uah || 0));
        const name = catName.get(t.category_id) ?? "";
        if (t.kind === "income") { row.income! += amt; row.ebitda! += amt; continue; }
        row.expense! += amt;
        if (!NON_EBITDA.test(name)) row.ebitda! -= amt;
        const isAd = /реклам|маркет|olx|олх/i.test(name);
        if (isAd) row.marketing! += amt;
        if (isAd && row.month === data.month) {
          const hit = SPEND_MAP.find(([re]) => re.test(name));
          if (hit) { const e = src(hit[1]); e.spend = (e.spend ?? 0) + amt; }
        }
      }
      for (const r of months.values()) r.cashProfit = r.income! - r.expense!;
    }

    const sources = [...bySource.values()].map((s) => ({
      ...s,
      romi: s.spend && s.spend > 0 ? Math.round(((s.value - s.spend) / s.spend) * 100) : null,
    })).sort((a, b) => b.value - a.value || b.leads - a.leads);

    return {
      finance: Boolean(isFin),
      months: [...months.values()],
      sources,
      funnel: { leads: leads.length, measurements: fMeas, orders: fOrders, value: fValue, paid: fPaid },
    };
  });
