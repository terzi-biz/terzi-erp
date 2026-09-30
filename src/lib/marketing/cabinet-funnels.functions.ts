/**
 * CEO-дашборд v2: воронки по рекламних кабінетах + ряди для KPI і план/факт року.
 *
 * Тільки читання під RLS користувача, без нових таблиць і міграцій.
 * Джерела правди:
 *   покази / кліки / витрати — `marketing_daily_metrics` (+ `marketing_manual_spend` для витрат);
 *   ліди та кабінет        — `crm_leads` (канал → UTM → source, див. cabinets.ts);
 *   заміри                 — `order_measurements` (lead_id або замовлення ліда) + етап CRM «замір»;
 *   КП                     — `estimates` по замовленню ліда + етап CRM «фінальний кошторис/КП»;
 *   угоди                  — лід `won` / етап is_won / замовлення зі статусом договору;
 *   сума угод              — `orders.amount_total` (або бюджет ліда, якщо замовлення не прив'язане).
 * Етапи рахуються накопичувально: лід, що дійшов до угоди, пройшов і КП, і замір.
 * Якщо кабінет не підключений — покази/кліки/витрати = null (UI показує «Кабінет не підключено»).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CABINETS,
  CABINET_KEYS,
  leadLevel,
  resolveCabinet,
  stageLevelByName,
  type CabinetFunnel,
  type CabinetKey,
} from "./cabinets";

const CONTRACT_STATUSES = ["contract", "awaiting_prepayment", "sold"];
// Чернетка заміру ще не є заміром; скасовані — теж ні.
const CANCELLED = new Set(["cancelled", "canceled", "draft"]);
const num = (v: unknown) => Number(v) || 0;

const rangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const nextDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
};

type Sb = any;

/** Посторінкове читання (PostgREST віддає максимум 1000 рядків за запит). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < cap; off += 1000) {
    const { data, error } = await page(off, off + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await run(ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Безпечне читання довідника: помилка RLS/відсутня таблиця → порожньо, не падіння дашборду. */
