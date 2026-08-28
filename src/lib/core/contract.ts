/**
 * Константи Launch Contract v1.0 — docs/ERP_LAUNCH_CONTRACT.md.
 * Єдине джерело істини для тестів і рушіїв. Змінюється лише разом із документом.
 */

export const CONTRACT_VERSION = "terzi-contract@1.0";

/** Контрольний сценарій стяжки М200: 100 м² × 7 см. */
export const SCREED_CONTROL = {
  areaM2: 100,
  thicknessCm: 7,
  volumeM3: 7,
  cementM500Bags: 60,
  cementBagKg: 25,
  sandTonsTechnical: 13.4,
  plasticizerLiters: 10,
  fiberPacks: 8,
  dieselLitersBase: 17,
} as const;

/** Упаковок фібри Sika 600 г на контрольні 7 м³. */
export const FIBER_MATRIX_PER_7M3 = {
  M100: 4,
  M150: 6,
  M200: 8,
  M250: 10,
  M300: 12,
} as const;

/** Норми, повністю виведені з runtime (заборонені значення для М200). */
export const FORBIDDEN_M200_FIBER_PACKS = [9, 11] as const;

/** ПВХ: коефіцієнт нахльосту основного полотна і фасовка рулону. */
export const PVC_CONTRACT = {
  overlapCoef: 1.15,
  fieldRollWidthM: 2,
  fieldRollLengthM: 20,
  fieldRollM2: 40,
  /** Довжина одного профілю/планки, м. */
  profileElementM: 2,
  /** Підтверджена ціна неармованої деталювальної мембрани, грн/м². */
  d15BuyPrice: 655,
  d15Code: "pvc_d15_detail",
} as const;

/** Категорії, до яких за контрактом може застосовуватись ПДВ. */
export const VAT_DEFAULTS = {
  rate: 20,
  materials: true,
  works: false,
  logistics: false,
  equipment: false,
  services: false,
} as const;
