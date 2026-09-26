/**
 * Наскрізна маркетингова економіка: канал/кампанія → заявки → замовлення → гроші.
 *
 * Джерела правди не дублюються:
 *   витрати реклами  — `marketing_daily_metrics` (плюс ручні витрати);
 *   заявки й канал   — `crm_leads` (канонічна атрибуція);
 *   замовлення       — `orders` (канонічний об'єкт, зв'язок через лід або замір);
 *   гроші            — `finance_transactions` (Finmap, state = actual).
 *
 * Два часові режими:
 *   cohort — заявки періоду з усіма їх подальшими надходженнями й витратами;
 *   cash   — фактичні гроші періоду, розкручені назад до каналу заявки.
 *
 * Собівартість, валовий прибуток і ROMI від GP — внутрішні фінансові дані:
 * віддаються лише користувачам із фінансовим доступом.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEconomyRows, totalEconomy, type EconomySlice } from "./economics";

const num = (v: unknown) => Number(v) || 0;
const NO_ATTR = "__none__";

const input = z.object({
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
  timing: z.enum(["cohort", "cash"]).default("cohort"),
  dim: z.enum(["channel", "campaign"]).default("channel"),
});

export const getMarketingEconomics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const fromTs = `${data.from}T00:00:00.000Z`;
    const toTs = `${data.to}T23:59:59.999Z`;

    const { data: isFinance } = await sb.rpc("is_finance_user", { _uid: context.userId });
    const internal = isFinance === true;

    /* --- 1. Рекламні витрати й трафік за період --- */
    const [{ data: metrics }, { data: channels }, { data: campaigns }] = await Promise.all([
      sb.from("marketing_daily_metrics").select("channel_id, campaign_id, spend, clicks, impressions")
        .gte("date", data.from).lte("date", data.to).limit(20000),
      sb.from("marketing_channels").select("id, name"),
      sb.from("marketing_campaigns").select("id, name, channel_id").limit(2000),
    ]);
    const channelName = new Map((channels ?? []).map((c: any) => [c.id as string, c.name as string]));
    const campaignName = new Map((campaigns ?? []).map((c: any) => [c.id as string, c.name as string]));

    /* --- 2. Заявки, релевантні режиму --- */
    type LeadRow = { id: string; order_id: string | null; marketing_channel_id: string | null; marketing_campaign_id: string | null; lead_quality: string | null };
    const leadSelect = "id, order_id, marketing_channel_id, marketing_campaign_id, lead_quality";
    let leads: LeadRow[] = [];
    let cashOrderIds: string[] = [];

    if (data.timing === "cohort") {
      const { data: rows } = await sb.from("crm_leads").select(leadSelect)
        .gte("created_at", fromTs).lte("created_at", toTs).limit(5000);
      leads = (rows ?? []) as LeadRow[];
    } else {
      const { data: txPeriod } = await sb.from("finance_transactions").select("order_id")
        .eq("state", "actual").not("order_id", "is", null)
        .gte("op_date", data.from).lte("op_date", data.to).limit(20000);
      cashOrderIds = [...new Set((txPeriod ?? []).map((t: any) => String(t.order_id)))];
      if (cashOrderIds.length) {
        const { data: rows } = await sb.from("crm_leads").select(leadSelect).in("order_id", cashOrderIds).limit(5000);
        leads = (rows ?? []) as LeadRow[];
      }
    }

    /* --- 3. Заміри: зв'язок лід ↔ замовлення й лічильник замірів --- */
    const leadIds = leads.map((l) => l.id);
    const measByLead = new Map<string, number>();
    if (leadIds.length) {
      for (let i = 0; i < leadIds.length; i += 300) {
        const { data: ms } = await sb.from("order_measurements").select("lead_id, order_id")
          .in("lead_id", leadIds.slice(i, i + 300)).limit(5000);
        for (const m of (ms ?? []) as any[]) {
          if (!m.lead_id) continue;
          measByLead.set(m.lead_id, (measByLead.get(m.lead_id) ?? 0) + 1);
          const lead = leads.find((l) => l.id === m.lead_id);
          if (lead && !lead.order_id && m.order_id) lead.order_id = m.order_id as string;
        }
      }
    }

    /* --- 4. Замовлення заявок: статус договору --- */
    const orderIds = [...new Set(leads.map((l) => l.order_id).filter(Boolean) as string[])];
    const contractOrders = new Set<string>();
    if (orderIds.length) {
      for (let i = 0; i < orderIds.length; i += 300) {
        const { data: os } = await sb.from("orders").select("id, commercial_status").in("id", orderIds.slice(i, i + 300));
        for (const o of (os ?? []) as any[]) {
          if (["contract", "awaiting_prepayment", "sold"].includes(String(o.commercial_status))) contractOrders.add(o.id);
        }
      }
    }

    /* --- 5. Гроші по замовленнях (Finmap, лише підтверджені) --- */
    const money = new Map<string, { income: number; expense: number }>();
    if (orderIds.length) {
      for (let i = 0; i < orderIds.length; i += 300) {
        let q = sb.from("finance_transactions").select("order_id, kind, amount, amount_uah, op_date")
          .eq("state", "actual").in("order_id", orderIds.slice(i, i + 300)).limit(20000);
        // Касовий режим: тільки рухи всередині періоду. Когорта: весь життєвий цикл заявки.
        if (data.timing === "cash") q = q.gte("op_date", data.from).lte("op_date", data.to);
        const { data: tx } = await q;
        for (const t of (tx ?? []) as any[]) {
          const key = String(t.order_id);
          const cur = money.get(key) ?? { income: 0, expense: 0 };
          const amount = num(t.amount_uah ?? t.amount);
          if (t.kind === "income") cur.income += amount;
          else if (t.kind === "expense") cur.expense += amount;
          money.set(key, cur);
        }
      }
    }

    /* --- 6. Зведення по вимірі (канал або кампанія) --- */
    const byKey = new Map<string, EconomySlice>();
    const labelOf = (key: string) => {
      if (key === NO_ATTR) return "Без атрибуції";
      return (data.dim === "channel" ? channelName.get(key) : campaignName.get(key)) ?? "Потребує перевірки";
    };
    const slice = (key: string): EconomySlice => {
      let s = byKey.get(key);
      if (!s) {
        s = { key, label: labelOf(key), spend: 0, clicks: 0, impressions: 0, leads: 0, qualified: 0, measurements: 0, contracts: 0, ordersWithMoney: 0, revenue: 0, directCost: 0 };
        byKey.set(key, s);
      }
      return s;
    };

    for (const m of (metrics ?? []) as any[]) {
      const key = (data.dim === "channel" ? m.channel_id : m.campaign_id) ?? NO_ATTR;
      const s = slice(String(key));
      s.spend += num(m.spend); s.clicks += num(m.clicks); s.impressions += num(m.impressions);
    }

    const countedOrders = new Set<string>();
    for (const l of leads) {
      const key = String((data.dim === "channel" ? l.marketing_channel_id : l.marketing_campaign_id) ?? NO_ATTR);
      const s = slice(key);
      s.leads += 1;
      if (l.lead_quality === "цільовий") s.qualified += 1;
      s.measurements += measByLead.get(l.id) ?? 0;
      if (l.order_id && contractOrders.has(l.order_id)) s.contracts += 1;
      // Гроші замовлення враховуються один раз, навіть якщо на ньому кілька заявок.
      if (l.order_id && !countedOrders.has(l.order_id)) {
        const mo = money.get(l.order_id);
        if (mo && (mo.income !== 0 || mo.expense !== 0)) {
          countedOrders.add(l.order_id);
          s.ordersWithMoney += 1;
          s.revenue += mo.income;
          s.directCost += mo.expense;
        }
      }
    }

    const slices = [...byKey.values()];
    const rows = buildEconomyRows(slices);
    const total = totalEconomy(slices);
    const strip = <T extends { directCost: number; grossProfit: number | null; grossMargin: number | null; romiGross: number | null }>(r: T): T =>
      internal ? r : { ...r, directCost: 0, grossProfit: null, grossMargin: null, romiGross: null };

    return {
      period: { from: data.from, to: data.to },
      timing: data.timing,
      dim: data.dim,
      internal,
      rows: rows.map(strip),
      total: strip(total),
      /** Заявки без каналу/кампанії — показуються окремо, не розмазуються по каналах. */
      unattributedLeads: leads.filter((l) => !(data.dim === "channel" ? l.marketing_channel_id : l.marketing_campaign_id)).length,
      ordersInPeriod: data.timing === "cash" ? cashOrderIds.length : orderIds.length,
    };
  });
