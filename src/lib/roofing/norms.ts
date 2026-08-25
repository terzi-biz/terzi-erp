/**
 * Нормативи TERZI для наплавної покрівлі.
 * Значення адмініструються в Налаштуваннях (вкладка «Покрівля / Руберойд»),
 * зберігаються версійованим JSONB, і потрапляють у знімок кошторису.
 */
import { z } from "zod";

const num = z.number().finite().nonnegative();
const pos = z.number().finite().positive();

export const roofingNormsSchema = z.object({
  /** Коефіцієнт швидкого режиму TERZI (запас на нахлисти + відходи). */
  quickCoef: pos,
  /** Стандартні нахлисти рулону, м. */
  sideOverlapM: num,
  endOverlapM: num,
  /** Заведення на вертикаль за замовчуванням, м. */
  defaultParapetHeightM: num,
  /** Праймер, л/м² по фактично ґрунтованій площі. */
  primerLPerM2: pos,
  primerBucketL: pos,
  /** Газ, кг/м² окремо за призначенням. */
  gasKgPerM2Bottom: num,
  gasKgPerM2Top: num,
  gasKgPerM2Vertical: num,
  gasKgPerM2Drying: num,
  gasKgPerM2Repair: num,
  gasKgPerNode: num,
  gasCylinderKg: pos,
  /** Мінімальна корисна довжина залишку, м (коротше — списання). */
  minUsableOffcutM: pos,
  /** Мінімальне зміщення швів верхнього шару відносно нижнього, м. */
  seamShiftM: num,
  /** Логістика. */
  rollsPerPallet: pos,
  palletCapacityKg: pos,
  /** Трудомісткість, люд.-год на одиницю. */
  laborHoursPerM2: num,
  laborHoursPerNodeM: num,
  laborHoursPerPoint: num,
  /** Округлення підсумкової ціни, грн. */
  roundStep: pos,
});

export type RoofingNorms = z.infer<typeof roofingNormsSchema>;

export const DEFAULT_ROOFING_NORMS: RoofingNorms = {
  quickCoef: 1.2,
  sideOverlapM: 0.1,
  endOverlapM: 0.15,
  defaultParapetHeightM: 0.3,
  primerLPerM2: 0.5,
  primerBucketL: 20,
  gasKgPerM2Bottom: 0.4,
  gasKgPerM2Top: 0.4,
  gasKgPerM2Vertical: 0.5,
  gasKgPerM2Drying: 0.15,
  gasKgPerM2Repair: 0.2,
  gasKgPerNode: 0.3,
  gasCylinderKg: 21,
  minUsableOffcutM: 1.5,
  seamShiftM: 0.5,
  rollsPerPallet: 20,
  palletCapacityKg: 1000,
  laborHoursPerM2: 0.12,
  laborHoursPerNodeM: 0.1,
  laborHoursPerPoint: 1.5,
  roundStep: 1,
};

export const roofingConfigPayloadSchema = z.object({
  norms: roofingNormsSchema,
});
export type RoofingConfigPayload = z.infer<typeof roofingConfigPayloadSchema>;

export const DEFAULT_ROOFING_CONFIG_PAYLOAD: RoofingConfigPayload = {
  norms: DEFAULT_ROOFING_NORMS,
};

/** Безпечне злиття збережених нормативів із дефолтами. */
export function mergeNorms(saved?: Partial<RoofingNorms> | null): RoofingNorms {
  return { ...DEFAULT_ROOFING_NORMS, ...(saved ?? {}) };
}
