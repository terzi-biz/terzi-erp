/**
 * Реєстр зовнішніх підключень (клієнт-безпечний довідник).
 *
 * Тут немає жодного секрету — лише опис того, що потрібно для підключення,
 * офіційне посилання на отримання credentials і спосіб авторизації.
 * Статус «Підключено» виставляється лише після реального виклику API
 * (див. `providers.server.ts`), наявність ключів сама по собі не є доказом.
 */

export type ExternalAuthKind = "google_oauth" | "oauth2" | "token";
export type ExternalGroup = "ads" | "analytics" | "workspace" | "marketplace" | "messenger";

export type ExternalProvider = {
  key: string;
  label: string;
  group: ExternalGroup;
  auth: ExternalAuthKind;
  /** Ключі, без яких підключення неможливе. */
  requiredEnv: string[];
  /** Ключі, які розширюють можливості, але не блокують авторизацію. */
  optionalEnv: string[];
  /** Офіційна сторінка, де беруться credentials. */
  docsUrl: string;
  /** Короткий опис реального тесту з'єднання. */
  test: string;
  /** Шлях вхідного вебхука (месенджери). */
  webhookPath?: string;
  note: string;
};

export const EXTERNAL_PROVIDERS: ExternalProvider[] = [
  {
    key: "google_ads",
    label: "Google Ads",
    group: "ads",
    auth: "google_oauth",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_CUSTOMER_ID"],
    optionalEnv: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_LOGIN_CUSTOMER_ID"],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    test: "customer.get через Google Ads API",
    note: "Авторизація працює без Developer Token. Для реальних запитів до Ads API потрібен GOOGLE_ADS_DEVELOPER_TOKEN.",
  },
  {
    key: "ga4",
    label: "Google Analytics 4",
    group: "analytics",
    auth: "google_oauth",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GA4_PROPERTY_ID"],
    optionalEnv: [],
    docsUrl: "https://analytics.google.com/analytics/web/#/a/admin/property/settings",
    test: "GA4 Admin API: метадані ресурсу",
    note: "GA4_PROPERTY_ID — числовий ID ресурсу, не Measurement ID виду G-XXXXXXX.",
  },
  {
    key: "google_workspace",
    label: "Google Drive і Sheets",
    group: "workspace",
    auth: "google_oauth",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    optionalEnv: [],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    test: "Drive API: about.get (обліковий запис і квота)",
    note: "Мінімальні дозволи: читання Drive і доступ до таблиць. Запис — лише за явною дією в ERP.",
  },
  {
    key: "youtube",
    label: "YouTube",
    group: "workspace",
    auth: "google_oauth",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    optionalEnv: [],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    test: "YouTube Data API: channels.list(mine=true)",
    note: "Окреме підключення зі своїм дозволом, не частина Google Ads.",
  },
  {
    key: "tiktok_ads",
    label: "TikTok Ads",
    group: "ads",
    auth: "oauth2",
    requiredEnv: ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_APP_SECRET"],
    optionalEnv: ["TIKTOK_ADS_ADVERTISER_ID"],
    docsUrl: "https://business-api.tiktok.com/portal/docs?id=1738373141733378",
    test: "advertiser/info: рекламний кабінет",
    note: "Рекламний кабінет. Окремо від органічного TikTok.",
  },
  {
    key: "tiktok_organic",
    label: "TikTok Organic",
    group: "marketplace",
    auth: "oauth2",
    requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    optionalEnv: [],
    docsUrl: "https://developers.tiktok.com/apps",
    test: "Display API: user.info.basic",
    note: "Органічний акаунт: профіль і публікації. Витрати не обліковуються.",
  },
  {
    key: "olx",
    label: "OLX",
    group: "marketplace",
    auth: "oauth2",
    requiredEnv: ["OLX_CLIENT_ID", "OLX_CLIENT_SECRET"],
    optionalEnv: [],
    docsUrl: "https://developer.olx.ua/api/doc",
    test: "GET /api/partner/users/me",
    note: "Партнерський API OLX з автоматичним оновленням токена.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp Cloud API",
    group: "messenger",
    auth: "token",
    requiredEnv: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    optionalEnv: ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_VERIFY_TOKEN"],
    docsUrl: "https://developers.facebook.com/apps",
    test: "Graph API: картка номера телефону",
    webhookPath: "/api/public/integrations/messenger/whatsapp",
    note: "Вхідні повідомлення і статуси доставки через вебхук Meta.",
  },
  {
    key: "viber",
    label: "Viber Bot API",
    group: "messenger",
    auth: "token",
    requiredEnv: ["VIBER_BOT_TOKEN"],
    optionalEnv: ["VIBER_BOT_NAME"],
    docsUrl: "https://partners.viber.com/account/create-bot-account",
    test: "get_account_info офіційного акаунта",
    webhookPath: "/api/public/integrations/messenger/viber",
    note: "Вебхук реєструється автоматично під час тесту з'єднання.",
  },
  {
    key: "telegram",
    label: "Telegram Bot API",
    group: "messenger",
    auth: "token",
    requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    optionalEnv: [],
    docsUrl: "https://t.me/BotFather",
    test: "getMe і реєстрація вебхука з секретом",
    webhookPath: "/api/public/integrations/messenger/telegram",
    note: "Вхідні повідомлення перевіряються секретним заголовком Telegram.",
  },
];

const BY_KEY = new Map(EXTERNAL_PROVIDERS.map((p) => [p.key, p]));

export function getExternalProvider(key: string): ExternalProvider | null {
  return BY_KEY.get(key) ?? null;
}

export const EXTERNAL_STATUS_LABEL: Record<string, string> = {
  not_configured: "Не налаштовано",
  authorization_required: "Потрібна авторизація",
  oauth_connected: "Авторизовано, потрібен доступ до API",
  connected: "Підключено",
  error: "Помилка",
  token_expired: "Термін токена минув",
  permission_error: "Недостатньо прав",
};
