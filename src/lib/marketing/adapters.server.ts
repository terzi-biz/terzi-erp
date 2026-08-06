/**
 * Адаптери маркетингових інтеграцій. Єдиний інтерфейс, реальні виклики API
 * додаються поетапно. Секрети читаються лише тут, на сервері.
 */

export type ProviderTest = { ok: boolean; configured: boolean; message: string };

const ENV_BY_PROVIDER: Record<string, string[]> = {
  ga4: ["GA4_PROPERTY_ID", "GOOGLE_ANALYTICS_API_KEY"],
  google_ads: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"],
  meta_ads: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
  tiktok_ads: ["TIKTOK_ADS_ACCESS_TOKEN"],
  site_forms: ["ERP_PUBLIC_BASE_URL"],
  adsquiz: ["ADSQUIZ_WEBHOOK_TOKEN"],
  binotel: ["BINOTEL_API_KEY", "BINOTEL_API_SECRET"],
  instagram: ["META_ADS_ACCESS_TOKEN"],
  facebook: ["META_ADS_ACCESS_TOKEN"],
  whatsapp: ["WHATSAPP_TOKEN"],
  telegram: ["TELEGRAM_BOT_TOKEN"],
  viber: ["VIBER_TOKEN"],
  olx: ["OLX_CLIENT_ID", "OLX_CLIENT_SECRET"],
  gtm: ["GTM_CONTAINER_ID"],
  gsc: ["GSC_SITE_URL"],
  email: ["RESEND_API_KEY"],
};

export function requiredEnv(provider: string): string[] {
  return ENV_BY_PROVIDER[provider] ?? [];
}

/** Перевірка конфігурації провайдера. Не імітує успіх, якщо ключів немає. */
export async function testProvider(provider: string): Promise<ProviderTest> {
  const keys = requiredEnv(provider);
  if (!keys.length) return { ok: false, configured: false, message: "Адаптер підготовлено, конфігурація ще не описана" };
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    return { ok: false, configured: false, message: `Не задано: ${missing.join(", ")}` };
  }
  if (provider === "binotel") {
    try {
      const { binotelRequest } = await import("../integrations/binotel/client.server");
      await binotelRequest("stats/call-details", {});
      return { ok: true, configured: true, message: "Binotel відповідає" };
    } catch (e) {
      return { ok: false, configured: true, message: e instanceof Error ? e.message : "Помилка Binotel" };
    }
  }
  return { ok: true, configured: true, message: "Ключі знайдено, синхронізація буде увімкнена на наступному етапі" };
}
