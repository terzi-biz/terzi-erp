/**
 * Два взаємовиключні режими розрахунку витрати рулонного матеріалу.
 *   quick   — швидка оцінка: площа × коефіцієнт TERZI (за замовчуванням 1,20)
 *   precise — точний розкрій (див. cutting.ts)
 * Подвійний запас заборонений: коефіцієнт ніколи не множиться на розкрій.
 */
import type { RoofingNorms } from "./norms";

export type RoofingCalcMode = "quick" | "precise";

export const MODE_LABELS: Record<RoofingCalcMode, string> = {
  quick: "Швидка оцінка (коефіцієнт TERZI)",
  precise: "Точний розкрій",
};

export interface QuickEstimate {
  netAreaM2: number;
  coef: number;
  calcAreaM2: number;
}

/** Швидкий режим: єдиний множник, більше жодного запасу. */
export function quickAreaEstimate(netAreaM2: number, norms: RoofingNorms): QuickEstimate {
  const net = Math.max(0, netAreaM2);
  const coef = Math.max(1, norms.quickCoef);
  return { netAreaM2: +net.toFixed(3), coef, calcAreaM2: +(net * coef).toFixed(3) };
}

/** Фактичний відсоток запасу для показу в UI. */
export function overheadPercent(netAreaM2: number, calcAreaM2: number): number {
  if (netAreaM2 <= 0) return 0;
  return +(((calcAreaM2 - netAreaM2) / netAreaM2) * 100).toFixed(2);
}
