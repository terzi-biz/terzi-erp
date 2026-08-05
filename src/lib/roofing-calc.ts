/**
 * TERZI Roofing calculator engine.
 *
 * Системи гідроізоляції:
 *  1) Рубемаст (наплавний бітумний рулон) — 1, 2 або 3 шари.
 *     + галтелі (цементно-піщана), праймер, точки опайки.
 *  2) ПВХ-мембрана Sika 1.5 / 1.8 мм з механічним кріпленням.
 *     + геотекстиль, телескопічні кріплення.
 *
 *  Спільні аксесуари: воронки покрівельні, аератори, капельники,
 *  внутрішні/зовнішні кути для парапетів, обробка парапетів.
 *
 *  Коефіцієнти у RoofingSettings (Налаштування → Покрівля).
 *  Ціни матеріалів/робіт/логістики — у каталозі модуля
 *  (useModulePricing("roofing")).
 */
import type { MaterialPrice } from "./screed-calc";
import {
  ROOFING_KB_PRICE_OVERRIDES,
  ROOFING_KB_WORK_OVERRIDES,
  ROOFING_KB_COEFF_OVERRIDES,
} from "./roofing-knowledge.generated";

export type RoofSystem = "rubemast" | "pvc";
export type PvcThickness = "1.5" | "1.8";
export type PaymentForm = "cash" | "cashless" | "fop";
export type RubemastBrand = "aquaizol" | "ruberit";

export interface RoofingInput {
  area: number;
  perimeter: number;
  parapetHeightCm: number;
  parapetTopFoldM: number;      // додаткове заведення нагору парапету (горизонтальна поличка), м
  system: RoofSystem;
  layers: 1 | 2 | 3;
  pvcThickness: PvcThickness;
  rubemastBrand: RubemastBrand; // Акваізол / Руберіт

  withPrimer: boolean;
  withSlope: boolean;
  slopeAvgThicknessMm: number;
  withDemount: boolean;
  withGeotextile: boolean;
  withParapetWork: boolean;
  withGaltel: boolean;          // rubemast: цементно-піщана галтель по периметру
  galtelMetersOverride: number; // якщо >0 — використати замість периметру

  // Accessories
  funnelsCount: number;
  aeratorsCount: number;
  dripEdgeMeters: number;
  innerCornersCount: number;
  outerCornersCount: number;
  opaikaPoints: number;
  pvcAngleMeters: number;       // ПВХ-уголок (внутрішній примикання), п.м
  pvcClampStripMeters: number;  // Прижимна планка, п.м

  // Logistics
  cityDelivery: boolean;
  outOfCityKm: number;
  withLift: boolean;
  haulContainers: number;

  // Commercial
  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
}

export interface RoofingCoefficients {
  // Rubemast
  rubemastOverlapCoef: number;
  rubemastRollAreaM2: number;
  rubemastPrimerLPerM2: number;
  rubemastGasKgPerLayerM2: number;
  rubemastGasCylinderKg: number;
  galtelMixKgPerM: number;        // витрата суміші на 1 п.м галтелі
  // PVC
  pvcOverlapCoef: number;
  pvcGeoCoef: number;
  pvcFastenersPerM2: number;
  pvcParapetExtraCoef: number;
  // Common
  parapetHeightCmDefault: number;
  // Internal cost helpers
  brigadeMin: number;
  brigadePerM2Rubemast: number;
  brigadePerM2Pvc: number;
  amortEquipPerM2: number;
  amortTransportPerM2: number;
  minCheck: number;
  marginThreshold: number;
  roundStep: number;
  fopRate: number;
  vatRate: number;
}

const RAW_ROOFING_COEFFS: RoofingCoefficients = {
  rubemastOverlapCoef: 1.15,
  rubemastRollAreaM2: 10,
  rubemastPrimerLPerM2: 0.35,
  rubemastGasKgPerLayerM2: 0.35,
  rubemastGasCylinderKg: 22,
  galtelMixKgPerM: 6,
  pvcOverlapCoef: 1.10,
  pvcGeoCoef: 1.10,
  pvcFastenersPerM2: 4,
  pvcParapetExtraCoef: 1.10,
  parapetHeightCmDefault: 30,
  brigadeMin: 12000,
  brigadePerM2Rubemast: 70,
  brigadePerM2Pvc: 95,
  amortEquipPerM2: 20,
  amortTransportPerM2: 15,
  minCheck: 25000,
  marginThreshold: 25,
  roundStep: 1,
  fopRate: 0.06,
  vatRate: 0.22,
};

