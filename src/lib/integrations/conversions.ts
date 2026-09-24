/**
 * Підготовка офлайн-конверсій Google Ads / Meta Ads.
 *
 * Ланцюг ERP: lead → qualified → measurement → estimate → order → payment/revenue.
 * Модуль ЛИШЕ формує payload і повертає причину блокування — реальні виклики
 * провайдерів не виконуються.
 *
 * Гроші: цінність конверсії береться виключно з фактичної оплати (payments).
 * Кошторис не є доходом і ніколи не передається як value.
 */
import type { Attribution } from "@/lib/marketing/attribution-fields";

export type FunnelStage = "lead" | "qualified" | "measurement" | "estimate" | "order" | "payment";

export const STAGE_LABEL: Record<FunnelStage, string> = {
  lead: "Лід",
  qualified: "Кваліфікований лід",
  measurement: "Замір",
  estimate: "Кошторис",
  order: "Замовлення",
  payment: "Оплата",
};

export const STAGE_ACTION: Record<FunnelStage, { google: string; meta: string; monetary: boolean }> = {
  lead: { google: "TERZI Lead", meta: "Lead", monetary: false },
  qualified: { google: "TERZI Qualified Lead", meta: "QualifiedLead", monetary: false },
  measurement: { google: "TERZI Measurement", meta: "Schedule", monetary: false },
  estimate: { google: "TERZI Estimate Sent", meta: "InitiateCheckout", monetary: false },
  order: { google: "TERZI Order", meta: "Purchase", monetary: false },
  payment: { google: "TERZI Payment", meta: "Purchase", monetary: true },
};

export type ConversionInput = {
  provider: "google_ads" | "meta_ads";
  stage: FunnelStage;
  attribution: Attribution;
  occurredAt: string;
  /** Фактично отримана сума (лише з payments). Кошториси сюди не потрапляють. */
  paidAmount?: number | null;
  currency?: string;
  /** Хеші контактних даних для Meta (передає викликач; тут PII не обчислюється). */
  hashedPhone?: string | null;
  hashedEmail?: string | null;
};

export type ConversionPrepared = {
  provider: ConversionInput["provider"];
  stage: FunnelStage;
  action: string;
  ready: boolean;
  /** Причина, чому подія не готова до відправлення. */
  blocked: string | null;
  payload: Record<string, unknown> | null;
};

/** Формує payload офлайн-конверсії. Нічого не надсилає. */
export function prepareOfflineConversion(input: ConversionInput): ConversionPrepared {
  const spec = STAGE_ACTION[input.stage];
  const action = input.provider === "google_ads" ? spec.google : spec.meta;
  const a = input.attribution;

  const clickId =
    input.provider === "google_ads"
      ? a.gclid ?? a.gbraid ?? a.wbraid ?? null
      : a.fbclid ?? null;

  if (!clickId) {
    return {
      provider: input.provider,
      stage: input.stage,
      action,
      ready: false,
      blocked: input.provider === "google_ads" ? "Немає gclid/gbraid/wbraid" : "Немає fbclid",
      payload: null,
    };
  }

  const monetary = spec.monetary;
  const value = monetary ? Number(input.paidAmount ?? 0) : 0;
  if (monetary && !(value > 0)) {
    return { provider: input.provider, stage: input.stage, action, ready: false, blocked: "Немає фактичної оплати", payload: null };
  }

  const payload: Record<string, unknown> =
    input.provider === "google_ads"
      ? {
          conversion_action: action,
          gclid: a.gclid ?? null,
          gbraid: a.gbraid ?? null,
          wbraid: a.wbraid ?? null,
          conversion_date_time: input.occurredAt,
          conversion_value: monetary ? value : undefined,
          currency_code: monetary ? input.currency ?? "UAH" : undefined,
        }
      : {
          event_name: action,
          event_time: Math.floor(Date.parse(input.occurredAt) / 1000),
          action_source: "phone_call",
          user_data: { fbc: `fb.1.${Math.floor(Date.parse(input.occurredAt) / 1000)}.${a.fbclid}`, ph: input.hashedPhone ?? null, em: input.hashedEmail ?? null },
          custom_data: monetary ? { value, currency: input.currency ?? "UAH" } : undefined,
        };

  return { provider: input.provider, stage: input.stage, action, ready: true, blocked: null, payload };
}

