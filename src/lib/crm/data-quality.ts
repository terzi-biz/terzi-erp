/**
 * Shared CRM / Dashboard data-quality definitions.
 *
 * Scope contract:
 * - Dashboard & CEO report «Якість даних» → analytics_overview RPC, filtered by selected period
 *   (lead created_at / call started_at / etc. within [from, to]).
 * - CRM panel DQ tiles → same metric keys & predicates; prefer analytics_overview for the CRM
 *   date range so numbers match Dashboard when periods match.
 * - /data-audit → all-time integrity checks (different check set: duplicates, orphans, catalog).
 *
 * SQL mirror (analytics_overview):
 *   leads_no_source  = COALESCE(NULLIF(source,''), utm->>'utm_source') IS NULL
 *   leads_no_manager = assigned_to IS NULL
 */

export type DqScope = "period_analytics" | "all_time_audit" | "crm_period";

export type DqMetricKey =
  | "leads_no_source"
  | "leads_no_manager"
  | "leads_no_client"
  | "calls_unlinked"
  | "measurements_no_surveyor"
  | "estimates_no_order"
  | "orders_no_source"
  | "orders_no_amount"
  | "payments_no_order";

export interface DqMetricMeta {
  key: DqMetricKey;
  label: string;
  /** Short scope hint for UI */
  scopeHint: string;
  scope: DqScope;
}

/** Catalog for period-scoped analytics tiles (Dashboard / CRM / CEO). */
export const PERIOD_DQ_METRICS: DqMetricMeta[] = [
  {
    key: "leads_no_source",
    label: "Ліди без джерела",
    scopeHint: "за період · analytics (source або utm_source)",
    scope: "period_analytics",
  },
  {
    key: "leads_no_manager",
    label: "Ліди без менеджера",
    scopeHint: "за період · assigned_to IS NULL",
    scope: "period_analytics",
  },
  {
    key: "calls_unlinked",
    label: "Дзвінки без зв'язку",
    scopeHint: "за період · без lead_id і client_id",
    scope: "period_analytics",
  },
  {
    key: "measurements_no_surveyor",
    label: "Заміри без замірника",
    scopeHint: "за період · surveyor_id IS NULL",
    scope: "period_analytics",
  },
  {
    key: "estimates_no_order",
    label: "Кошториси без замовлення",
    scopeHint: "за період · order_id IS NULL",
    scope: "period_analytics",
  },
  {
    key: "orders_no_source",
    label: "Замовлення без джерела",
    scopeHint: "за період · порожній source",
    scope: "period_analytics",
  },
  {
    key: "orders_no_amount",
    label: "Замовлення без суми",
    scopeHint: "за період · amount_total = 0",
    scope: "period_analytics",
  },
  {
    key: "payments_no_order",
    label: "Оплати без замовлення",
    scopeHint: "за період · локальні payments без order_id",
    scope: "period_analytics",
  },
];

export const DQ_SCOPE_BLURBS = {
  period_analytics:
    "Показники з analytics_overview за обраний період (не «усі періоди»). Повний all-time аудит — у Data Audit.",
  crm_period:
    "Ті самі метрики й RPC, що на Dashboard / CEO, за період панелі CRM. Якщо періоди збігаються — лічильники мають збігатися.",
  all_time_audit:
    "Аудит цілісності: all-time dry-run перевірки звʼязків (дублі, сироти, каталог). Це не ті самі tiles, що «Якість даних» на дашборді.",
} as const;

export type LeadDqFields = {
  source?: string | null;
  utm?: { utm_source?: string | null } | Record<string, unknown> | null;
  assigned_to?: string | null;
  client_id?: string | null;
  created_at?: string | null;
};

function utmSourceOf(lead: LeadDqFields): string {
  const u = lead.utm;
  if (!u || typeof u !== "object") return "";
  const v = (u as { utm_source?: unknown }).utm_source;
  return String(v ?? "").trim();
}

/** Matches analytics_overview: COALESCE(NULLIF(source,''), utm->>'utm_source') IS NULL */
export function isLeadNoSource(lead: LeadDqFields): boolean {
  const src = String(lead.source ?? "").trim();
  if (src) return false;
  return !utmSourceOf(lead);
}

export function isLeadNoManager(lead: LeadDqFields): boolean {
  return lead.assigned_to == null || lead.assigned_to === "";
}

export function isLeadNoClient(lead: LeadDqFields): boolean {
  return lead.client_id == null || lead.client_id === "";
}

/** Inclusive calendar-day filter on created_at (YYYY-MM-DD or ISO). */
export function leadInPeriod(lead: LeadDqFields, from: string, to: string): boolean {
  if (!lead.created_at) return false;
  const day = String(lead.created_at).slice(0, 10);
  return day >= from.slice(0, 10) && day <= to.slice(0, 10);
}

export function countLeadDq(
  leads: LeadDqFields[],
  opts?: { from?: string; to?: string },
): {
  leads_no_source: number;
  leads_no_manager: number;
  leads_no_client: number;
  scoped: number;
} {
  const scoped =
    opts?.from && opts?.to
      ? leads.filter((l) => leadInPeriod(l, opts.from!, opts.to!))
      : leads;
  return {
    leads_no_source: scoped.filter(isLeadNoSource).length,
    leads_no_manager: scoped.filter(isLeadNoManager).length,
    leads_no_client: scoped.filter(isLeadNoClient).length,
    scoped: scoped.length,
  };
}

/** Drilldown PostgREST filter fragment aligned with isLeadNoSource (source empty AND no utm). */
export function leadsNoSourceOrFilter(): string {
  // Rows with empty/null source; callers should also drop those with utm_source client-side
  // when utm JSON filter is unavailable, or use: and(source empty, utm path).
  return "source.is.null,source.eq.";
}
