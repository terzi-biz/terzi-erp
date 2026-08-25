/**
 * Геометрія покрівлі: типи покрівель, поверхні (скати) та їх площі.
 * Усі формули детерміновані; жодних прихованих коефіцієнтів запасу тут немає —
 * запас додається окремо в `modes.ts` / `cutting.ts`.
 */

export type RoofKind =
  | "flat"        // плоска
  | "shed"        // односкатна
  | "gable"       // двоскатна
  | "asymmetric"  // несиметрична двоскатна
  | "hip"         // вальмова
  | "multi"       // багатоскатна
  | "custom";     // довільна (ручні площі)

export const ROOF_KIND_LABELS: Record<RoofKind, string> = {
  flat: "Плоска",
  shed: "Односкатна",
  gable: "Двоскатна",
  asymmetric: "Несиметрична двоскатна",
  hip: "Вальмова",
  multi: "Багатоскатна",
  custom: "Довільна (ручні площі)",
};

export type SurfaceShape = "rect" | "triangle" | "trapezoid" | "manual";

export interface RoofSurface {
  id: string;
  name: string;
  shape: SurfaceShape;
  /** Горизонтальна проекція: довжина ската, м (rect/trapezoid/triangle — вздовж коника). */
  lengthM: number;
  /** Горизонтальна проекція: ширина ската (від коника до карнизу), м. */
  widthM: number;
  /** Друга основа для трапеції, м. */
  width2M?: number;
  /** Перепад висот по ширині ската, м (0 = плоска поверхня). */
  riseM?: number;
  /** Ручна площа (shape = "manual"), м². */
  manualAreaM2?: number;
  /** Напрямок укладки рулонів відносно довжини ската. */
  layDirection?: "along" | "across";
}

/** Нахил ската у м на 1 м проекції → справжня довжина ската. */
export function slopeLength(projectionM: number, riseM: number): number {
  const p = Math.max(0, projectionM);
  const r = Math.max(0, riseM);
  return +Math.sqrt(p * p + r * r).toFixed(4);
}

/** Кут нахилу в градусах (для попереджень щодо технології наплавлення). */
export function slopeDegrees(projectionM: number, riseM: number): number {
  if (projectionM <= 0) return 0;
  return +((Math.atan(Math.max(0, riseM) / projectionM) * 180) / Math.PI).toFixed(2);
}

/** Реальна (по схилу) площа однієї поверхні, м². */
export function surfaceArea(s: RoofSurface): number {
  if (s.shape === "manual") return Math.max(0, +(s.manualAreaM2 ?? 0));
  const slopeW = slopeLength(s.widthM, s.riseM ?? 0);
  if (s.shape === "rect") return +(Math.max(0, s.lengthM) * slopeW).toFixed(3);
  if (s.shape === "triangle") return +((Math.max(0, s.lengthM) * slopeW) / 2).toFixed(3);
  // trapezoid: паралельні сторони lengthM та width2M, висота — довжина по схилу
  const b2 = Math.max(0, s.width2M ?? s.lengthM);
  return +(((Math.max(0, s.lengthM) + b2) / 2) * slopeW).toFixed(3);
}

/** Довжина укладки рулону для поверхні (по якій рахуються смуги розкрою). */
export function surfaceRunLength(s: RoofSurface): number {
  return s.layDirection === "across" ? slopeLength(s.widthM, s.riseM ?? 0) : Math.max(0, s.lengthM);
}

/** Ширина фронту укладки — перпендикулярно рулонам. */
export function surfaceRunWidth(s: RoofSurface): number {
  return s.layDirection === "across" ? Math.max(0, s.lengthM) : slopeLength(s.widthM, s.riseM ?? 0);
}

export interface GeometrySummary {
  kind: RoofKind;
  surfaces: RoofSurface[];
  /** Сума реальних площ по схилу, м². */
  totalAreaM2: number;
  /** Сума горизонтальних проекцій, м². */
  projectedAreaM2: number;
  maxSlopeDeg: number;
}

export function summarizeGeometry(kind: RoofKind, surfaces: RoofSurface[]): GeometrySummary {
  let total = 0;
  let projected = 0;
  let maxDeg = 0;
  for (const s of surfaces) {
    total += surfaceArea(s);
    projected += s.shape === "manual"
      ? Math.max(0, +(s.manualAreaM2 ?? 0))
      : surfaceArea({ ...s, riseM: 0 });
    maxDeg = Math.max(maxDeg, slopeDegrees(s.widthM, s.riseM ?? 0));
  }
  return {
    kind,
    surfaces,
    totalAreaM2: +total.toFixed(3),
    projectedAreaM2: +projected.toFixed(3),
    maxSlopeDeg: maxDeg,
  };
}

/** Скільки поверхонь очікує тип покрівлі (для валідації, 0 = будь-яка кількість). */
export const EXPECTED_SURFACES: Record<RoofKind, number> = {
  flat: 1,
  shed: 1,
  gable: 2,
  asymmetric: 2,
  hip: 4,
  multi: 0,
  custom: 0,
};

/** Створює типовий набір поверхонь під обраний тип покрівлі. */
export function defaultSurfaces(kind: RoofKind, lengthM = 10, widthM = 10): RoofSurface[] {
  const mk = (i: number, name: string, l: number, w: number, rise = 0): RoofSurface => ({
    id: `s${i}`, name, shape: "rect", lengthM: l, widthM: w, riseM: rise, layDirection: "along",
  });
  switch (kind) {
    case "flat": return [mk(1, "Покрівля", lengthM, widthM, 0)];
    case "shed": return [mk(1, "Скат", lengthM, widthM, 0.5)];
    case "gable": return [mk(1, "Скат 1", lengthM, widthM / 2, 1), mk(2, "Скат 2", lengthM, widthM / 2, 1)];
    case "asymmetric": return [mk(1, "Скат 1", lengthM, widthM * 0.6, 1.2), mk(2, "Скат 2", lengthM, widthM * 0.4, 0.8)];
    case "hip": return [
      mk(1, "Скат 1", lengthM, widthM / 2, 1),
      mk(2, "Скат 2", lengthM, widthM / 2, 1),
      { id: "s3", name: "Вальма 1", shape: "triangle", lengthM: widthM, widthM: widthM / 2, riseM: 1, layDirection: "along" },
      { id: "s4", name: "Вальма 2", shape: "triangle", lengthM: widthM, widthM: widthM / 2, riseM: 1, layDirection: "along" },
    ];
    case "multi": return [mk(1, "Скат 1", lengthM, widthM / 2, 1), mk(2, "Скат 2", lengthM, widthM / 2, 1), mk(3, "Скат 3", lengthM / 2, widthM / 2, 1)];
    case "custom": return [{ id: "s1", name: "Ділянка 1", shape: "manual", lengthM: 0, widthM: 0, manualAreaM2: 100 }];
  }
}
