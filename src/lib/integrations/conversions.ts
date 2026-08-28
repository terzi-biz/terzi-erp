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
