/**
 * Рекламні кабінети для CEO-дашборду (UI v2): Google Ads, Meta, OLX, Сайт/органіка, TikTok + «Інше».
 *
 * Клієнт-безпечний чистий модуль. Лід відноситься до кабінету так:
 *   1) канонічний канал ліда (`crm_leads.marketing_channel_id` → `marketing_channels.key`) — головне джерело;
 *   2) UTM / click id (gclid, fbclid, ttclid, utm_source + utm_medium);
 *   3) текст `crm_leads.source`.
 * Невідоме джерело → «Інше». Ніколи не вгадуємо платний кабінет без ознак.
 */

export type CabinetKey = "google" | "meta" | "olx" | "site" | "tiktok" | "other";

export interface CabinetMeta {
  key: CabinetKey;
  label: string;
  short: string;
  /** Акцентний колір воронки. */
  accent: string;
  /** Колір верхньої смужки картки. */
  bar: string;
  /** М'який фон бейджа. */
  tint: string;
  /** Ключі `marketing_channels.key`, з яких беруться витрати/покази/кліки. */
  adChannelKeys: string[];
  /** Провайдери `marketing_integrations.provider`, що означають «кабінет підключено». */
  providers: string[];
  /** Підказка, що саме треба підключити, якщо даних кабінету немає. */
  connectHint: string;
}

export const CABINETS: CabinetMeta[] = [
  { key: "google", label: "Google Ads", short: "Google", accent: "#1A73E8", bar: "#4285F4", tint: "#E8F0FE", adChannelKeys: ["google_ads"], providers: ["google_ads"], connectHint: "Google Ads API" },
  { key: "meta", label: "Meta (FB / IG)", short: "Meta", accent: "#0866FF", bar: "#0866FF", tint: "#E7F0FF", adChannelKeys: ["meta_ads"], providers: ["meta_ads"], connectHint: "Meta Marketing API" },
  { key: "olx", label: "OLX", short: "OLX", accent: "#00857F", bar: "#23E5DB", tint: "#E0F7F5", adChannelKeys: ["olx"], providers: ["olx"], connectHint: "OLX Partner API" },
  { key: "site", label: "Сайт / органіка", short: "Сайт", accent: "#2E7D5B", bar: "#2E7D5B", tint: "#E6F4EC", adChannelKeys: ["seo", "organic", "site_forms", "gbp"], providers: ["ga4", "gsc"], connectHint: "GA4 / Search Console" },
  { key: "tiktok", label: "TikTok", short: "TikTok", accent: "#161823", bar: "#FE2C55", tint: "#EEF0F3", adChannelKeys: ["tiktok_ads"], providers: ["tiktok_ads"], connectHint: "TikTok Ads API" },
];

export const OTHER_CABINET: CabinetMeta = {
  key: "other", label: "Інше", short: "Інше", accent: "#5B6478", bar: "#8A93A6", tint: "#EEF1F6",
  adChannelKeys: [], providers: [], connectHint: "",
};

export const CABINET_KEYS: CabinetKey[] = ["google", "meta", "olx", "site", "tiktok", "other"];

export function cabinetMeta(key: CabinetKey): CabinetMeta {
  return CABINETS.find((c) => c.key === key) ?? OTHER_CABINET;
}