/**
 * Публічні DEFAULT'и — базові значення, поверх яких накладаються оверрайди з
 * бази знань (`.lovable/knowledge/roofing-calculator.md`), згенеровані скриптом
 * `bun run sync:roofing` у `roofing-knowledge.generated.ts`. Так ми маємо єдине
 * джерело правди: змінюємо MD → запускаємо sync → калькулятор бачить нові
 * ціни/коефіцієнти без ручної правки коду.
 */
export const DEFAULT_ROOFING_COEFFS: RoofingCoefficients = {
  ...RAW_ROOFING_COEFFS,
  ...ROOFING_KB_COEFF_OVERRIDES,
};

// Закупка — Прайс євроруберойд Одеса 30.03.2026 (Акваізол ЕКО-ПЕ ~150–165 грн/м², рулон 10 м²).
const RAW_ROOFING_PRICES: Record<string, MaterialPrice> = {
  rubemast:     { buy: 1500, sell: 2200 },  // 10 м² рулон (≈150/220 грн/м²) — Руберіт
  aquaizol_roll:{ buy: 1650, sell: 2400 },  // 10 м² рулон Акваізол ЕКО-ПЕ
  ruberit_roll: { buy: 1500, sell: 2200 },  // 10 м² рулон Руберіт (alias)
  aquaizol_eko_30: { buy: 1649, sell: 2144 },
  ruberit_eko_35: { buy: 1121, sell: 1457 },
  primer:       { buy: 65,   sell: 110 },
  gas:          { buy: 1200, sell: 1600 },
  pvc_15_sika:  { buy: 320,  sell: 480 },
  pvc_18_sika:  { buy: 390,  sell: 580 },
  geo_300:      { buy: 28,   sell: 55 },
  fastener:     { buy: 8,    sell: 18 },
  xps_50:       { buy: 220,  sell: 320 },
  galtel_mix:   { buy: 8,    sell: 15 },
  funnel:       { buy: 850,  sell: 1400 },
  aerator:      { buy: 650,  sell: 1100 },
  drip_edge:    { buy: 110,  sell: 190 },
  inner_corner: { buy: 95,   sell: 180 },
  outer_corner: { buy: 95,   sell: 180 },
  opaika_mastic:{ buy: 180,  sell: 320 },
  pvc_angle:    { buy: 55,   sell: 110 },   // ПВХ-уголок (внутрішній кут стрічкою), п.м
  pvc_clamp:    { buy: 75,   sell: 140 },   // Прижимна планка алюмінієва, п.м
};
export const DEFAULT_ROOFING_PRICES: Record<string, MaterialPrice> = {
  ...RAW_ROOFING_PRICES,
  ...ROOFING_KB_PRICE_OVERRIDES,
};

// Продаж клієнту (грн).
const RAW_ROOFING_WORKS = {
  rubemast_lay: 160,   // за шар, м² (Монтаж Рубероида)
  primer_apply: 20,
  pvc_lay: 160,        // Монтаж ПВХ мембрани, м²
  geo_lay: 20,
  slope: 220,
  demount: 150,
  parapet: 100,        // п.м (Монтаж ПВХ/Рубероїда на парапет)
  galtel: 110,
  funnel: 750,
  aerator: 550,
  drip_edge: 100,
  corner: 180,
  opaika: 150,
  pvc_angle_lay: 80,   // Монтаж ПВХ-уголка, п.м
  pvc_clamp_lay: 90,   // Монтаж прижимної планки з герметиком, п.м
};
export const DEFAULT_ROOFING_WORKS = {
  ...RAW_ROOFING_WORKS,
  ...ROOFING_KB_WORK_OVERRIDES,
} as typeof RAW_ROOFING_WORKS;

