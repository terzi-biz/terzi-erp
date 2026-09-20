/**
 * Зовнішні провайдери: OAuth, автооновлення токенів і РЕАЛЬНІ тести API.
 *
 * Лише сервер. Секрети читаються всередині функцій (Workers biнд env на запит)
 * і ніколи не повертаються в клієнт. Статус «Підключено» ставиться тільки
 * після фактично успішної відповіді API провайдера.
 */
import process from "node:process";
import { getExternalProvider } from "./registry";
import { connectionView, markError, markSuccess, patchConfig, readTokens, saveTokens } from "./store.server";
import type { ExternalConnectionView } from "./store.server";

export function env(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

const GOOGLE_SCOPES: Record<string, string> = {
  google_ads: "https://www.googleapis.com/auth/adwords",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  google_workspace:
    "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets",
  youtube: "https://www.googleapis.com/auth/youtube.readonly",
};

type OauthConfig = {
  authUrl: string;
  tokenUrl: string;
  clientId: string | null;
  clientSecret: string | null;
  scope: string | null;
  /** TikTok Ads і OLX очікують JSON, Google — form-urlencoded. */
  tokenFormat: "form" | "json";
  extraAuth?: Record<string, string>;
  clientIdParam?: string;
  clientSecretParam?: string;
  codeParam?: string;
};

export function oauthConfig(provider: string): OauthConfig | null {
  const e = env();
  if (GOOGLE_SCOPES[provider]) {
    return {
      authUrl: GOOGLE_AUTH,
      tokenUrl: GOOGLE_TOKEN,
      clientId: e.GOOGLE_OAUTH_CLIENT_ID ?? null,
      clientSecret: e.GOOGLE_OAUTH_CLIENT_SECRET ?? null,
      scope: GOOGLE_SCOPES[provider]!,
      tokenFormat: "form",
      extraAuth: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    };
  }
  if (provider === "tiktok_ads") {
    return {
      authUrl: "https://business-api.tiktok.com/portal/auth",
      tokenUrl: "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      clientId: e.TIKTOK_ADS_APP_ID ?? null,
      clientSecret: e.TIKTOK_ADS_APP_SECRET ?? null,
      scope: null,
      tokenFormat: "json",
      clientIdParam: "app_id",
      clientSecretParam: "secret",
      codeParam: "auth_code",
    };
  }
  if (provider === "tiktok_organic") {
    return {
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      clientId: e.TIKTOK_CLIENT_KEY ?? null,
      clientSecret: e.TIKTOK_CLIENT_SECRET ?? null,
      scope: "user.info.basic,video.list",
      tokenFormat: "form",
      clientIdParam: "client_key",
    };
  }
  if (provider === "olx") {
    return {
      authUrl: "https://www.olx.ua/oauth/authorize/",
      tokenUrl: "https://www.olx.ua/api/open/oauth/token",
      clientId: e.OLX_CLIENT_ID ?? null,
      clientSecret: e.OLX_CLIENT_SECRET ?? null,
      scope: "read write v2",
      tokenFormat: "json",
    };
  }
  return null;
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/public/integrations/external/callback`;
}

export function buildAuthUrl(provider: string, origin: string, state: string): string {
  const cfg = oauthConfig(provider);
  if (!cfg) throw new Error(`Провайдер «${provider}» не використовує OAuth`);
  if (!cfg.clientId) throw new Error("Не задано client_id провайдера");
  const params = new URLSearchParams({
    [cfg.clientIdParam ?? "client_id"]: cfg.clientId,
    redirect_uri: callbackUrl(origin),
    state,
  });
  if (provider !== "tiktok_ads") {
    params.set("response_type", "code");
    if (cfg.scope) params.set("scope", cfg.scope);
  }
  for (const [k, v] of Object.entries(cfg.extraAuth ?? {})) params.set(k, v);
  return `${cfg.authUrl}?${params}`;
}

type TokenResponse = { accessToken: string; refreshToken: string | null; expiresIn: number | null; scope: string | null };

function readTokenPayload(json: any): TokenResponse | null {
  // TikTok Ads і OLX кладуть корисні дані в `data`.
  const d = json?.data ?? json;
  const accessToken = d?.access_token ?? d?.accessToken;
  if (!accessToken) return null;
  return {
    accessToken: String(accessToken),
    refreshToken: d?.refresh_token ? String(d.refresh_token) : null,
    expiresIn: d?.expires_in ? Number(d.expires_in) : null,
    scope: d?.scope ? String(d.scope) : null,
  };
}

async function postToken(cfg: OauthConfig, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers:
      cfg.tokenFormat === "json"
        ? { "content-type": "application/json", accept: "application/json" }
        : { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: cfg.tokenFormat === "json" ? JSON.stringify(body) : new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  const parsed = readTokenPayload(json);
  if (!res.ok || !parsed) {
    const msg = json?.error_description ?? json?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`OAuth: ${String(msg)}`);
  }
  return parsed;
}

export async function exchangeCode(provider: string, code: string, origin: string): Promise<void> {
  const cfg = oauthConfig(provider);
  if (!cfg) throw new Error(`Провайдер «${provider}» не використовує OAuth`);
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("Не задано client_id/client_secret провайдера");
  const body: Record<string, string> = {
    [cfg.clientIdParam ?? "client_id"]: cfg.clientId,
    [cfg.clientSecretParam ?? "client_secret"]: cfg.clientSecret,
    [cfg.codeParam ?? "code"]: code,
  };
  if (provider !== "tiktok_ads") {
    body.grant_type = "authorization_code";
    body.redirect_uri = callbackUrl(origin);
  }
  const tokens = await postToken(cfg, body);
  await saveTokens(provider, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresInSec: tokens.expiresIn,
    scopes: tokens.scope,
  });
  await patchConfig(provider, { external_status: "oauth_connected" });
}

/** Оновлення access token. Користувач нічого не робить вручну. */
export async function refreshAccessToken(provider: string): Promise<string | null> {
  const cfg = oauthConfig(provider);
  const stored = await readTokens(provider);
  if (!cfg || !stored.refreshToken || !cfg.clientId || !cfg.clientSecret) return null;
  const body: Record<string, string> = {
    [cfg.clientIdParam ?? "client_id"]: cfg.clientId,
    [cfg.clientSecretParam ?? "client_secret"]: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
  };
  const tokens = await postToken(cfg, body);
  await saveTokens(provider, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? stored.refreshToken,
    expiresInSec: tokens.expiresIn,
    scopes: tokens.scope ?? stored.scopes,
  });
  return tokens.accessToken;
}

/** Дійсний access token: оновлюється автоматично за 2 хв до закінчення. */
export async function accessTokenFor(provider: string): Promise<string | null> {
  const stored = await readTokens(provider);
  const expiringSoon = stored.expiresAt ? new Date(stored.expiresAt).getTime() - Date.now() < 120_000 : false;
  if (stored.accessToken && !expiringSoon) return stored.accessToken;
  if (stored.refreshToken) {
    const fresh = await refreshAccessToken(provider);
    if (fresh) return fresh;
  }
  return stored.accessToken;
}

export type TestResult = { ok: boolean; status: string; message: string; accountLabel: string | null };

async function jsonFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as any;
  return { ok: res.ok, status: res.status, json };
}

function apiMessage(json: any, status: number): string {
  return String(json?.error?.message ?? json?.message ?? json?.error_description ?? json?.error ?? `HTTP ${status}`);
}

async function testGoogleAds(token: string): Promise<TestResult> {
  const e = env();
  const customerId = (e.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/\D/g, "");
  if (!customerId) return { ok: false, status: "not_configured", message: "Не задано GOOGLE_ADS_CUSTOMER_ID", accountLabel: null };
  const devToken = e.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) {
    return {
      ok: false,
      status: "oauth_connected",
      message: "Авторизація Google пройдена. Для запитів до Ads API потрібен Developer Token.",
      accountLabel: `Google Ads ${customerId}`,
    };
  }
  const loginId = (e.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "");
  const r = await jsonFetch(`https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "developer-token": devToken,
      ...(loginId ? { "login-customer-id": loginId } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
    }),
  });
  if (!r.ok) {
    const msg = apiMessage(r.json?.[0] ?? r.json, r.status);
    return { ok: false, status: r.status === 403 ? "permission_error" : "error", message: msg, accountLabel: null };
  }
  const c = r.json?.results?.[0]?.customer ?? {};
  const label = `${c.descriptiveName ?? "Google Ads"} (${c.id ?? customerId}${c.currencyCode ? `, ${c.currencyCode}` : ""})`;
  return { ok: true, status: "connected", message: "Google Ads API відповів", accountLabel: label };
}

