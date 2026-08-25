/**
 * Пошарова розкладка: нижній і верхній шар рахуються незалежно
 * (різні матеріали, різні формати рулонів, різні напрямки укладки).
 * Шви верхнього шару зміщуються відносно нижнього.
 */
import type { RoofSurface } from "./geometry";
import type { RoofingNorms } from "./norms";
import { planCut, type CutPlan, type RollSpec } from "./cutting";
import { quickAreaEstimate } from "./modes";
import type { RoofingCalcMode } from "./modes";
import { makeQty, type Qty } from "./qty";
import { rollArea } from "./cutting";

export type LayerRole = "bottom" | "top";

export interface LayerInput {
  role: LayerRole;
  /** Скільки разів цей шар укладається (нижній може бути 2 рази). */
  count: number;
  roll: RollSpec;
  /** Напрямок укладки — використовується для зміщення швів. */
  direction?: "along" | "across";
  /** Зміщення швів відносно попереднього шару, м. */
  seamShiftM?: number;
}

export interface LayerResult {
  role: LayerRole;
  count: number;
  roll: RollSpec;
  mode: RoofingCalcMode;
  netAreaM2: number;
  calcAreaM2: number;
  qty: Qty;
  plan?: CutPlan;
  warnings: string[];
}

export interface LayersInput {
  mode: RoofingCalcMode;
  norms: RoofingNorms;
  surfaces: RoofSurface[];
  surfaceNetAreas: Record<string, number>;
  /** Вертикальна площа вузлів, яку закриває кожен шар. */
  nodeAreaM2: number;
  layers: LayerInput[];
}

export function calculateLayers(input: LayersInput): LayerResult[] {
  const { norms, mode } = input;
  const results: LayerResult[] = [];
  const surfaceNet = Object.values(input.surfaceNetAreas).reduce((a, b) => a + b, 0);

  let previousDirection: string | undefined;
  let previousShift: number | undefined;

  for (const layer of input.layers) {
    const warnings: string[] = [];
    const count = Math.max(0, layer.count);
    if (count === 0) continue;

    const netArea = +((surfaceNet + input.nodeAreaM2) * count).toFixed(3);
    const area = rollArea(layer.roll);

    if (mode === "quick") {
      const q = quickAreaEstimate(netArea, norms);
      results.push({
        role: layer.role,
        count,
        roll: layer.roll,
        mode,
        netAreaM2: q.netAreaM2,
        calcAreaM2: q.calcAreaM2,
        qty: makeQty({ net: q.netAreaM2, calc: q.calcAreaM2, unit: "м²", pack: area, packUnit: "рул." }),
        warnings,
      });
    } else {
      const perPass = planCut({
        surfaces: input.surfaces,
        surfaceNetAreas: input.surfaceNetAreas,
        roll: layer.roll,
        norms,
        nodeAreaM2: input.nodeAreaM2,
      });
      const calcArea = +(perPass.materialAreaM2 * count).toFixed(3);
      warnings.push(...perPass.warnings);
      results.push({
        role: layer.role,
        count,
        roll: layer.roll,
        mode,
        netAreaM2: netArea,
        calcAreaM2: calcArea,
        qty: makeQty({ net: netArea, calc: calcArea, unit: "м²", pack: area, packUnit: "рул." }),
        plan: perPass,
        warnings,
      });
    }

    const dir = layer.direction ?? "along";
    const shift = layer.seamShiftM ?? norms.seamShiftM;
    if (previousDirection === dir && (previousShift ?? 0) === shift && shift < norms.seamShiftM) {
      warnings.push("Шви верхнього шару збігаються зі швами нижнього — задайте зміщення.");
    }
    previousDirection = dir;
    previousShift = shift;
  }

  // Перевірка збігу швів між шарами (однаковий напрямок і нульове зміщення).
  if (results.length > 1) {
    const dirs = input.layers.map((l) => l.direction ?? "along");
    const shifts = input.layers.map((l) => l.seamShiftM ?? norms.seamShiftM);
    for (let i = 1; i < dirs.length; i++) {
      if (dirs[i] === dirs[i - 1] && (shifts[i] ?? 0) <= 0) {
        results[i]?.warnings.push("Шви шарів збігаються: зміщення 0 м при однаковому напрямку укладки.");
      }
    }
  }

  return results;
}

/** Сумарна кількість рулонів по всіх шарах. */
export function totalRolls(layers: LayerResult[]): number {
  return layers.reduce((a, l) => a + l.qty.packs, 0);
}