// Собівартість бригади — ПМЗ Майстерів (що ми платимо).
export const DEFAULT_ROOFING_WORK_COSTS: Record<string, number> = {
  rubemast_lay: 80,
  primer_apply: 20,
  pvc_lay: 160,
  geo_lay: 20,
  parapet: 100,
  galtel: 110,
  funnel: 750,
  aerator: 550,
  drip_edge: 100,
  corner: 180,
  opaika: 150,
  demount: 150,
  slope: 220,
  prep: 20,
  pvc_angle_lay: 80,
  pvc_clamp_lay: 90,
};

export const DEFAULT_ROOFING_LOGISTICS = {
  delivery_city: { buy: 800, sell: 1200 },
  delivery_km:   { buy: 30,  sell: 50 },
  lift:          { buy: 1500, sell: 2500 },
  haul:          { buy: 3500, sell: 5000 },
};

export interface RoofLine {
  key: string;
  block: "materials" | "works" | "logistics";
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
  sum: number;
  cost: number;
}

export interface RoofingResult {
  effectiveAreaM2: number;
  rolls?: number;
  fasteners?: number;
  primerL?: number;
  gasCylinders?: number;
  galtelMeters?: number;
  lines: RoofLine[];
  warnings: string[];

  materialsSell: number;
  worksSell: number;
  logisticsSell: number;
  subtotalSell: number;
  discountAmount: number;
  complexityAmount: number;
  partnerCommission: number;
  fopAdjustment: number;
  vatAdjustment: number;
  minCheckAdjustment: number;
  totalClient: number;
  pricePerM2: number;

  materialsCost: number;
  worksCost: number;
  logisticsCost: number;
  amortEquip: number;
  amortTransport: number;
  totalCost: number;

  grossProfit: number;
  marginPercent: number;
}

const ceil = Math.ceil;
const round = (v: number, step = 1) => Math.round(v / step) * step;

