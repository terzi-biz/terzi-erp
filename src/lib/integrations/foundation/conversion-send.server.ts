/**
 * W2.2 — тестові відправники офлайн-конверсій (Google Ads validateOnly, Meta CAPI test_event_code).
 * Жоден шлях не виконує реальну (live) відправку. off/dry_run/невідомий режим → без мережі.
 * Click ID, токени й PII ніколи не логуються і не повертаються в повідомленнях.
 */
import process from "node:process";
import { API_VERSION as GOOGLE_API_VERSION, googleAdsEnv } from "./google-ads.server";

export type SendMode = "off" | "dry_run" | "test" | "live";
export type SendOutcome = {
  ok: boolean;
  state: "skipped" | "blocked" | "validated" | "test_sent" | "provider_error";
  message: string;
  httpStatus?: number;
  /** true → повтори не мають сенсу (конфіг/режим/помилка валідації). */
  permanent: boolean;
  details?: unknown;
};

export function parseSendMode(v: unknown): SendMode {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "off" || s === "test" || s === "live" ? (s as SendMode) : "dry_run";
}

/** Режим = мінімум із payload і конфігу: test лише якщо обидва test; live завжди блокується у W2.2. */
export function effectiveMode(payloadMode: unknown, configMode: unknown): SendMode {
  const p = parseSendMode(payloadMode); const c = parseSendMode(configMode);
  if (p === "off" || c === "off") return "off";
  if (p === "live" || c === "live") return "live";
  if (p === "test" && c === "test") return "test";
  return "dry_run";
}

const skip = (mode: SendMode): SendOutcome =>
  mode === "live"
    ? { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: "Live-відправка заборонена у W2.2" }
    : { ok: true, state: "skipped", permanent: true, message: `Режим ${mode}: без мережевих викликів` };

