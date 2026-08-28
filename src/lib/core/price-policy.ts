/**
 * Політика цін Calculation Core (Launch Contract §10).
 *
 * Нуль може бути законним. Розрізняємо чотири стани ціни й блокуємо лише те,
 * що дійсно неможливо продати. Випадкових fallback немає: якщо ціни немає —
 * ми не підставляємо чужу, а піднімаємо blocking error.
 */

export type PriceStatus =
  /** Коду немає ні в довіднику, ні в дефолтах. */
  | "missing"
  /** Код є, але ціна не підтверджена відповідальним. */
  | "unconfirmed"
  /** Підтверджена ненульова ціна. */
  | "confirmed"
  /** Підтверджений нуль (allow_zero_purchase_price / included_in_base). */
  | "confirmed_zero";

/** Як позиція потрапляє в клієнтський кошторис. */
export type BillingMode = "separate_line" | "included_in_base" | "internal_only";

export interface PricePolicyLine {
  key: string;
  block: string;
  name: string;
  qty: number;
  sellPerUnit: number;
  priceStatus: PriceStatus;
  billingMode: BillingMode;
  /** Позиція вимагає коду довідника (системний прайс). */
  requiresCatalogCode?: boolean;
  catalogCode?: string | null;
  /** Дозвіл на підтверджений нуль: причина, автор, дата (Launch Contract §10). */
  zeroApproval?: ZeroApproval | null;
}

/** Явний дозвіл нульової собівартості/ціни. */
export interface ZeroApproval {
  reason: string;
  approvedBy: string;
  approvedAt: string;
}

/** Дозвіл валідний лише якщо є причина, автор і дата. */
export function isZeroApprovalValid(a: ZeroApproval | null | undefined): boolean {
  return !!a && !!a.reason?.trim() && !!a.approvedBy?.trim() && !!a.approvedAt?.trim();
}

export interface PriceBlockingError {
  key: string;
  name: string;
  block: string;
  reason:
    | "missing_price"
    | "unconfirmed_price"
    | "zero_not_allowed"
    | "unapproved_zero"
    | "missing_catalog_code";
  message: string;
}

const REASON_TEXT: Record<PriceBlockingError["reason"], string> = {
  missing_price: "ціни немає ні в довіднику, ні в дефолтах",
  unconfirmed_price: "ціна не підтверджена відповідальним",
  zero_not_allowed: "нульова ціна не дозволена для окремої продаваної позиції",
  unapproved_zero: "нуль не підтверджено: потрібні причина, автор і дата дозволу",
  missing_catalog_code: "відсутній обов'язковий код довідника",
};

/** Повертає перелік блокуючих помилок за контрактом §10. */
export function findBlockingPriceErrors(
  lines: readonly PricePolicyLine[],
): PriceBlockingError[] {
  const out: PriceBlockingError[] = [];
  const push = (l: PricePolicyLine, reason: PriceBlockingError["reason"]) =>
    out.push({
      key: l.key,
      name: l.name,
      block: l.block,
      reason,
      message: `${l.name} [${l.key}] — ${REASON_TEXT[reason]}`,
    });

  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    if (l.billingMode === "internal_only") continue;

    if (l.requiresCatalogCode && !l.catalogCode) {
      push(l, "missing_catalog_code");
      continue;
    }
    if (l.priceStatus === "missing") {
      push(l, "missing_price");
      continue;
    }
    if (l.priceStatus === "unconfirmed") {
      push(l, "unconfirmed_price");
      continue;
    }
    if (
      l.priceStatus === "confirmed_zero" &&
      l.billingMode === "separate_line" &&
      !(l.sellPerUnit > 0) &&
      l.zeroApproval !== undefined &&
      !isZeroApprovalValid(l.zeroApproval)
    ) {
      push(l, "unapproved_zero");
      continue;
    }
    if (
      l.billingMode === "separate_line" &&
      l.priceStatus !== "confirmed_zero" &&
      !(l.sellPerUnit > 0)
    ) {
      push(l, "zero_not_allowed");
    }
  }
  return out;
}

/** Текст блокування збереження/експорту або null. */
export function blockingReasonText(errors: readonly PriceBlockingError[]): string | null {
  if (!errors.length) return null;
  const head = errors.slice(0, 3).map((e) => e.message).join("; ");
  const tail = errors.length > 3 ? ` та ще ${errors.length - 3}` : "";
  return `Розрахунок заблоковано: ${head}${tail}.`;
}
