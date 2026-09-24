/**
 * Integration health — pure registry + normalization (no I/O).
 * One record per provider. `connected` only from real canonical evidence
 * (successful API test or recent successful sync/event), never from env/token
 * presence or legacy marketing_integrations status.
 */

export type HealthState = "connected" | "degraded" | "error" | "legacy" | "configured" | "not_configured";

export type Capability = "test" | "sync" | "webhook_in" | "outbound" | "conversions" | "oauth";

export type ProviderMeta = {
  id: string;
  label: string;
  /** provider_key rows in canonical `integrations` */
  integrationKeys: string[];
  /** provider in legacy `marketing_integrations` */
  legacyKeys: string[];
  /** marketing_channels.platform whose metrics count as sync evidence */
  metricsPlatform?: string;
  envKeys: string[];
  capabilities: Capability[];
  /** where the working implementation lives (no duplicate adapters) */
  implementation: string;
  tab?: string;
};

export const PROVIDERS: ProviderMeta[] = [
  { id: "finmap", label: "Finmap", integrationKeys: [], legacyKeys: [], envKeys: ["FINMAP_API_KEY"], capabilities: ["test", "sync", "webhook_in"], implementation: "finance/finmap (finmap_sync_state/log)" },
  { id: "binotel", label: "Binotel", integrationKeys: ["binotel"], legacyKeys: ["binotel"], envKeys: ["BINOTEL_API_KEY", "BINOTEL_API_SECRET"], capabilities: ["test", "sync", "webhook_in"], implementation: "integrations/binotel", tab: "binotel" },
  { id: "keycrm", label: "keyCRM", integrationKeys: ["keycrm"], legacyKeys: ["keycrm"], envKeys: [], capabilities: ["test", "sync", "webhook_in", "outbound"], implementation: "integrations/keycrm", tab: "sync" },
  { id: "google_ads", label: "Google Ads", integrationKeys: ["google_ads"], legacyKeys: ["google_ads"], metricsPlatform: "google", envKeys: ["GOOGLE_ADS_API_KEY", "GOOGLE_ADS_CUSTOMER_ID"], capabilities: ["test", "sync", "conversions", "oauth"], implementation: "foundation/google-ads.server", tab: "external" },
  { id: "meta_ads", label: "Meta Ads", integrationKeys: ["meta_ads"], legacyKeys: ["meta_ads", "facebook", "instagram"], metricsPlatform: "meta", envKeys: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"], capabilities: ["test", "sync"], implementation: "foundation/meta-ads.server", tab: "external" },
  { id: "ga4", label: "GA4", integrationKeys: ["ga4"], legacyKeys: ["ga4"], envKeys: ["GA4_PROPERTY_ID"], capabilities: ["test", "oauth"], implementation: "external/providers.server", tab: "external" },
  { id: "site_forms", label: "Сайт / WordPress", integrationKeys: ["site_forms", "wordpress", "site"], legacyKeys: ["site_forms"], metricsPlatform: "site", envKeys: ["LEAD_INTAKE_SECRET"], capabilities: ["webhook_in"], implementation: "api/public/leads/intake", tab: "webhooks" },
  { id: "gtm", label: "Google Tag Manager", integrationKeys: ["gtm"], legacyKeys: ["gtm"], envKeys: ["GTM_CONTAINER_ID"], capabilities: [], implementation: "—" },
  { id: "tiktok_ads", label: "TikTok Ads", integrationKeys: ["tiktok_ads"], legacyKeys: ["tiktok_ads"], metricsPlatform: "tiktok", envKeys: ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_APP_SECRET"], capabilities: ["oauth", "test"], implementation: "external/providers.server", tab: "external" },
  { id: "whatsapp", label: "WhatsApp", integrationKeys: ["whatsapp"], legacyKeys: ["whatsapp"], envKeys: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"], capabilities: ["test", "webhook_in"], implementation: "external/providers.server", tab: "external" },
  { id: "telegram", label: "Telegram", integrationKeys: ["telegram"], legacyKeys: ["telegram"], envKeys: ["TELEGRAM_BOT_TOKEN"], capabilities: ["test", "webhook_in"], implementation: "external/providers.server", tab: "external" },
  { id: "viber", label: "Viber", integrationKeys: ["viber"], legacyKeys: ["viber"], envKeys: ["VIBER_BOT_TOKEN"], capabilities: ["test", "webhook_in"], implementation: "external/providers.server", tab: "external" },
  { id: "olx", label: "OLX", integrationKeys: ["olx"], legacyKeys: ["olx"], envKeys: ["OLX_CLIENT_ID", "OLX_CLIENT_SECRET"], capabilities: ["oauth", "test"], implementation: "external/providers.server", tab: "external" },
];

export type HealthEvidence = {
  canonical?: {
    name?: string | null;
    enabled?: boolean;
    lastTestAt?: string | null;
    lastTestOk?: boolean | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    lastErrorAt?: string | null;
  } | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  lastSyncErrorAt?: string | null;
  lastEventAt?: string | null;
  legacy?: { status?: string | null; accountName?: string | null; lastSuccessAt?: string | null; lastError?: string | null } | null;
  envConfigured?: boolean;
  extra?: string[];
};

export type ProviderHealth = {
  id: string;
  label: string;
  state: HealthState;
  reason: string;
  account: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastSyncAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  capabilities: Capability[];
  implementation: string;
  tab?: string;
  facts: string[];
};

const STALE_MS = 7 * 864e5;
const t = (s?: string | null) => (s ? Date.parse(s) || 0 : 0);
const max = (...xs: (string | null | undefined)[]) =>
  xs.reduce<string | null>((a, b) => (t(b) > t(a) ? (b as string) : a), null);

export function normalizeHealth(meta: ProviderMeta, ev: HealthEvidence, now = Date.now()): ProviderHealth {
  const c = ev.canonical ?? null;
  // Лише успішний API-тест або синхронізація; вебхук/подія — інформативно.
  const lastGood = max(c?.lastSuccessAt, c?.lastTestOk ? c?.lastTestAt : null, ev.lastSyncAt);
  const lastBad = max(c?.lastErrorAt, c?.lastTestOk === false ? c?.lastTestAt : null, ev.lastSyncErrorAt);
  const lastError = (t(lastBad) > 0 ? (ev.lastSyncErrorAt === lastBad ? ev.lastSyncError : c?.lastError) : null) ?? c?.lastError ?? ev.lastSyncError ?? null;

  let state: HealthState;
  let reason: string;
  if (c && c.enabled === false) {
    state = "configured"; reason = "Вимкнено в реєстрі інтеграцій";
  } else if (t(lastBad) > t(lastGood)) {
    state = "error"; reason = "Остання перевірка/синхронізація завершилась помилкою";
  } else if (lastGood && now - t(lastGood) <= STALE_MS) {
    state = "connected"; reason = "Підтверджено успішним API-запитом або синхронізацією";
  } else if (lastGood) {
    state = "degraded"; reason = "Останній успіх старший за 7 днів";
  } else if (ev.legacy && ev.legacy.status === "connected") {
    state = "legacy"; reason = "Лише legacy-статус маркетингу — не підтверджено";
  } else if (ev.envConfigured || c) {
    state = "configured"; reason = "Конфігурацію виявлено, успішної перевірки немає";
  } else {
    state = "not_configured"; reason = "Не налаштовано";
  }

  return {
    id: meta.id, label: meta.label, state, reason,
    account: c?.name ?? ev.legacy?.accountName ?? null,
    lastTestAt: c?.lastTestAt ?? null,
    lastTestOk: c?.lastTestOk ?? null,
    lastSyncAt: ev.lastSyncAt ?? c?.lastSuccessAt ?? null,
    lastEventAt: ev.lastEventAt ?? null,
    lastError: state === "connected" ? null : lastError,
    capabilities: meta.capabilities,
    implementation: meta.implementation,
    tab: meta.tab,
    facts: ev.extra ?? [],
  };
}

export type ReadinessMetric = { label: string; count: number | null; total: number | null };