async function testGa4(token: string): Promise<TestResult> {
  const propertyId = (env().GA4_PROPERTY_ID ?? "").replace(/\D/g, "");
  if (!propertyId) {
    return { ok: false, status: "not_configured", message: "GA4_PROPERTY_ID має бути числовим ID ресурсу, не G-XXXXXXX", accountLabel: null };
  }
  const r = await jsonFetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: r.status === 403 ? "permission_error" : "error", message: apiMessage(r.json, r.status), accountLabel: null };
  return { ok: true, status: "connected", message: "GA4 Admin API відповів", accountLabel: String(r.json?.displayName ?? `GA4 ${propertyId}`) };
}

async function testDrive(token: string): Promise<TestResult> {
  const r = await jsonFetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: r.status === 403 ? "permission_error" : "error", message: apiMessage(r.json, r.status), accountLabel: null };
  return { ok: true, status: "connected", message: "Drive API відповів", accountLabel: String(r.json?.user?.emailAddress ?? "Google Drive") };
}

async function testYoutube(token: string): Promise<TestResult> {
  const r = await jsonFetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: r.status === 403 ? "permission_error" : "error", message: apiMessage(r.json, r.status), accountLabel: null };
  const title = r.json?.items?.[0]?.snippet?.title;
  if (!title) return { ok: false, status: "permission_error", message: "Канал YouTube не знайдено для цього облікового запису", accountLabel: null };
  return { ok: true, status: "connected", message: "YouTube Data API відповів", accountLabel: String(title) };
}