/** Порядок етапів — для перевірки послідовності подій воронки. */
export const STAGE_ORDER: FunnelStage[] = ["lead", "qualified", "measurement", "estimate", "order", "payment"];

export function stageIndex(stage: FunnelStage): number {
  return STAGE_ORDER.indexOf(stage);
}

// ─────────────────────────────────────────────────────────────────────────────
// W2.1 — канонічні події конверсій (dry-run драфти; нічого не надсилається).
// ─────────────────────────────────────────────────────────────────────────────

export type ConversionKind =
  | "lead_created" | "lead_qualified" | "lead_lost"
  | "measurement_scheduled" | "measurement_completed"
  | "estimate_created" | "order_created" | "payment_received";

export type ConversionProvider = "google_ads" | "meta_ads";

export const KIND_ACTION: Record<ConversionKind, { google: string | null; meta: string }> = {
  lead_created: { google: "TERZI Lead", meta: "Lead" },
  lead_qualified: { google: "TERZI Qualified Lead", meta: "QualifiedLead" },
  lead_lost: { google: null, meta: "LeadLost" }, // Google: без негативних конверсій
  measurement_scheduled: { google: "TERZI Measurement Scheduled", meta: "Schedule" },
  measurement_completed: { google: "TERZI Measurement", meta: "MeasurementCompleted" },
  estimate_created: { google: "TERZI Estimate Sent", meta: "EstimateSent" },
  order_created: { google: "TERZI Order", meta: "OrderCreated" },
  payment_received: { google: "TERZI Payment", meta: "Purchase" },
};

/** Детермінований ключ ідемпотентності = event_id / transaction id. */
export function conversionIdempotencyKey(provider: ConversionProvider, kind: ConversionKind, sourceType: string, sourceId: string): string {
  return `conv:${provider}:${kind}:${sourceType}:${sourceId}`;
}

export type GoogleClickId = { type: "gclid" | "gbraid" | "wbraid"; value: string } | null;

export type ConversionEnvironment = "WEB" | "APP";

/** Рівно один ідентифікатор. WEB (типово): gclid > wbraid > gbraid; лише явний APP: gclid > gbraid > wbraid. */
export function pickGoogleClickId(a: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null }, env: ConversionEnvironment | null = null): GoogleClickId {
  const order = env === "APP" ? (["gclid", "gbraid", "wbraid"] as const) : (["gclid", "wbraid", "gbraid"] as const);
  for (const type of order) {
    const v = String(a[type] ?? "").trim();
    if (v) return { type, value: v };
  }
  return null;
}

export type ConsentState = "granted" | "denied" | "unknown";

export function normalizeConsent(v: unknown): ConsentState {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "granted" ? "granted" : s === "denied" ? "denied" : "unknown";
}

export type ConversionDraftInput = {
  provider: ConversionProvider;
  kind: ConversionKind;
  sourceType: string;
  sourceId: string;
  occurredAt: string;
  click: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null; fbclid?: string | null };
  /** Явний стан згоди. unknown ≠ denied: невідомо = не хешуємо і не декларуємо згоду провайдеру. */
  adUserDataConsent: ConsentState;
  /** Реальний час кліку/дотику, повʼязаного з fbclid. Без нього fbc не формується. */
  fbclidAt?: string | null;
  /** Реальний час дотику для кожного Google click ID (touchpoint.occurred_at або first_touch_at). */
  clickAt?: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null };
  /** Лише відоме середовище; null = невідомо (не вгадуємо). */
  environment?: ConversionEnvironment | null;
  phoneE164?: string | null;
  email?: string | null;
  metaLeadId?: string | null;
  /** Лише фактична оплата (payment_received). */
  paymentAmount?: number | null;
  currency?: string | null;
  /** Походження події: сайт чи CRM. */
  origin: "website" | "crm";
  /** Хеш-функція (SHA-256 hex) — передається із сервера. */
  sha256: (s: string) => string;
};

export type ConversionDraft = {
  provider: ConversionProvider;
  kind: ConversionKind;
  key: string;
  ready: boolean;
  blocked: string | null;
  payload: Record<string, unknown> | null;
};

