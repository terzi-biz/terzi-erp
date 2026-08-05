/**
 * Клієнт-безпечні константи для цін продажу по діапазонах площі.
 * Нові колонки НЕ впливають на існуючу логіку розрахунків ERP —
 * вони лише зберігають окремі продажні ціни для діапазонів площі.
 */
export const TIER_KEYS = ["t50", "t100", "t250", "t500"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export const TIER_LABEL: Record<TierKey, string> = {
  t50: "Продаж: до 50 м²",
  t100: "Продаж: 50–100 м²",
  t250: "Продаж: 100–250 м²",
  t500: "Продаж: 250–500 м²",
};

/** Системні (дефолтні) значення загальної маржі колонки, % */
export const DEFAULT_TIER_MARGIN: Record<TierKey, number> = {
  t50: 80,
  t100: 60,
  t250: 45,
  t500: 35,
};

export const TIER_PRICE_COL: Record<TierKey, "sell_price_t50" | "sell_price_t100" | "sell_price_t250" | "sell_price_t500"> = {
  t50: "sell_price_t50",
  t100: "sell_price_t100",
  t250: "sell_price_t250",
  t500: "sell_price_t500",
};

export const TIER_MANUAL_COL: Record<TierKey, "manual_t50" | "manual_t100" | "manual_t250" | "manual_t500"> = {
  t50: "manual_t50",
  t100: "manual_t100",
  t250: "manual_t250",
  t500: "manual_t500",
};

/** Ціна продажу для діапазону = Закупка × (1 + Маржа колонки / 100) */
export function tierPriceFromMargin(buyPrice: number, marginPercent: number): number {
  const v = (Number(buyPrice) || 0) * (1 + (Number(marginPercent) || 0) / 100);
  return Math.round(v * 100) / 100;
}

/** Який ціновий діапазон застосовувати для площі замовлення (м²). */
export function tierForArea(area: number): TierKey {
  const a = Number(area) || 0;
  if (a <= 50) return "t50";
  if (a <= 100) return "t100";
  if (a <= 250) return "t250";
  return "t500";
}
