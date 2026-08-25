/**
 * Точний розкрій рулонного наплавного матеріалу.
 *
 * Корисна ширина смуги = ширина рулона − боковий нахлист.
 * Кількість смуг N = 1 + ceil((ширина фронту − ширина рулона) / корисна ширина).
 * По довжині смуги враховуються торцеві нахлисти між шматками з одного рулону.
 */
import type { RoofSurface } from "./geometry";
import { surfaceRunLength, surfaceRunWidth } from "./geometry";
import type { RoofingNorms } from "./norms";

export interface RollSpec {
  code: string;
  name: string;
  widthM: number;
  lengthM: number;
  /** Площа рулона; якщо не задано — width × length. */
  areaM2?: number;
  weightKgPerM2?: number;
}

export function rollArea(r: RollSpec): number {
  return +(r.areaM2 && r.areaM2 > 0 ? r.areaM2 : r.widthM * r.lengthM).toFixed(3);
}

export type OffcutStatus = "usable" | "used" | "scrap";

export interface Offcut {
  fromRoll: number;
  lengthM: number;
  widthM: number;
  status: OffcutStatus;
  usedFor?: string;
}

export interface SurfaceCutPlan {
  surfaceId: string;
  surfaceName: string;
  /** Ширина фронту укладки, м. */
  frontWidthM: number;
  /** Довжина смуги, м (без торцевих нахлистів). */
  stripLengthM: number;
  strips: number;
  /** Довжина смуги з торцевими нахлистами, якщо шматки стикуються. */
  stripLengthWithEndOverlapM: number;
  /** Загальна довжина матеріалу, м. */
  totalRunM: number;
  /** Матеріал, м² (з урахуванням бокових і торцевих нахлистів). */
  materialAreaM2: number;
  /** Чиста площа поверхні, м². */
  netAreaM2: number;
  /** Кількість поперечних стиків. */
  endJoints: number;
  warnings: string[];
}

export interface CutPlan {
  surfaces: SurfaceCutPlan[];
  netAreaM2: number;
  materialAreaM2: number;
  rolls: number;
  offcuts: Offcut[];
  wastePercent: number;
  seams: number;
  warnings: string[];
}

const ceil = Math.ceil;

/** Розкрій однієї поверхні одним типом рулону. */
export function planSurface(
  surface: RoofSurface,
  roll: RollSpec,
  norms: RoofingNorms,
  netAreaM2: number,
): SurfaceCutPlan {
  const warnings: string[] = [];
  const front = surfaceRunWidth(surface);
  const stripLength = surfaceRunLength(surface);
  const side = Math.max(0, norms.sideOverlapM);
  const end = Math.max(0, norms.endOverlapM);

  const usable = roll.widthM - side;
  if (usable <= 0) {
    warnings.push(`Боковий нахлист ${side} м ≥ ширини рулону ${roll.widthM} м — розкрій неможливий.`);
    return {
      surfaceId: surface.id, surfaceName: surface.name, frontWidthM: front,
      stripLengthM: stripLength, strips: 0, stripLengthWithEndOverlapM: 0, totalRunM: 0,
      materialAreaM2: 0, netAreaM2, endJoints: 0, warnings,
    };
  }

  let strips = 0;
  if (front > 0 && stripLength > 0) {
    strips = front <= roll.widthM ? 1 : 1 + ceil((front - roll.widthM) / usable);
  }

  // Шматки з одного рулону: скільки цілих смуг влазить у довжину рулону.
  const piecesPerRoll = Math.max(0, Math.floor(roll.lengthM / Math.max(0.001, stripLength)));
  // Якщо смуга довша за рулон — її треба стикувати з торцевим нахлистом.
  const piecesPerStrip = stripLength > roll.lengthM ? ceil(stripLength / Math.max(0.001, roll.lengthM - end)) : 1;
  const endJoints = strips * Math.max(0, piecesPerStrip - 1);
  const stripLengthWithEnd = +(stripLength + Math.max(0, piecesPerStrip - 1) * end).toFixed(3);

  const totalRun = +(strips * stripLengthWithEnd).toFixed(3);
  const materialArea = +(totalRun * roll.widthM).toFixed(3);

  if (piecesPerRoll === 0 && stripLength > 0 && stripLength <= roll.lengthM) {
    warnings.push(`Довжина смуги ${stripLength} м не вміщується у рулон ${roll.lengthM} м.`);
  }

  return {
    surfaceId: surface.id,
    surfaceName: surface.name,
    frontWidthM: +front.toFixed(3),
    stripLengthM: +stripLength.toFixed(3),
    strips,
    stripLengthWithEndOverlapM: stripLengthWithEnd,
    totalRunM: totalRun,
    materialAreaM2: materialArea,
    netAreaM2: +netAreaM2.toFixed(3),
    endJoints,
    warnings,
  };
}