async function testTiktokAds(token: string): Promise<TestResult> {
  const advertiserId = env().TIKTOK_ADS_ADVERTISER_ID;
  const url = advertiserId
    ? `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify([advertiserId]))}`
    : `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=${env().TIKTOK_ADS_APP_ID ?? ""}&secret=${env().TIKTOK_ADS_APP_SECRET ?? ""}`;
  const r = await jsonFetch(url, { headers: { "Access-Token": token } });
  const code = Number(r.json?.code ?? 0);
  if (!r.ok || code !== 0) return { ok: false, status: "error", message: String(r.json?.message ?? `HTTP ${r.status}`), accountLabel: null };
  const list = r.json?.data?.list ?? [];
  const name = list[0]?.advertiser_name ?? list[0]?.name ?? advertiserId ?? "TikTok Ads";
  return { ok: true, status: "connected", message: "TikTok Marketing API відповів", accountLabel: String(name) };
}

async function testTiktokOrganic(token: string): Promise<TestResult> {
  const r = await jsonFetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok || r.json?.error?.code && r.json.error.code !== "ok") {
    return { ok: false, status: "error", message: apiMessage(r.json, r.status), accountLabel: null };
  }
  const u = r.json?.data?.user ?? {};
  return { ok: true, status: "connected", message: "TikTok Display API відповів", accountLabel: String(u.display_name ?? u.username ?? "TikTok") };
}

async function testOlx(token: string): Promise<TestResult> {
  const r = await jsonFetch("https://www.olx.ua/api/partner/users/me", {
    headers: { authorization: `Bearer ${token}`, version: "2.0", accept: "application/json" },
  });
  if (!r.ok) return { ok: false, status: r.status === 401 ? "token_expired" : "error", message: apiMessage(r.json, r.status), accountLabel: null };
  const d = r.json?.data ?? r.json;
  return { ok: true, status: "connected", message: "OLX Partner API відповів", accountLabel: String(d?.name ?? d?.email ?? "OLX") };
}

