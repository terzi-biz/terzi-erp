/**
 * Комерційні коригування Calculation Core (Launch Contract §8).
 *
 * Порядок фіксований і детермінований — його не можна змінювати в модулях:
 *   1) складність (% від нетто рядків)
 *   2) знижка (% від нетто + складність)
 *   3) комісія партнера (грн)
 *   4) надбавка за безготівку (ФОП 3, default +6%)
 *   5) добір до мінімального чека
 *
 * Податки нараховуються окремо (див. vat.ts) і НЕ входять у базу коригувань,
 * тому подвійне нарахування неможливе.
 */

export interface CommercialAdjustments {
  complexityPercent: number;
  discountPercent: number;
  partnerCommission: number;
  /** Мінімальний чек, грн. 0 — не застосовується. */
  minCheck: number;
}

export const NO_ADJUSTMENTS: CommercialAdjustments = {
  complexityPercent: 0,
  discountPercent: 0,
  partnerCommission: 0,
  minCheck: 0,
};

export interface AdjustmentBreakdown {
  base: number;
  complexity: number;
  discount: number;
  commission: number;
  cashless: number;
  minCheckTopUp: number;
  /** Сума всіх коригувань (може бути від'ємною). */
  total: number;
  /** Нетто-виручка після коригувань. */
  net: number;
}

const r2 = (v: number) => +(+v || 0).toFixed(2);

export function computeAdjustments(
  base: number,
  a: CommercialAdjustments,
  cashlessAdjustPercent = 0,
): AdjustmentBreakdown {
  const b = r2(base);
  const complexity = r2(b * (Math.max(0, a.complexityPercent) / 100));
  const afterComplexity = r2(b + complexity);
  const discount = r2(afterComplexity * (Math.max(0, a.discountPercent) / 100));
  const commission = r2(Math.max(0, a.partnerCommission));
  const afterCommission = r2(afterComplexity - discount + commission);
  const cashless = r2(afterCommission * (Math.max(0, cashlessAdjustPercent) / 100));
  const afterCashless = r2(afterCommission + cashless);
  const minCheckTopUp =
    a.minCheck > 0 && afterCashless < a.minCheck ? r2(a.minCheck - afterCashless) : 0;
  const net = r2(afterCashless + minCheckTopUp);
  return {
    base: b,
    complexity,
    discount,
    commission,
    cashless,
    minCheckTopUp,
    total: r2(net - b),
    net,
  };
}