/** Канал `marketing_channels.key` → кабінет. Невідомий, але заданий канал → «Інше». */
const CHANNEL_TO_CABINET: Record<string, CabinetKey> = {
  google_ads: "google",
  meta_ads: "meta",
  facebook: "meta",
  instagram: "meta",
  olx: "olx",
  site_forms: "site",
  seo: "site",
  organic: "site",
  gbp: "site",
  tiktok_ads: "tiktok",
  tiktok_organic: "tiktok",
  tiktok: "tiktok",
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

type Utm = Record<string, unknown> | null | undefined;

function fromUtm(utm: Utm): CabinetKey | null {
  if (!utm || typeof utm !== "object") return null;
  if (norm(utm.gclid) || norm(utm.gbraid) || norm(utm.wbraid)) return "google";
  if (norm(utm.fbclid)) return "meta";
  if (norm(utm.ttclid)) return "tiktok";
  const src = norm(utm.utm_source);
  const med = norm(utm.utm_medium);
  if (!src) return null;
  if (/tiktok/.test(src)) return "tiktok";
  if (/olx/.test(src)) return "olx";
  if (/(^|[^a-z])(facebook|fb|instagram|ig|meta)([^a-z]|$)/.test(src) || /facebook|instagram/.test(src)) return "meta";
  if (/google/.test(src)) return /cpc|ppc|paid|ads|display|pmax/.test(med) ? "google" : "site";
  if (src === "(direct)" || /organic|seo/.test(med)) return "site";
  return null;
}

function fromSource(source: unknown, utm: Utm): CabinetKey | null {
  const s = norm(source);
  if (!s) return null;
  if (/google\s*ads|adwords|gclid|гугл\s*реклам/.test(s)) return "google";
  if (s === "google" || s === "www.google.com" || s === "google.com") {
    const med = norm(utm && typeof utm === "object" ? (utm as Record<string, unknown>).utm_medium : "");
    return /cpc|ppc|paid|ads/.test(med) ? "google" : "site";
  }
  if (/facebook|instagram|^fb\b|fb\s*lid|^fb$|інстаграм|инстаграм|фейсбук|\bmeta\b/.test(s)) return "meta";
  if (/olx/.test(s)) return "olx";
  if (/tiktok|тікток|тикток/.test(s)) return "tiktok";
  if (/сайт|site|terzi\.biz|seo|organic|органі|органи|^\(direct\)$/.test(s)) return "site";
  return null;
}

/**
 * Кабінет ліда. Порядок: канонічний канал → UTM/click id → текст джерела → «Інше».
 * Заданий, але не рекламний канал (Binotel, Рекомендації, Партнери, Viber…) — «Інше».
 */
export function resolveCabinet(input: { channelKey?: string | null; source?: string | null; utm?: Utm }): CabinetKey {
  const ch = norm(input.channelKey);
  if (ch) return CHANNEL_TO_CABINET[ch] ?? "other";
  return fromUtm(input.utm) ?? fromSource(input.source, input.utm) ?? "other";
}

/* ---------- Воронка ---------- */

export const FUNNEL_STAGES = ["impressions", "clicks", "leads", "measurements", "proposals", "deals"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  impressions: "Покази",
  clicks: "Кліки",
  leads: "Ліди",
  measurements: "Заміри",
  proposals: "КП",
  deals: "Угоди",
};

export interface CabinetFunnel {
  key: CabinetKey;
  /** Кабінет має підключене джерело трафіку/витрат (інтеграція або записи метрик). */
  adsConnected: boolean;
  /** Є записи рекламних метрик за період. */
  hasAdMetrics: boolean;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  leads: number;
  measurements: number;
  proposals: number;
  deals: number;
  dealValue: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Конверсія етапу в %, або null, якщо попередній етап порожній/невідомий. */
export function stageConversion(prev: number | null | undefined, next: number | null | undefined): number | null {
  if (prev == null || next == null || prev <= 0) return null;
  return r1((next / prev) * 100);
}

export interface CabinetEconomy {
  cpl: number | null;
  costPerDeal: number | null;
  romi: number | null;
  leadToDeal: number | null;
}

/** CPL / вартість угоди / ROMI (від суми угод). Без витрат — null («немає даних»), не 0. */
export function cabinetEconomy(f: Pick<CabinetFunnel, "spend" | "leads" | "deals" | "dealValue">): CabinetEconomy {
  const spend = f.spend ?? 0;
  return {
    cpl: spend > 0 && f.leads > 0 ? Math.round(spend / f.leads) : null,
    costPerDeal: spend > 0 && f.deals > 0 ? Math.round(spend / f.deals) : null,
    romi: spend > 0 ? Math.round(((f.dealValue - spend) / spend) * 100) : null,
    leadToDeal: f.leads > 0 ? r1((f.deals / f.leads) * 100) : null,
  };
}

/** Класифікація етапу CRM за назвою (keyCRM-етапи мають довільні ключі). */
export function stageLevelByName(name: string | null | undefined): "measurement" | "proposal" | null {
  const n = norm(name);
  if (!n) return null;
  if (/предвар|попередн/.test(n)) return null; // попередній кошторис іде ДО заміру — не рахуємо як КП
  if (/смет|кошторис|\bкп\b|комерц|коммерч|пропозиц|предложен/.test(n)) return "proposal";
  if (/замер|замір/.test(n)) return "measurement";
  return null;
}

/**
 * Рівень, до якого дійшов лід (накопичувально: угода ⇒ КП ⇒ замір ⇒ лід).
 * 1 = лід, 2 = замір, 3 = КП, 4 = угода.
 */
export function leadLevel(x: { won: boolean; hasProposal: boolean; hasMeasurement: boolean; stageLevel: "measurement" | "proposal" | null }): 1 | 2 | 3 | 4 {
  if (x.won) return 4;
  if (x.hasProposal || x.stageLevel === "proposal") return 3;
  if (x.hasMeasurement || x.stageLevel === "measurement") return 2;
  return 1;
}