export function calculateRoofing(
  input: RoofingInput,
  prices: Record<string, MaterialPrice> = DEFAULT_ROOFING_PRICES,
  works = DEFAULT_ROOFING_WORKS,
  workCosts: Record<string, number> = DEFAULT_ROOFING_WORK_COSTS,
  logistics = DEFAULT_ROOFING_LOGISTICS,
  c: RoofingCoefficients = DEFAULT_ROOFING_COEFFS,
): RoofingResult {
  // Helper: read price with fallback to DEFAULT_ROOFING_PRICES
  const px = (k: string): MaterialPrice => prices[k] ?? DEFAULT_ROOFING_PRICES[k] ?? { buy: 0, sell: 0 };
  // Helper: brigade cost per unit for a given work key.
  const wcost = (k: string): number => workCosts[k] ?? DEFAULT_ROOFING_WORK_COSTS[k] ?? 0;

  const warnings: string[] = [];
  const area = Math.max(0, input.area);
  const perimeter = Math.max(0, input.perimeter || Math.sqrt(area) * 4);
  const parapetH = Math.max(0, input.parapetHeightCm) / 100;
  const topFold = Math.max(0, input.parapetTopFoldM);

  const parapetAreaM2 = perimeter * (parapetH + topFold);
  const effectiveAreaM2 = +(area + parapetAreaM2).toFixed(2);

  const lines: RoofLine[] = [];
  let rollsCount: number | undefined;
  let gasCylinders: number | undefined;
  let primerL: number | undefined;
  let fastenersCount: number | undefined;
  let galtelMeters: number | undefined;

  if (input.system === "rubemast") {
    const layers = input.layers;
    const perLayerM2 = effectiveAreaM2 * c.rubemastOverlapCoef;
    const totalM2 = perLayerM2 * layers;
    rollsCount = ceil(totalM2 / c.rubemastRollAreaM2);
    const brandKey = input.rubemastBrand === "aquaizol" ? "aquaizol_eko_30" : "ruberit_eko_35";
    const brandLabel = input.rubemastBrand === "aquaizol" ? "Акваізол ЕКО-ПЕ" : "Руберіт";
    lines.push({
      key: "m_rubemast", block: "materials",
      name: `${brandLabel} (${layers} ${layers === 1 ? "шар" : "шари"})`,
      unit: "рул.", qty: rollsCount,
      pricePerUnit: px(brandKey).sell, costPerUnit: px(brandKey).buy,
      sum: rollsCount * px(brandKey).sell, cost: rollsCount * px(brandKey).buy,
    });

    const gasKg = totalM2 * c.rubemastGasKgPerLayerM2;
    gasCylinders = ceil(gasKg / c.rubemastGasCylinderKg);
    lines.push({
      key: "m_gas", block: "materials", name: "Газ пропан", unit: "бал.",
      qty: gasCylinders, pricePerUnit: px("gas").sell, costPerUnit: px("gas").buy,
      sum: gasCylinders * px("gas").sell, cost: gasCylinders * px("gas").buy,
    });

    if (input.withPrimer) {
      primerL = ceil(effectiveAreaM2 * c.rubemastPrimerLPerM2);
      lines.push({
        key: "m_primer", block: "materials", name: "Бітумний праймер", unit: "л",
        qty: primerL, pricePerUnit: px("primer").sell, costPerUnit: px("primer").buy,
        sum: primerL * px("primer").sell, cost: primerL * px("primer").buy,
      });
      lines.push({
        key: "w_primer", block: "works", name: "Праймування основи", unit: "м²",
        qty: area, pricePerUnit: works.primer_apply, costPerUnit: wcost("primer_apply"),
        sum: area * works.primer_apply, cost: area  * wcost("primer_apply"),
      });
    }

    if (input.withGaltel && perimeter > 0) {
      const galM = input.galtelMetersOverride > 0 ? input.galtelMetersOverride : perimeter;
      galtelMeters = galM;
      const mixKg = ceil(galM * c.galtelMixKgPerM);
      lines.push({
        key: "m_galtel_mix", block: "materials", name: "Цементно-піщана суміш (галтель)", unit: "кг",
        qty: mixKg, pricePerUnit: px("galtel_mix").sell, costPerUnit: px("galtel_mix").buy,
        sum: mixKg * px("galtel_mix").sell, cost: mixKg * px("galtel_mix").buy,
      });
      lines.push({
        key: "w_galtel", block: "works", name: "Влаштування галтелі по периметру", unit: "п.м",
        qty: galM, pricePerUnit: works.galtel, costPerUnit: wcost("galtel"),
        sum: galM * works.galtel, cost: galM * wcost("galtel"),
      });
    }

    if (input.opaikaPoints > 0) {
      const masticKg = ceil(input.opaikaPoints * 0.5); // ~0.5 кг на точку
      lines.push({
        key: "m_opaika", block: "materials", name: "Мастика бітумна (опайка)", unit: "кг",
        qty: masticKg, pricePerUnit: px("opaika_mastic").sell, costPerUnit: px("opaika_mastic").buy,
        sum: masticKg * px("opaika_mastic").sell, cost: masticKg * px("opaika_mastic").buy,
      });
      lines.push({
        key: "w_opaika", block: "works", name: "Точки опайки/локальний ремонт", unit: "шт",
        qty: input.opaikaPoints, pricePerUnit: works.opaika, costPerUnit: wcost("opaika"),
        sum: input.opaikaPoints * works.opaika, cost: input.opaikaPoints  * wcost("opaika"),
      });
    }

    lines.push({
      key: "w_rubemast", block: "works",
      name: `Наплавлення рубемасту (${layers} ${layers === 1 ? "шар" : "шари"})`,
      unit: "м²", qty: area * layers,
      pricePerUnit: works.rubemast_lay, costPerUnit: wcost("rubemast_lay"),
      sum: area * layers * works.rubemast_lay, cost: area * layers  * wcost("rubemast_lay"),
    });
  } else {
    // PVC Sika
    const pvcKey = input.pvcThickness === "1.8" ? "pvc_18_sika" : "pvc_15_sika";
    const pvcLabel = `ПВХ-мембрана Sika ${input.pvcThickness} мм`;
    const pvcM2 = ceil(effectiveAreaM2 * c.pvcOverlapCoef);
    lines.push({
      key: "m_pvc", block: "materials", name: pvcLabel, unit: "м²",
      qty: pvcM2, pricePerUnit: px(pvcKey).sell, costPerUnit: px(pvcKey).buy,
      sum: pvcM2 * px(pvcKey).sell, cost: pvcM2 * px(pvcKey).buy,
    });

    if (input.withGeotextile) {
      const geoM2 = ceil(effectiveAreaM2 * c.pvcGeoCoef);
      lines.push({
        key: "m_geo", block: "materials", name: "Геотекстиль 300 г/м²", unit: "м²",
        qty: geoM2, pricePerUnit: px("geo_300").sell, costPerUnit: px("geo_300").buy,
        sum: geoM2 * px("geo_300").sell, cost: geoM2 * px("geo_300").buy,
      });
      lines.push({
        key: "w_geo", block: "works", name: "Укладка геотекстилю", unit: "м²",
        qty: area, pricePerUnit: works.geo_lay, costPerUnit: wcost("geo_lay"),
        sum: area * works.geo_lay, cost: area  * wcost("geo_lay"),
      });
    }

    fastenersCount = ceil(area * c.pvcFastenersPerM2);
    lines.push({
      key: "m_fast", block: "materials", name: "Кріплення телескопічне", unit: "шт",
      qty: fastenersCount, pricePerUnit: px("fastener").sell, costPerUnit: px("fastener").buy,
      sum: fastenersCount * px("fastener").sell, cost: fastenersCount * px("fastener").buy,
    });

    if (input.innerCornersCount > 0) {
      lines.push({
        key: "m_inner_corner", block: "materials", name: "Внутрішній кут ПВХ", unit: "шт",
        qty: input.innerCornersCount,
        pricePerUnit: px("inner_corner").sell, costPerUnit: px("inner_corner").buy,
        sum: input.innerCornersCount * px("inner_corner").sell,
        cost: input.innerCornersCount * px("inner_corner").buy,
      });
      lines.push({
        key: "w_inner_corner", block: "works", name: "Монтаж внутрішніх кутів", unit: "шт",
        qty: input.innerCornersCount, pricePerUnit: works.corner, costPerUnit: wcost("corner"),
        sum: input.innerCornersCount * works.corner, cost: input.innerCornersCount * wcost("corner"),
      });
    }
    if (input.outerCornersCount > 0) {
      lines.push({
        key: "m_outer_corner", block: "materials", name: "Зовнішній кут ПВХ", unit: "шт",
        qty: input.outerCornersCount,
        pricePerUnit: px("outer_corner").sell, costPerUnit: px("outer_corner").buy,
        sum: input.outerCornersCount * px("outer_corner").sell,
        cost: input.outerCornersCount * px("outer_corner").buy,
      });
      lines.push({
        key: "w_outer_corner", block: "works", name: "Монтаж зовнішніх кутів", unit: "шт",
        qty: input.outerCornersCount, pricePerUnit: works.corner, costPerUnit: wcost("corner"),
        sum: input.outerCornersCount * works.corner, cost: input.outerCornersCount * wcost("corner"),
      });
    }

    lines.push({
      key: "w_pvc", block: "works", name: "Монтаж ПВХ-мембрани", unit: "м²",
      qty: area, pricePerUnit: works.pvc_lay, costPerUnit: wcost("pvc_lay"),
      sum: area * works.pvc_lay, cost: area  * wcost("pvc_lay"),
    });
  }

  // ===== Спільні аксесуари =====
  if (input.funnelsCount > 0) {
    lines.push({
      key: "m_funnel", block: "materials", name: "Воронка покрівельна", unit: "шт",
      qty: input.funnelsCount,
      pricePerUnit: px("funnel").sell, costPerUnit: px("funnel").buy,
      sum: input.funnelsCount * px("funnel").sell,
      cost: input.funnelsCount * px("funnel").buy,
    });
    lines.push({
      key: "w_funnel", block: "works", name: "Монтаж воронок", unit: "шт",
      qty: input.funnelsCount, pricePerUnit: works.funnel, costPerUnit: wcost("funnel"),
      sum: input.funnelsCount * works.funnel, cost: input.funnelsCount  * wcost("funnel"),
    });
  }
  if (input.aeratorsCount > 0) {
    lines.push({
      key: "m_aerator", block: "materials", name: "Аератор покрівельний", unit: "шт",
      qty: input.aeratorsCount,
      pricePerUnit: px("aerator").sell, costPerUnit: px("aerator").buy,
      sum: input.aeratorsCount * px("aerator").sell,
      cost: input.aeratorsCount * px("aerator").buy,
    });
    lines.push({
      key: "w_aerator", block: "works", name: "Монтаж аераторів", unit: "шт",
      qty: input.aeratorsCount, pricePerUnit: works.aerator, costPerUnit: wcost("aerator"),
      sum: input.aeratorsCount * works.aerator, cost: input.aeratorsCount  * wcost("aerator"),
    });
  }
  if (input.dripEdgeMeters > 0) {
    lines.push({
      key: "m_drip", block: "materials", name: "Капельник металевий", unit: "п.м",
      qty: input.dripEdgeMeters,
      pricePerUnit: px("drip_edge").sell, costPerUnit: px("drip_edge").buy,
      sum: input.dripEdgeMeters * px("drip_edge").sell,
      cost: input.dripEdgeMeters * px("drip_edge").buy,
    });
    lines.push({
      key: "w_drip", block: "works", name: "Монтаж капельника", unit: "п.м",
      qty: input.dripEdgeMeters, pricePerUnit: works.drip_edge, costPerUnit: wcost("drip_edge"),
      sum: input.dripEdgeMeters * works.drip_edge, cost: input.dripEdgeMeters  * wcost("drip_edge"),
    });
  }
  if (input.pvcAngleMeters > 0) {
    const m = input.pvcAngleMeters;
    lines.push({
      key: "m_pvc_angle", block: "materials", name: "ПВХ-уголок (внутрішній примикання)", unit: "п.м",
      qty: m, pricePerUnit: px("pvc_angle").sell, costPerUnit: px("pvc_angle").buy,
      sum: m * px("pvc_angle").sell, cost: m * px("pvc_angle").buy,
    });
    lines.push({
      key: "w_pvc_angle", block: "works", name: "Монтаж ПВХ-уголка", unit: "п.м",
      qty: m, pricePerUnit: works.pvc_angle_lay, costPerUnit: wcost("pvc_angle_lay"),
      sum: m * works.pvc_angle_lay, cost: m * wcost("pvc_angle_lay"),
    });
  }
  if (input.pvcClampStripMeters > 0) {
    const m = input.pvcClampStripMeters;
    lines.push({
      key: "m_pvc_clamp", block: "materials", name: "Прижимна планка алюмінієва + герметик", unit: "п.м",
      qty: m, pricePerUnit: px("pvc_clamp").sell, costPerUnit: px("pvc_clamp").buy,
      sum: m * px("pvc_clamp").sell, cost: m * px("pvc_clamp").buy,
    });
    lines.push({
      key: "w_pvc_clamp", block: "works", name: "Монтаж прижимної планки", unit: "п.м",
      qty: m, pricePerUnit: works.pvc_clamp_lay, costPerUnit: wcost("pvc_clamp_lay"),
      sum: m * works.pvc_clamp_lay, cost: m * wcost("pvc_clamp_lay"),
    });
  }


  if (input.withDemount) {
    lines.push({
      key: "w_demount", block: "works", name: "Демонтаж старого покриття", unit: "м²",
      qty: area, pricePerUnit: works.demount, costPerUnit: wcost("demount"),
      sum: area * works.demount, cost: area  * wcost("demount"),
    });
  }
  if (input.withSlope) {
    const xpsM2 = ceil(area * 1.05);
    lines.push({
      key: "m_xps", block: "materials", name: "XPS 50 мм (розуклонка)", unit: "м²",
      qty: xpsM2, pricePerUnit: px("xps_50").sell, costPerUnit: px("xps_50").buy,
      sum: xpsM2 * px("xps_50").sell, cost: xpsM2 * px("xps_50").buy,
    });
    lines.push({
      key: "w_slope", block: "works", name: "Розуклонка XPS", unit: "м²",
      qty: area, pricePerUnit: works.slope, costPerUnit: wcost("slope"),
      sum: area * works.slope, cost: area  * wcost("slope"),
    });
  }
  if (input.withParapetWork && perimeter > 0) {
    lines.push({
      key: "w_parapet", block: "works", name: "Обробка парапету/примикань", unit: "п.м",
      qty: perimeter, pricePerUnit: works.parapet, costPerUnit: wcost("parapet"),
      sum: perimeter * works.parapet, cost: perimeter  * wcost("parapet"),
    });
  }

  // Logistics
  const deliverySell = input.cityDelivery
    ? logistics.delivery_city.sell
    : Math.max(logistics.delivery_city.sell, input.outOfCityKm * 2 * logistics.delivery_km.sell);
  const deliveryCost = input.cityDelivery
    ? logistics.delivery_city.buy
    : Math.max(logistics.delivery_city.buy, input.outOfCityKm * 2 * logistics.delivery_km.buy);
  lines.push({
    key: "log_delivery", block: "logistics", name: "Доставка матеріалів", unit: "шт", qty: 1,
    pricePerUnit: deliverySell, costPerUnit: deliveryCost, sum: deliverySell, cost: deliveryCost,
  });
  if (input.withLift) {
    lines.push({
      key: "log_lift", block: "logistics", name: "Підйом на дах", unit: "шт", qty: 1,
      pricePerUnit: logistics.lift.sell, costPerUnit: logistics.lift.buy,
      sum: logistics.lift.sell, cost: logistics.lift.buy,
    });
  }
  if (input.haulContainers > 0) {
    lines.push({
      key: "log_haul", block: "logistics", name: "Вивіз сміття (контейнер 8 м³)", unit: "шт",
      qty: input.haulContainers,
      pricePerUnit: logistics.haul.sell, costPerUnit: logistics.haul.buy,
      sum: input.haulContainers * logistics.haul.sell, cost: input.haulContainers * logistics.haul.buy,
    });
  }

  // Бригадна оплата тепер закладена у costPerUnit кожної роботи (ПМЗ Майстерів).
  // Залишаємо мін. оплату як floor для дуже малих замовлень.
  void c.brigadePerM2Rubemast; void c.brigadePerM2Pvc;

  const materialsSell = lines.filter((l) => l.block === "materials").reduce((a, l) => a + l.sum, 0);
  const worksSell = lines.filter((l) => l.block === "works").reduce((a, l) => a + l.sum, 0);
  const logisticsSell = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.sum, 0);
  let subtotal = materialsSell + worksSell + logisticsSell;

  const complexityAmount = subtotal * (input.complexityPercent / 100);
  subtotal += complexityAmount;

  const discountAmount = subtotal * (input.discountPercent / 100);
  subtotal -= discountAmount;

  subtotal += input.partnerCommission;

  let fopAdjustment = 0;
  if (input.payment === "fop") { fopAdjustment = subtotal * c.fopRate; subtotal += fopAdjustment; }

  let vatAdjustment = 0;
  if (input.withVAT) { vatAdjustment = materialsSell * c.vatRate; subtotal += vatAdjustment; }

  let minCheckAdjustment = 0;
  if (subtotal < c.minCheck) { minCheckAdjustment = c.minCheck - subtotal; subtotal = c.minCheck; warnings.push("warnMinCheck"); }

  const totalClient = round(subtotal, c.roundStep);

  const materialsCost = lines.filter((l) => l.block === "materials").reduce((a, l) => a + l.cost, 0);
  const worksAddCost = lines.filter((l) => l.block === "works").reduce((a, l) => a + l.cost, 0);
  // Оплата бригаді: до 100 м² включно — фіксовано 11 000 грн за замовлення,
  // понад 100 м² — 110 грн/м² на всю площу. Це нижня межа (floor) для суми
  // ПМЗ майстрів по роботах. Додатково бригадир — 10 грн/м².
  const brigadeFloor = area <= 100 ? 11000 : area * 110;
  const foremanCost = area * 10;
  const worksCost = Math.max(brigadeFloor, worksAddCost) + foremanCost;
  
  const logisticsCost = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.cost, 0);
  const amortEquip = area * c.amortEquipPerM2;
  const amortTransport = area * c.amortTransportPerM2;
  const totalCost = materialsCost + worksCost + logisticsCost + amortEquip + amortTransport + input.partnerCommission;

  const grossProfit = totalClient - totalCost;
  const marginPercent = totalClient > 0 ? (grossProfit / totalClient) * 100 : 0;
  if (marginPercent < c.marginThreshold) warnings.push("warnLowMargin");

  return {
    effectiveAreaM2,
    rolls: rollsCount, fasteners: fastenersCount, primerL, gasCylinders, galtelMeters,
    lines, warnings,
    materialsSell, worksSell, logisticsSell, subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
}