export function buildConversionDraft(i: ConversionDraftInput): ConversionDraft {
  const key = conversionIdempotencyKey(i.provider, i.kind, i.sourceType, i.sourceId);
  const base = { provider: i.provider, kind: i.kind, key };
  const isPayment = i.kind === "payment_received";
  const amount = Number(i.paymentAmount ?? 0);
  if (isPayment && !(amount > 0)) return { ...base, ready: false, blocked: "Немає фактичної оплати", payload: null };
  const money = isPayment ? { value: amount, currency: (i.currency ?? "UAH").toUpperCase() } : null;

  if (i.provider === "google_ads") {
    const action = KIND_ACTION[i.kind].google;
    if (!action) return { ...base, ready: false, blocked: "Подія не передається в Google Ads", payload: null };
    if (isPayment && i.sourceType !== "finance_transactions") {
      return { ...base, ready: false, blocked: "Оплата має посилатися на finance_transactions", payload: null };
    }
    const env = i.environment ?? null;
    const click = pickGoogleClickId(i.click, env);
    if (!click) return { ...base, ready: false, blocked: "Немає gclid/gbraid/wbraid", payload: null };
    const clickAt = i.clickAt?.[click.type] ?? null;
    const clickMs = clickAt ? Date.parse(clickAt) : NaN;
    const convMs = Date.parse(i.occurredAt);
    if (!Number.isFinite(clickMs)) return { ...base, ready: false, blocked: `Немає реального часу кліку для ${click.type}`, payload: null };
    if (!(convMs > clickMs)) return { ...base, ready: false, blocked: "Час конверсії не пізніше часу кліку", payload: null };
    const ids: Record<string, string>[] = [];
    if (i.adUserDataConsent === "granted") {
      const digits = String(i.phoneE164 ?? "").replace(/\D/g, "");
      const em = String(i.email ?? "").trim().toLowerCase();
      if (digits) ids.push({ hashedPhoneNumber: i.sha256(`+${digits}`) });
      if (em) ids.push({ hashedEmail: i.sha256(em) });
    }
    return {
      ...base, ready: true, blocked: null,
      payload: {
        conversion_action: action,
        click_id_type: click.type,
        [click.type]: click.value,
        click_at: clickAt,
        conversion_date_time: i.occurredAt,
        transaction_id: key,
        ...(env ? { conversion_environment: env } : {}),
        ...(ids.length ? { user_identifiers: ids.slice(0, 2) } : {}),
        ...(money ? { conversion_value: money.value, currency_code: money.currency } : {}),
        ...(i.adUserDataConsent === "unknown" ? {} : { ad_user_data_consent: i.adUserDataConsent === "granted" ? "GRANTED" : "DENIED" }),
      },
    };
  }

  // Meta CAPI
  const ts = Math.floor(Date.parse(i.occurredAt) / 1000);
  const fbclid = String(i.click.fbclid ?? "").trim() || null;
  const leadId = String(i.metaLeadId ?? "").trim() || null;
  const userData: Record<string, unknown> = {};
  // fbc лише з реальним часом кліку/дотику; час конверсії не підставляється.
  const clickMs = i.fbclidAt ? Date.parse(i.fbclidAt) : NaN;
  if (fbclid && Number.isFinite(clickMs)) userData.fbc = `fb.1.${clickMs}.${fbclid}`;
  if (leadId) userData.lead_id = leadId;
  if (i.adUserDataConsent === "granted") {
    const ph = String(i.phoneE164 ?? "").replace(/\D/g, "");
    const em = String(i.email ?? "").trim().toLowerCase();
    if (ph) userData.ph = [i.sha256(ph)];
    if (em) userData.em = [i.sha256(em)];
  }
  if (!userData.fbc && !leadId && !userData.ph && !userData.em) {
    return { ...base, ready: false, blocked: fbclid ? "fbclid без реального часу кліку; немає lead_id або згоди" : "Немає fbclid/lead_id або згоди на ідентифікатори", payload: null };
  }
  return {
    ...base, ready: true, blocked: null,
    payload: {
      event_name: KIND_ACTION[i.kind].meta,
      event_time: ts,
      event_id: key,
      action_source: i.origin === "website" ? "website" : "system_generated",
      user_data: userData,
      ...(money ? { custom_data: money } : {}),
    },
  };
}
