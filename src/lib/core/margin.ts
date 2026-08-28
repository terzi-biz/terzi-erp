/**
 * Маржинальність Calculation Core (Launch Contract §9).
 *
 * margin% = (виручка без клієнтських податків − повна собівартість)
 *           / виручка без клієнтських податків × 100
 *
 * Виручка з нулем або від'ємна база → «Не розраховується» (null), а не −5900%.
 */

export interface ProfitResult {
  revenueNet: number;
  totalCost: number;
  grossProfit: number;
  /** null означає «Не розраховується». */
  marginPercent: number | null;
  markupPercent: number | null;
}

export const MARGIN_NOT_APPLICABLE = "Не розраховується";

export function computeProfit(revenueNet: number, totalCost: number): ProfitResult {
  const rev = +(+revenueNet || 0).toFixed(2);
  const cost = +(+totalCost || 0).toFixed(2);
  const profit = +(rev - cost).toFixed(2);
  return {
    revenueNet: rev,
    totalCost: cost,
    grossProfit: profit,
    marginPercent: rev > 0 ? +((profit / rev) * 100).toFixed(2) : null,
    markupPercent: cost > 0 ? +((profit / cost) * 100).toFixed(2) : null,
  };
}

export function formatMargin(m: number | null): string {
  return m === null ? MARGIN_NOT_APPLICABLE : `${m.toFixed(1)}%`;
}
