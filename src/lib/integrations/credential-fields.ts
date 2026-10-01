/** Поля ключів, які адміністратор вводить сам. Значення ніколи не повертаються в браузер. */
export type CredentialField = { name: string; label: string; secret: boolean };
export type CredentialGroup = { provider: string; title: string; fields: CredentialField[] };

export const CREDENTIAL_GROUPS: CredentialGroup[] = [
  { provider: "finmap", title: "Finmap", fields: [
    { name: "FINMAP_API_KEY", label: "API-ключ", secret: true },
    { name: "FINMAP_WEBHOOK_TOKEN", label: "Токен вебхука", secret: true },
  ] },
  { provider: "keycrm", title: "keyCRM", fields: [{ name: "KEYCRM_API_KEY", label: "API-ключ", secret: true }] },
  { provider: "binotel", title: "Binotel", fields: [
    { name: "BINOTEL_API_KEY", label: "Key", secret: true },
    { name: "BINOTEL_API_SECRET", label: "Secret", secret: true },
    { name: "BINOTEL_COMPANY_ID", label: "ID компанії", secret: false },
    { name: "BINOTEL_WEBHOOK_TOKEN", label: "Токен вебхука", secret: true },
  ] },
  { provider: "meta_ads", title: "Meta Ads", fields: [
    { name: "META_ADS_ACCESS_TOKEN", label: "Access token", secret: true },
    { name: "META_ADS_ACCOUNT_ID", label: "ID рекламного кабінету", secret: false },
  ] },
  { provider: "google", title: "Google (Ads, GA4, Drive)", fields: [
    { name: "GOOGLE_OAUTH_CLIENT_ID", label: "OAuth Client ID", secret: false },
    { name: "GOOGLE_OAUTH_CLIENT_SECRET", label: "OAuth Client Secret", secret: true },
    { name: "GOOGLE_ADS_DEVELOPER_TOKEN", label: "Ads Developer Token", secret: true },
    { name: "GOOGLE_ADS_CUSTOMER_ID", label: "Ads Customer ID", secret: false },
    { name: "GOOGLE_ADS_LOGIN_CUSTOMER_ID", label: "Ads Login Customer ID (MCC)", secret: false },
    { name: "GA4_PROPERTY_ID", label: "GA4 Property ID (числовий)", secret: false },
  ] },
  { provider: "tiktok", title: "TikTok", fields: [
    { name: "TIKTOK_ADS_APP_ID", label: "Ads App ID", secret: false },
    { name: "TIKTOK_ADS_APP_SECRET", label: "Ads App Secret", secret: true },
    { name: "TIKTOK_ADS_ADVERTISER_ID", label: "Advertiser ID", secret: false },
  ] },
  { provider: "olx", title: "OLX", fields: [
    { name: "OLX_CLIENT_ID", label: "Client ID", secret: false },
    { name: "OLX_CLIENT_SECRET", label: "Client Secret", secret: true },
  ] },
  { provider: "messengers", title: "Месенджери", fields: [
    { name: "TELEGRAM_BOT_TOKEN", label: "Telegram bot token", secret: true },
    { name: "VIBER_BOT_TOKEN", label: "Viber bot token", secret: true },
    { name: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp access token", secret: true },
    { name: "WHATSAPP_PHONE_NUMBER_ID", label: "WhatsApp Phone Number ID", secret: false },
    { name: "WHATSAPP_VERIFY_TOKEN", label: "WhatsApp verify token", secret: true },
  ] },
];

export const CREDENTIAL_NAMES = new Set(CREDENTIAL_GROUPS.flatMap((g) => g.fields.map((f) => f.name)));
export const CREDENTIAL_PROVIDER = new Map(CREDENTIAL_GROUPS.flatMap((g) => g.fields.map((f) => [f.name, g.provider] as const)));