export interface PlanCutInput {
  surfaces: RoofSurface[];
  surfaceNetAreas: Record<string, number>;
  roll: RollSpec;
  norms: RoofingNorms;
  /** Додаткова вертикальна площа вузлів, яку можна закрити залишками. */
  nodeAreaM2?: number;
}

/** Повний розкрій по всіх поверхнях + утилізація залишків на вузлах. */
export function planCut(input: PlanCutInput): CutPlan {
  const { roll, norms } = input;
  const plans: SurfaceCutPlan[] = [];
  const warnings: string[] = [];
  let netArea = 0;
  let materialArea = 0;
  let seams = 0;

  for (const s of input.surfaces) {
    const net = input.surfaceNetAreas[s.id] ?? 0;
    const p = planSurface(s, roll, norms, net);
    plans.push(p);
    netArea += p.netAreaM2;
    materialArea += p.materialAreaM2;
    seams += Math.max(0, p.strips - 1) + p.endJoints;
    warnings.push(...p.warnings);
  }

  const area = rollArea(roll);
  const nodeArea = Math.max(0, input.nodeAreaM2 ?? 0);
  const requiredArea = +(materialArea + nodeArea).toFixed(3);
  const rolls = area > 0 ? ceil(requiredArea / area) : 0;
  const purchasedArea = +(rolls * area).toFixed(3);

  // Залишки: різниця між купленим і використаним, розкладена на шматки по довжині рулону.
  const offcuts: Offcut[] = [];
  const leftoverArea = Math.max(0, +(purchasedArea - requiredArea).toFixed(3));
  if (leftoverArea > 0 && roll.widthM > 0) {
    const leftoverLength = +(leftoverArea / roll.widthM).toFixed(3);
    offcuts.push({
      fromRoll: rolls,
      lengthM: leftoverLength,
      widthM: roll.widthM,
      status: leftoverLength >= norms.minUsableOffcutM ? "usable" : "scrap",
    });
  }
  if (nodeArea > 0) {
    offcuts.push({
      fromRoll: rolls,
      lengthM: roll.widthM > 0 ? +(nodeArea / roll.widthM).toFixed(3) : 0,
      widthM: roll.widthM,
      status: "used",
      usedFor: "Вузли: парапети / коники / єндови",
    });
  }

  const wastePercent = netArea > 0 ? +(((purchasedArea - netArea) / netArea) * 100).toFixed(2) : 0;

  return {
    surfaces: plans,
    netAreaM2: +netArea.toFixed(3),
    materialAreaM2: requiredArea,
    rolls,
    offcuts,
    wastePercent,
    seams,
    warnings,
  };
}

export interface LayoutVariant {
  id: string;
  label: string;
  rolls: number;
  wastePercent: number;
  seams: number;
  usableOffcutsM: number;
  laborHours: number;
  /** Технологічний рейтинг 0–100: менше швів і відходу — вище. */
  score: number;
}

/** Порівняння варіантів розкладки (напрямок укладки / формат рулону). */
export function compareLayouts(
  variants: { id: string; label: string; plan: CutPlan; laborHours: number }[],
): LayoutVariant[] {
  const rows = variants.map((v) => ({
    id: v.id,
    label: v.label,
    rolls: v.plan.rolls,
    wastePercent: v.plan.wastePercent,
    seams: v.plan.seams,
    usableOffcutsM: +v.plan.offcuts.filter((o) => o.status === "usable").reduce((a, o) => a + o.lengthM, 0).toFixed(2),
    laborHours: +v.laborHours.toFixed(2),
    score: 0,
  }));
  const maxWaste = Math.max(1, ...rows.map((r) => r.wastePercent));
  const maxSeams = Math.max(1, ...rows.map((r) => r.seams));
  for (const r of rows) {
    r.score = +(100 - (r.wastePercent / maxWaste) * 60 - (r.seams / maxSeams) * 40).toFixed(1);
  }
  return rows.sort((a, b) => b.score - a.score);
}
