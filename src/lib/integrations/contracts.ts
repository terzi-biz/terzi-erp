/**
 * Контракти провайдерів Integration Foundation (клієнт-безпечний довідник).
 *
 * Єдиний потік для всіх провайдерів:
 *   provider → normalized event → attribution/identity → CRM/Finance → integration journal
 *
 * Binotel і keyCRM тут НЕ описуються — вони вже працюють і не переписуються.
 */
import type { IntegrationAuthKind } from "@/lib/integrations-constants";

export type FoundationKind = "ads" | "analytics" | "finance" | "website";
export type ContractState = "blocked" | "ready";

export type ProviderContract = {
  key: string;
  label: string;
  kind: FoundationKind;
  auth: IntegrationAuthKind;
  /** Змінні середовища, без яких інтеграція лишається blocked. Значення ніколи не логуються. */
  requiredEnv: string[];
  /** Події, які провайдер надсилає в ERP. */
  inbound: string[];
  /** Події, які ERP надсилає провайдеру (наразі лише підготовка payload). */
  outbound: string[];
  /** Сутності ERP, на які впливає провайдер. */
  entities: string[];
  note: string;
};

export const FOUNDATION_CONTRACTS: Record<string, ProviderContract> = {
  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    kind: "ads",
    auth: "oauth2",
    requiredEnv: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"],
    inbound: ["google_ads.campaign_metrics", "google_ads.cost_daily"],
    outbound: ["google_ads.offline_conversion"],
    entities: ["marketing_campaigns", "marketing_daily_metrics", "crm_leads"],
    note: "Витрати кампаній + офлайн-конверсії за gclid/gbraid/wbraid.",
  },
  ga4: {
    key: "ga4",
    label: "Google Analytics 4",
    kind: "analytics",
    auth: "oauth2",
    requiredEnv: ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"],
    inbound: ["ga4.session_metrics", "ga4.conversion"],
    outbound: ["ga4.measurement_protocol_event"],
    entities: ["marketing_daily_metrics", "marketing_touchpoints"],
    note: "Сесії, джерела трафіку, client_id/session_id для звʼязку із заявкою.",
  },
  meta_ads: {
    key: "meta_ads",
    label: "Meta Ads",
    kind: "ads",
    auth: "oauth2",
    requiredEnv: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
    inbound: ["meta_ads.insights_daily", "meta_ads.lead_form"],
    outbound: ["meta_ads.offline_conversion"],
    entities: ["marketing_campaigns", "marketing_daily_metrics", "crm_leads"],
    note: "Insights по кампаніях + офлайн-конверсії за fbclid.",
  },
  finmap: {
    key: "finmap",
    label: "Finmap",
    kind: "finance",
    auth: "api_key",
    requiredEnv: ["FINMAP_API_KEY", "FINMAP_ACCOUNT_ID"],
    inbound: ["finmap.operation", "finmap.account", "finmap.category"],
    outbound: [],
    entities: ["payments", "expenses", "finance_accounts"],
    note: "Finmap — джерело фактичних фінансових операцій. ERP лише дзеркалить дані, не створює дублі.",
  },
  website: {
    key: "website",
    label: "Сайт і лендінги",
    kind: "website",
    auth: "hmac",
    requiredEnv: ["LEAD_INTAKE_SECRET"],
    inbound: ["website.form_submit", "website.callback_request", "website.quiz_submit"],
    outbound: [],
    entities: ["lead_intake_events", "crm_requests", "crm_leads", "crm_contacts"],
    note: "Прийом заявок з атрибуцією (utm, click id, GA4 client/session, landing_url, form_id).",
  },
};

export function listFoundationContracts(): ProviderContract[] {
  return Object.values(FOUNDATION_CONTRACTS);
}

export type ContractStatus = {
  key: string;
  state: ContractState;
  missing: string[];
  message: string;
};

/** Стан підключення за наявними змінними середовища. «connected» не імітується. */
export function contractStatus(contract: ProviderContract, env: Record<string, string | undefined>): ContractStatus {
  const missing = contract.requiredEnv.filter((k) => !env[k]);
  if (missing.length) {
    return {
      key: contract.key,
      state: "blocked",
      missing,
      message: `Заблоковано: не задано ${missing.join(", ")}`,
    };
  }
  return {
    key: contract.key,
    state: "ready",
    missing: [],
    message: "Ключі знайдено. Реальні виклики вимкнено до окремого дозволу.",
  };
}
