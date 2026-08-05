/**
 * TERZI — тарифні коефіцієнти собівартості бригади залежно від площі замовлення.
 * Джерело: workspace knowledge → «≤50 → 1.25; 50–100 → 1.15; 100–200 → 1.05;
 * 200–500 → 1.00; >500 → 0.90». Використовується всіма 4 калькуляторами
 * (стяжка / покрівля / утеплення / демонтаж) для внутрішньої собівартості
 * бригадної роботи (worksCost), клієнтські ціни не змінює.
 */
export interface AreaTier {
  label: string;
  min: number;
  max: number; // виключно
  coef: number;
}

export const AREA_TIERS: AreaTier[] = [
  { label: "≤50 м²",      min: 0,    max: 50,       coef: 1.25 },
  { label: "50–100 м²",   min: 50,   max: 100,      coef: 1.15 },
  { label: "100–200 м²",  min: 100,  max: 200,      coef: 1.05 },
  { label: "200–500 м²",  min: 200,  max: 500,      coef: 1.00 },
  { label: ">500 м²",     min: 500,  max: Infinity, coef: 0.90 },
];

export function areaLaborTier(area: number): AreaTier {
  const a = Math.max(0, area);
  return AREA_TIERS.find((t) => a >= t.min && a < t.max) ?? AREA_TIERS[AREA_TIERS.length - 1];
}

export function areaLaborCoef(area: number): number {
  return areaLaborTier(area).coef;
}