async function soft<T>(q: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

type LeadRow = {
  id: string;
  source: string | null;
  utm: Record<string, unknown> | null;
  marketing_channel_id: string | null;
  stage_id: string | null;
  status: string | null;
  order_id: string | null;
  budget: number | null;
  lost_reason: string | null;
  created_at: string;
};

type StageRow = { id: string; name: string; is_won: boolean | null; is_lost: boolean | null };

/** Сміттєві етапи (не цільові звернення) — не входять у «Цільові». */
const JUNK_STAGE = /спам|дубль|тест|не\s*целев|не\s*цільов|некоррект|некорект/i;
const DONE_MEAS = new Set(["done", "completed"]);

export interface CohortLead {
  id: string;
  cabinet: CabinetKey;
  rawSource: string;
  level: 1 | 2 | 3 | 4;
  measurementDone: boolean;
  junk: boolean;
  lost: boolean;
  lostLabel: string | null;
  dealValue: number;
  createdDay: string;
}

/**
 * Когорта лідів, створених у періоді (UTC-дні, як у RPC analytics_overview), із кабінетом і
 * рівнем воронки. Спільна основа для CEO-дашборду та воронки на сторінці лідів.
 */
async function loadCohort(sb: Sb, from: string, to: string) {
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${nextDay(to)}T00:00:00.000Z`;
  const [channels, stages] = await Promise.all([
    soft<{ id: string; key: string }>(sb.from("marketing_channels").select("id, key")),
    soft<StageRow>(sb.from("crm_stages").select("id, name, is_won, is_lost")),
  ]);
  const channelKey = new Map(channels.map((c) => [c.id, c.key]));
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const leads = await readAll<LeadRow>((a, b) =>
    sb.from("crm_leads")
      .select("id, source, utm, marketing_channel_id, stage_id, status, order_id, budget, lost_reason, created_at")
      .gte("created_at", fromTs).lt("created_at", toTs)
      .order("created_at", { ascending: true }).range(a, b),
  );
  const leadIds = leads.map((l) => l.id);
  const orderIds = [...new Set(leads.map((l) => l.order_id).filter(Boolean) as string[])];

  const [measByLead, measByOrder, estByOrder, orders] = await Promise.all([
    leadIds.length ? inChunks<{ lead_id: string | null; status: string | null }>(leadIds, (c) => sb.from("order_measurements").select("lead_id, status").in("lead_id", c)) : Promise.resolve([]),
    orderIds.length ? inChunks<{ order_id: string | null; status: string | null }>(orderIds, (c) => sb.from("order_measurements").select("order_id, status").in("order_id", c)) : Promise.resolve([]),
    orderIds.length ? inChunks<{ order_id: string | null }>(orderIds, (c) => sb.from("estimates").select("order_id").in("order_id", c)) : Promise.resolve([]),
    orderIds.length ? inChunks<{ id: string; commercial_status: string | null; amount_total: number | null }>(orderIds, (c) => sb.from("orders").select("id, commercial_status, amount_total").in("id", c)) : Promise.resolve([]),
  ]);
  const measuredLead = new Set(measByLead.filter((m) => m.lead_id && !CANCELLED.has(String(m.status))).map((m) => m.lead_id as string));
  const measuredOrder = new Set(measByOrder.filter((m) => m.order_id && !CANCELLED.has(String(m.status))).map((m) => m.order_id as string));
  const doneLead = new Set(measByLead.filter((m) => m.lead_id && DONE_MEAS.has(String(m.status))).map((m) => m.lead_id as string));
  const doneOrder = new Set(measByOrder.filter((m) => m.order_id && DONE_MEAS.has(String(m.status))).map((m) => m.order_id as string));
  const estimateOrder = new Set(estByOrder.map((e) => e.order_id).filter(Boolean) as string[]);
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const cohort: CohortLead[] = leads.map((l) => {
    const cab = resolveCabinet({ channelKey: l.marketing_channel_id ? channelKey.get(l.marketing_channel_id) ?? null : null, source: l.source, utm: l.utm });
    const stage = l.stage_id ? stageById.get(l.stage_id) : undefined;
    const order = l.order_id ? orderById.get(l.order_id) : undefined;
    const contract = !!order && CONTRACT_STATUSES.includes(String(order.commercial_status));
    const won = l.status === "won" || stage?.is_won === true || contract;
    const stageLevel = stageLevelByName(stage?.name);
    const level = leadLevel({
      won,
      hasProposal: !!l.order_id && estimateOrder.has(l.order_id),
      hasMeasurement: measuredLead.has(l.id) || (!!l.order_id && measuredOrder.has(l.order_id)),
      stageLevel,
    });
    const stageName = stage?.name ?? "";
    const lost = !won && (l.status === "lost" || stage?.is_lost === true);
    return {
      id: l.id,
      cabinet: cab,
      rawSource: (l.source ?? "").trim() || "(без джерела)",
      level,
      measurementDone: level >= 3 || doneLead.has(l.id) || (!!l.order_id && doneOrder.has(l.order_id)) || /замер\s*выполн|замір\s*викон/i.test(stageName),
      junk: JUNK_STAGE.test(stageName),
      lost,
      lostLabel: lost ? ((l.lost_reason ?? "").trim() || stageName || "без причини") : null,
      dealValue: level >= 4 ? (num(order?.amount_total) > 0 ? num(order?.amount_total) : num(l.budget)) : 0,
      createdDay: l.created_at.slice(0, 10),
    };
  });
  return { cohort, channelKey };
}

export const getCabinetFunnels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const sb: Sb = context.supabase;

    const [{ cohort, channelKey }, integrations, accounts, metrics, manual] = await Promise.all([
      loadCohort(sb, data.from, data.to),
      soft<{ provider: string; connection_status: string | null }>(sb.from("marketing_integrations").select("provider, connection_status")),
      soft<{ channel_id: string | null; name: string | null; connection_status: string | null }>(sb.from("marketing_accounts").select("channel_id, name, connection_status")),
      readAll<{ channel_id: string | null; spend: number | null; impressions: number | null; clicks: number | null }>((a, b) =>
        sb.from("marketing_daily_metrics").select("channel_id, spend, impressions, clicks")
          .gte("date", data.from).lte("date", data.to).range(a, b)),
      soft<{ source: string | null; amount: number | null }>(sb.from("marketing_manual_spend").select("source, amount").gte("spend_date", data.from).lte("spend_date", data.to)),
    ]);

    const empty = (key: CabinetKey): CabinetFunnel => ({
      key, adsConnected: false, hasAdMetrics: false,
      impressions: null, clicks: null, spend: null,
      leads: 0, measurements: 0, proposals: 0, deals: 0, dealValue: 0,
    });
    const byKey = new Map<CabinetKey, CabinetFunnel>(CABINET_KEYS.map((k) => [k, empty(k)]));
    const cabinetOfChannel = (id: string | null): CabinetKey | null => {
      const key = id ? channelKey.get(id) : null;
      if (!key) return null;
      return CABINETS.find((c) => c.adChannelKeys.includes(key))?.key ?? null;
    };

    for (const m of metrics) {
      const cab = cabinetOfChannel(m.channel_id);
      if (!cab) continue;
      const f = byKey.get(cab)!;
      f.hasAdMetrics = true;
      f.impressions = (f.impressions ?? 0) + num(m.impressions);
      f.clicks = (f.clicks ?? 0) + num(m.clicks);
      f.spend = (f.spend ?? 0) + num(m.spend);
    }
    for (const s of manual) {
      const cab = resolveCabinet({ source: s.source });
      const f = byKey.get(cab)!;
      f.spend = (f.spend ?? 0) + num(s.amount);
    }

    const connectedProviders = new Set(integrations.filter((i) => i.connection_status === "connected").map((i) => i.provider));
    const accountName: Partial<Record<CabinetKey, string>> = {};
    for (const a of accounts) {
      const cab = cabinetOfChannel(a.channel_id);
      if (!cab) continue;
      if (a.connection_status === "connected") connectedProviders.add(CABINETS.find((c) => c.key === cab)!.providers[0]);
      if (a.name && !accountName[cab]) accountName[cab] = a.name;
    }
    for (const c of CABINETS) {
      const f = byKey.get(c.key)!;
      f.adsConnected = f.hasAdMetrics || c.providers.some((p) => connectedProviders.has(p));
    }

    const unmatched = new Map<string, number>();
    const leadsByDay = new Map<string, number>();
    for (const l of cohort) {
      const f = byKey.get(l.cabinet)!;
      f.leads += 1;
      if (l.level >= 2) f.measurements += 1;
      if (l.level >= 3) f.proposals += 1;
      if (l.level >= 4) { f.deals += 1; f.dealValue += l.dealValue; }
      if (l.cabinet === "other") unmatched.set(l.rawSource, (unmatched.get(l.rawSource) ?? 0) + 1);
      leadsByDay.set(l.createdDay, (leadsByDay.get(l.createdDay) ?? 0) + 1);
    }

    const cabinets = CABINET_KEYS.map((k) => {
      const f = byKey.get(k)!;
      return {
        ...f,
        spend: f.spend == null ? null : Math.round(f.spend),
        dealValue: Math.round(f.dealValue),
        account: accountName[k] ?? null,
      };
    });
    const withSpend = cabinets.filter((c) => c.spend != null);
    const totals = {
      spend: withSpend.length ? withSpend.reduce((s, c) => s + (c.spend ?? 0), 0) : null,
      leads: cabinets.reduce((s, c) => s + c.leads, 0),
      measurements: cabinets.reduce((s, c) => s + c.measurements, 0),
      proposals: cabinets.reduce((s, c) => s + c.proposals, 0),
      deals: cabinets.reduce((s, c) => s + c.deals, 0),
      dealValue: cabinets.reduce((s, c) => s + c.dealValue, 0),
      /** Ліди та угоди лише платних кабінетів із витратами — для CPL / вартості угоди / ROMI. */
      paidLeads: withSpend.reduce((s, c) => s + c.leads, 0),
      paidDeals: withSpend.reduce((s, c) => s + c.deals, 0),
      paidDealValue: withSpend.reduce((s, c) => s + c.dealValue, 0),
    };

    return {
      period: { from: data.from, to: data.to },
      cabinets,
      totals,
      /** Сирі джерела, що потрапили в «Інше» (топ-10) — для прозорості мапінгу. */
      otherSources: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([source, n]) => ({ source, n })),
      leadsByDay: [...leadsByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => ({ day, n })),
    };
  });

/**
 * Воронка CRM для сторінки лідів: когорта лідів періоду (опційно — один кабінет).
 * Етапи накопичувальні; «Програно» — ліди зі статусом lost / етапом is_lost (з причинами).
 */
export const getLeadsFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.extend({ cabinet: z.enum(["google", "meta", "olx", "site", "tiktok", "other"]).nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { cohort } = await loadCohort(context.supabase as Sb, data.from, data.to);
    const bySource: Record<CabinetKey, number> = { google: 0, meta: 0, olx: 0, site: 0, tiktok: 0, other: 0 };
    for (const l of cohort) bySource[l.cabinet] += 1;
    const rows = data.cabinet ? cohort.filter((l) => l.cabinet === data.cabinet) : cohort;
    const lostReasons = new Map<string, number>();
    for (const l of rows) if (l.lost && l.lostLabel) lostReasons.set(l.lostLabel, (lostReasons.get(l.lostLabel) ?? 0) + 1);
    const stages = [
      { key: "leads", label: "Нові ліди", n: rows.length },
      { key: "qualified", label: "Цільові", n: rows.filter((l) => !l.junk).length },
      { key: "measurement", label: "Замір призначено", n: rows.filter((l) => l.level >= 2).length },
      { key: "measured", label: "Замір виконано", n: rows.filter((l) => l.measurementDone).length },
      { key: "proposal", label: "КП надіслано", n: rows.filter((l) => l.level >= 3).length },
      { key: "won", label: "Угода / Виграно", n: rows.filter((l) => l.level >= 4).length },
    ];
    const lost = rows.filter((l) => l.lost).length;
    return {
      period: { from: data.from, to: data.to },
      cabinet: data.cabinet ?? null,
      stages,
      lost,
      junk: rows.filter((l) => l.junk).length,
      lostReasons: [...lostReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, n]) => ({ label, n })),
      bySource,
      dealValue: Math.round(rows.reduce((s, l) => s + l.dealValue, 0)),
    };
  });

/**
 * План/факт продажів по місяцях року + денні ряди періоду для KPI-спарклайнів.
 * Факт = сума договорів (`orders` зі статусом договору, за датою замовлення, інакше створення — як у analytics_overview).
 * План = `sales_plan_months.company_target` (місяці без плану → null, не 0).
 */
export const getSalesPlanFactYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int().min(2020).max(2100), from: rangeInput.shape.from, to: rangeInput.shape.to }).parse(d))
  .handler(async ({ context, data }) => {
    const sb: Sb = context.supabase;
    const y = data.year;
    const [orders, plans, meas] = await Promise.all([
      readAll<{ created_at: string; ordered_at: string | null; amount_total: number | null }>((a, b) =>
        sb.from("orders").select("created_at, ordered_at, amount_total")
          .in("commercial_status", CONTRACT_STATUSES)
          .or(`created_at.gte.${y}-01-01,ordered_at.gte.${y}-01-01`)
          .range(a, b)),
      soft<{ month: string; company_target: number | null }>(sb.from("sales_plan_months").select("month, company_target").gte("month", `${y}-01-01`).lte("month", `${y}-12-31`)),
      readAll<{ created_at: string; completed_at: string | null; status: string | null }>((a, b) =>
        sb.from("order_measurements").select("created_at, completed_at, status")
          .gte("created_at", `${data.from}T00:00:00.000Z`).lt("created_at", `${nextDay(data.to)}T00:00:00.000Z`)
          .range(a, b)),
    ]);

    const now = new Date();
    const curMonth = now.getUTCFullYear() === y ? now.getUTCMonth() : now.getUTCFullYear() > y ? 11 : -1;
    const fact = Array.from({ length: 12 }, () => 0);
    const contractsByDay = new Map<string, number>();
    for (const o of orders) {
      // Дата договору = дата замовлення (keyCRM), інакше дата створення в ERP.
      const when = String(o.ordered_at ?? o.created_at);
      if (Number(when.slice(0, 4)) !== y) continue;
      fact[Number(when.slice(5, 7)) - 1] += num(o.amount_total);
      const day = when.slice(0, 10);
      if (day >= data.from && day <= data.to) contractsByDay.set(day, (contractsByDay.get(day) ?? 0) + num(o.amount_total));
    }
    const plan: Array<number | null> = Array.from({ length: 12 }, () => null);
    for (const p of plans) {
      const m = Number(String(p.month).slice(5, 7)) - 1;
      if (m >= 0 && m < 12 && num(p.company_target) > 0) plan[m] = num(p.company_target);
    }
    const measByDay = new Map<string, number>();
    for (const m of meas) {
      if (!["done", "completed"].includes(String(m.status))) continue;
      const day = (m.completed_at ?? m.created_at).slice(0, 10);
      measByDay.set(day, (measByDay.get(day) ?? 0) + 1);
    }
    const months = fact.map((v, i) => ({
      month: i + 1,
      fact: i <= curMonth ? Math.round(v) : null,
      plan: plan[i],
    }));
    // Рік: факт і план лише за місяці, для яких план задано (без вигаданої цілі).
    const planned = months.filter((m) => m.plan != null && m.fact != null);
    const ytd = planned.length
      ? { fact: planned.reduce((s, m) => s + (m.fact ?? 0), 0), plan: planned.reduce((s, m) => s + (m.plan ?? 0), 0), months: planned.length }
      : null;
    const series = (m: Map<string, number>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, v }));
    return { year: y, months, ytd, contractsByDay: series(contractsByDay), measurementsByDay: series(measByDay) };
  });