async function testWhatsapp(): Promise<TestResult> {
  const e = env();
  const token = e.WHATSAPP_ACCESS_TOKEN;
  const phoneId = e.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, status: "not_configured", message: "Не задано WHATSAPP_ACCESS_TOKEN або WHATSAPP_PHONE_NUMBER_ID", accountLabel: null };
  const r = await jsonFetch(`https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return { ok: false, status: r.status === 401 ? "token_expired" : "error", message: apiMessage(r.json, r.status), accountLabel: null };
  return {
    ok: true,
    status: "connected",
    message: "WhatsApp Cloud API відповів",
    accountLabel: `${r.json?.verified_name ?? "WhatsApp"} ${r.json?.display_phone_number ?? ""}`.trim(),
  };
}

async function testViber(origin: string): Promise<TestResult> {
  const e = env();
  const token = e.VIBER_BOT_TOKEN;
  if (!token) return { ok: false, status: "not_configured", message: "Не задано VIBER_BOT_TOKEN", accountLabel: null };
  const info = await jsonFetch("https://chatapi.viber.com/pa/get_account_info", {
    method: "POST",
    headers: { "X-Viber-Auth-Token": token, "content-type": "application/json" },
    body: "{}",
  });
  if (!info.ok || Number(info.json?.status ?? 1) !== 0) {
    return { ok: false, status: "error", message: String(info.json?.status_message ?? `HTTP ${info.status}`), accountLabel: null };
  }
  await fetch("https://chatapi.viber.com/pa/set_webhook", {
    method: "POST",
    headers: { "X-Viber-Auth-Token": token, "content-type": "application/json" },
    body: JSON.stringify({
      url: `${origin}/api/public/integrations/messenger/viber`,
      event_types: ["message", "subscribed", "conversation_started"],
    }),
  });
  return { ok: true, status: "connected", message: "Viber Bot API відповів, вебхук зареєстровано", accountLabel: String(info.json?.name ?? e.VIBER_BOT_NAME ?? "Viber") };
}

async function testTelegram(origin: string): Promise<TestResult> {
  const e = env();
  const token = e.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: "not_configured", message: "Не задано TELEGRAM_BOT_TOKEN", accountLabel: null };
  const me = await jsonFetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!me.ok || !me.json?.ok) return { ok: false, status: "error", message: String(me.json?.description ?? `HTTP ${me.status}`), accountLabel: null };
  const secret = e.TELEGRAM_WEBHOOK_SECRET ?? null;
  await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${origin}/api/public/integrations/messenger/telegram`,
      ...(secret ? { secret_token: secret } : {}),
      allowed_updates: ["message", "callback_query"],
    }),
  });
  return { ok: true, status: "connected", message: "Telegram Bot API відповів, вебхук зареєстровано", accountLabel: `@${me.json?.result?.username ?? "bot"}` };
}

/** Реальний тест підключення. Жодних припущень: тільки відповідь API. */
export async function testExternal(provider: string, origin: string): Promise<TestResult> {
  const meta = getExternalProvider(provider);
  if (!meta) throw new Error(`Невідомий провайдер «${provider}»`);
  const e = env();
  const missing = meta.requiredEnv.filter((k) => !e[k]);
  if (missing.length) {
    const result: TestResult = { ok: false, status: "not_configured", message: `Не задано: ${missing.join(", ")}`, accountLabel: null };
    await markError(provider, result.message, "not_configured");
    return result;
  }

  let result: TestResult;
  try {
    if (meta.auth === "token") {
      result =
        provider === "whatsapp" ? await testWhatsapp() : provider === "viber" ? await testViber(origin) : await testTelegram(origin);
    } else {
      const token = await accessTokenFor(provider);
      if (!token) {
        result = { ok: false, status: "authorization_required", message: "Потрібно натиснути «Підключити» і завершити авторизацію", accountLabel: null };
      } else if (provider === "google_ads") result = await testGoogleAds(token);
      else if (provider === "ga4") result = await testGa4(token);
      else if (provider === "google_workspace") result = await testDrive(token);
      else if (provider === "youtube") result = await testYoutube(token);
      else if (provider === "tiktok_ads") result = await testTiktokAds(token);
      else if (provider === "tiktok_organic") result = await testTiktokOrganic(token);
      else if (provider === "olx") result = await testOlx(token);
      else result = { ok: false, status: "error", message: "Тест для провайдера не реалізовано", accountLabel: null };
    }
  } catch (err) {
    result = { ok: false, status: "error", message: err instanceof Error ? err.message : "Невідома помилка", accountLabel: null };
  }

  if (result.ok) await markSuccess(provider, result.accountLabel, "connected");
  else await markError(provider, result.message, result.status as any);
  return result;
}

export async function listExternal(): Promise<ExternalConnectionView[]> {
  const e = env();
  const out: ExternalConnectionView[] = [];
  for (const p of (await import("./registry")).EXTERNAL_PROVIDERS) {
    out.push(await connectionView(p.key, e));
  }
  return out;
}
