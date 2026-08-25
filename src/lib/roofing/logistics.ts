/**
 * Логістика наплавної покрівлі: транспорт, підйом, вивіз сміття, трудомісткість.
 * Тарифи не хардкодяться в UI — беруться з довідника логістики модуля «roofing».
 */
import type { RoofingNorms } from "./norms";
import type { WeightSummary } from "./weight";

export interface LaborInput {
  norms: RoofingNorms;
  areaM2: number;
  nodeLengthM: number;
  points: number;
}

/** Трудомісткість, люд.-год. */
export function calcLaborHours(input: LaborInput): number {
  const n = input.norms;
  return +(
    Math.max(0, input.areaM2) * n.laborHoursPerM2 +
    Math.max(0, input.nodeLengthM) * n.laborHoursPerNodeM +
    Math.max(0, input.points) * n.laborHoursPerPoint
  ).toFixed(2);
}

export interface LiftInput {
  weight: WeightSummary;
  /** Поверх / висота підйому, м. */
  heightM: number;
  /** Чи є вантажний ліфт або кран. */
  withCrane: boolean;
}

export interface LogisticsSummary {
  totalKg: number;
  pallets: number;
  /** Скільки рейсів потрібно (за палетами). */
  trips: number;
  manualLift: boolean;
  notes: string[];
}

export function summarizeLogistics(input: LiftInput, palletsPerTrip = 4): LogisticsSummary {
  const notes: string[] = [];
  const trips = Math.max(input.weight.pallets > 0 ? 1 : 0, Math.ceil(input.weight.pallets / Math.max(1, palletsPerTrip)));
  const manualLift = !input.withCrane && input.heightM > 0;
  if (manualLift && input.weight.totalKg > 500) {
    notes.push(`Ручний підйом ${input.weight.totalKg} кг на висоту ${input.heightM} м — врахуйте окрему позицію підйому.`);
  }
  return { totalKg: input.weight.totalKg, pallets: input.weight.pallets, trips, manualLift, notes };
}