/** Прибирає з тексту помилки токени, click ID та email/телефони. */
export function redact(text: string, secrets: (string | null | undefined)[] = []): string {
  let t = String(text ?? "");
  for (const s of secrets) if (s && s.length >= 4) t = t.split(s).join("[redacted]");
  return t
    .replace(/(access_token|token|gclid|gbraid|wbraid|fbclid)=([^&\s"]+)/gi, "$1=[redacted]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "[phone]")
    .slice(0, 300);
}

// ───────────────────────────── Google Ads ─────────────────────────────

export function normalizeConversionAction(raw: unknown, customerId: string): string | null {
  const s = String(raw ?? "").trim();
  const cid = customerId.replace(/\D/g, "");
  if (!cid) return null;
  const m = s.match(/^customers\/(\d+)\/conversionActions\/(\d+)$/);
  if (m) return m[1] === cid ? s : null;
  return /^\d+$/.test(s) ? `customers/${cid}/conversionActions/${s}` : null;
}

/** ISO → "yyyy-mm-dd hh:mm:ss+00:00" (UTC, детерміновано). */
export function toGoogleDateTime(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

export type GoogleDeps = {
  fetch: typeof fetch;
  env: ReturnType<typeof googleAdsEnv>;
  accessToken: () => Promise<string>;
};

export function buildGoogleClickConversion(draft: Record<string, any>, kind: string, config: Record<string, any>, customerId: string) {
  const type = draft.click_id_type as "gclid" | "gbraid" | "wbraid" | undefined;
  if (!type || !draft[type]) return { error: "У драфті немає обраного click ID" } as const;
  const action = normalizeConversionAction(config?.conversion_actions?.[kind], customerId);
  if (!action) return { error: `Не налаштовано conversion_actions.${kind} (UPLOAD_CLICKS ID або resource name)` } as const;
  const dt = toGoogleDateTime(String(draft.conversion_date_time ?? ""));
  if (!dt) return { error: "Некоректний час конверсії" } as const;
  const conv: Record<string, unknown> = { conversionAction: action, conversionDateTime: dt, orderId: String(draft.transaction_id), [type]: draft[type] };
  if (draft.conversion_value != null && draft.currency_code) { conv.conversionValue = draft.conversion_value; conv.currencyCode = draft.currency_code; }
  if (draft.ad_user_data_consent) conv.consent = { adUserData: draft.ad_user_data_consent };
  return { conversion: conv } as const;
}

export async function sendGoogleConversion(
  a: { draft: Record<string, any> | null; kind: string; config: Record<string, any>; payloadMode: unknown },
  deps: Partial<GoogleDeps> = {},
): Promise<SendOutcome> {
  const mode = effectiveMode(a.payloadMode, a.config?.send_mode);
  if (mode !== "test") return skip(mode);
  if (!a.draft) return { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: "Драфт не готовий" };
  const env = deps.env ?? googleAdsEnv();
  // Upload через Lovable gateway не підтверджено → лише власний OAuth REST.
  const missing = (["clientId", "clientSecret", "refreshToken", "developerToken", "customerId"] as const)
    .filter((k) => !env[k])
    .map((k) => ({ clientId: "GOOGLE_OAUTH_CLIENT_ID", clientSecret: "GOOGLE_OAUTH_CLIENT_SECRET", refreshToken: "GOOGLE_ADS_REFRESH_TOKEN", developerToken: "GOOGLE_ADS_DEVELOPER_TOKEN", customerId: "GOOGLE_ADS_CUSTOMER_ID" })[k]);
  if (missing.length) return { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: `Google Ads upload: не задано ${missing.join(", ")}` };
  const built = buildGoogleClickConversion(a.draft, a.kind, a.config, env.customerId!);
  if ("error" in built) return { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: built.error! };
  const f = deps.fetch ?? fetch;
  let token = "";
  try {
    token = await (deps.accessToken ?? (await import("./google-ads.server")).googleAccessToken)();
    const res = await f(`https://googleads.googleapis.com/${GOOGLE_API_VERSION}/customers/${env.customerId}:uploadClickConversions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`, "developer-token": env.developerToken!, "content-type": "application/json",
        ...(env.loginCustomerId ? { "login-customer-id": env.loginCustomerId } : {}),
      },
      body: JSON.stringify({ conversions: [built.conversion], partialFailure: true, validateOnly: true }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    const secrets = [token, env.developerToken, String(a.draft[a.draft.click_id_type] ?? "")];
    if (!res.ok) {
      const msg = redact(json?.error?.message ?? `HTTP ${res.status}`, secrets);
      return { ok: false, state: "provider_error", permanent: res.status >= 400 && res.status < 500 && res.status !== 429, httpStatus: res.status, message: `Google Ads: ${msg}` };
    }
    if (json?.partialFailureError) {
      return { ok: false, state: "provider_error", permanent: true, httpStatus: 422, message: `Google Ads partial failure: ${redact(json.partialFailureError.message ?? "", secrets)}` };
    }
    return { ok: true, state: "validated", permanent: true, message: "Google Ads validateOnly: OK" };
  } catch (e) {
    return { ok: false, state: "provider_error", permanent: false, message: redact(String((e as Error)?.message ?? e), [token]) };
  }
}

// ───────────────────────────── Meta CAPI ─────────────────────────────

export type MetaDeps = { fetch: typeof fetch; env: Record<string, string | undefined> };

export async function sendMetaConversion(
  a: { draft: Record<string, any> | null; config: Record<string, any>; payloadMode: unknown },
  deps: Partial<MetaDeps> = {},
): Promise<SendOutcome> {
  const mode = effectiveMode(a.payloadMode, a.config?.send_mode);
  if (mode !== "test") return skip(mode);
  if (!a.draft) return { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: "Драфт не готовий" };
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const dataset = String(a.config?.dataset_id ?? a.config?.pixel_id ?? env.META_DATASET_ID ?? env.META_PIXEL_ID ?? "").trim();
  const token = env.META_ADS_ACCESS_TOKEN ?? "";
  const testCode = String(a.config?.test_event_code ?? "").trim();
  const missing = [!dataset && "dataset_id / META_DATASET_ID / META_PIXEL_ID", !token && "META_ADS_ACCESS_TOKEN", !testCode && "test_event_code"].filter(Boolean);
  if (missing.length) return { ok: false, state: "blocked", permanent: true, httpStatus: 424, message: `Meta CAPI test: не задано ${missing.join(", ")}` };
  const version = env.META_ADS_API_VERSION ?? "v21.0";
  const d = a.draft;
  const event: Record<string, unknown> = {
    event_name: d.event_name, event_time: d.event_time, event_id: d.event_id, action_source: d.action_source, user_data: d.user_data,
    ...(d.custom_data ? { custom_data: d.custom_data } : {}),
  };
  const f = deps.fetch ?? fetch;
  try {
    const res = await f(`https://graph.facebook.com/${version}/${encodeURIComponent(dataset)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: [event], test_event_code: testCode, access_token: token }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { ok: false, state: "provider_error", permanent: res.status >= 400 && res.status < 500 && res.status !== 429, httpStatus: res.status, message: `Meta CAPI: ${redact(json?.error?.message ?? `HTTP ${res.status}`, [token])}` };
    }
    return { ok: true, state: "test_sent", permanent: true, message: `Meta CAPI test: прийнято ${Number(json?.events_received ?? 0)}` };
  } catch (e) {
    return { ok: false, state: "provider_error", permanent: false, message: redact(String((e as Error)?.message ?? e), [token]) };
  }
}
