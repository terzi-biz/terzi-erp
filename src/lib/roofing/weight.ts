/**
 * Маса матеріалів, палети, підйом і транспорт.
 */
import type { RoofingNorms } from "./norms";
import { rollArea, type RollSpec } from "./cutting";

export interface WeightItem {
  name: string;
  packs: number;
  kg: number;
}

export interface WeightSummary {
  items: WeightItem[];
  totalKg: number;
  pallets: number;
}

export interface RollLoad {
  roll: RollSpec;
  packs: number;
}

export function rollWeightKg(roll: RollSpec): number {
  return +(rollArea(roll) * Math.max(0, roll.weightKgPerM2 ?? 0)).toFixed(2);
}

export function summarizeWeight(
  rolls: RollLoad[],
  extras: WeightItem[],
  norms: RoofingNorms,
): WeightSummary {
  const items: WeightItem[] = rolls
    .filter((r) => r.packs > 0)
    .map((r) => ({
      name: r.roll.name,
      packs: r.packs,
      kg: +(rollWeightKg(r.roll) * r.packs).toFixed(2),
    }));
  items.push(...extras);
  const totalKg = +items.reduce((a, i) => a + i.kg, 0).toFixed(2);
  const rollPacks = rolls.reduce((a, r) => a + r.packs, 0);
  const palletsByCount = Math.ceil(rollPacks / Math.max(1, norms.rollsPerPallet));
  const palletsByWeight = Math.ceil(totalKg / Math.max(1, norms.palletCapacityKg));
  return { items, totalKg, pallets: Math.max(palletsByCount, palletsByWeight) };
}
