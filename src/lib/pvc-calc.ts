/**
 * TERZI — калькулятор ПВХ-мембрани (окремий напрямок «ПВХ мембрана»).
 *
 * Геометрія (за методикою TERZI):
 *   Горизонтальна площа  = площа даху, м²
 *   Вертикальна висота   = висота парапету + ширина парапету + ширина нахльосту
 *   Вертикальна площа    = периметр × вертикальна висота
 *   Площа мембрани       = (горизонтальна + вертикальна) × коеф. нахльосту (1.15)
 *
 * Ціни матеріалів/робіт беруться з каталогу модуля `roofing_pvc`
 * (useModulePricing("roofing_pvc", area)). Тут — лише детерміновані формули.
 */
import type { MaterialPrice } from "./screed-calc";
import type { RoofLine, RoofingResult, PaymentForm } from "./roofing-calc";

export type PvcThickness = "1.5" | "1.8";
export type PvcDiameter = "75" | "110" | "160";

export interface PvcInput {
  area: number;            // горизонтальна площа, м²
  perimeter: number;       // погонаж парапету, п.м
  parapetHeightM: number;  // висота парапету, м
  parapetWidthM: number;   // ширина (товщина) парапету зверху, м
  parapetOverlapM: number; // нахльост мембрани за парапет, м

  thickness: PvcThickness;

  withGeotextile: boolean;
  withDemount: boolean;
  withSlope: boolean;
  withPrep: boolean;

  // Воронки за діаметром, шт
  funnels75: number;
  funnels110: number;
  funnels160: number;
  // Аератори за діаметром, шт
  aerators75: number;
  aerators110: number;
  aerators160: number;

  opaikaPoints: number;        // точки обпайки (виходи труб тощо)

  /**
   * Неармована мембрана Sikaplan D-15 — ТІЛЬКИ вузли, проходки, примикання.
   * 0 = порахувати автоматично від периметру та кількості точок.
   */
  detailMembraneM2: number;

  // Профілі: 0 = рахувати автоматично від периметру
  pvcAngleMeters: number;      // ПВХ-уголок
  pvcClampMeters: number;      // прижимна планка
  dripEdgeMeters: number;      // капельник

  // Логістика
  cityDelivery: boolean;
  outOfCityKm: number;
  withLift: boolean;
  haulContainers: number;

  // Комерція
  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
}

export interface PvcCoefficients {
  overlapCoef: number;        // нахльост мембрани, 1.15
  /** Довжина одного ПВХ-профілю/планки при закупівлі, м. */
  profileBarLengthM: number;
  /** Площа рулона армованої мембрани (2.0 × 20 м), м². */
  fieldRollM2: number;
  /** Площа рулона неармованої D-15 (1 × 20 м), м². */
  detailRollM2: number;
  /** Автонорма D-15: м² на 1 п.м примикання. */
  detailPerMeterM2: number;
  /** Автонорма D-15: м² на одну точку (воронка / аератор / обпайка). */
  detailPerPointM2: number;
  geoCoef: number;            // запас геотекстилю
  fastenersPerM2: number;     // телескопічні кріплення на м² поля
  angleReserve: number;       // запас ПВХ-уголка від периметру
  clampReserve: number;       // запас прижимної планки від периметру
  dowelsPerMeterStrip: number;// дюбель+шуруп на 1 п.м планки
  rondelPerMeterVert: number; // рондоль (тарілка) на 1 п.м вертикалі
  sealantPointsPerTube: number;
  packSize: number;           // фасовка кріплення, шт в упаковці
  brigadeMinUpTo100: number;
  brigadePerM2Over100: number;
  foremanPerM2: number;
  amortEquipPerM2: number;
  amortTransportPerM2: number;
  minCheck: number;
  marginThreshold: number;
  fopRate: number;
  vatRate: number;
}

export const DEFAULT_PVC_COEFFS: PvcCoefficients = {
  overlapCoef: 1.15,
  profileBarLengthM: 2,
  fieldRollM2: 40,
  detailRollM2: 20,
  detailPerMeterM2: 0.25,
  detailPerPointM2: 0.5,
  geoCoef: 1.10,
  fastenersPerM2: 4,
  angleReserve: 1.05,
  clampReserve: 1.05,
  dowelsPerMeterStrip: 4,
  rondelPerMeterVert: 3,
  sealantPointsPerTube: 6,
  packSize: 100,
  brigadeMinUpTo100: 11000,
  brigadePerM2Over100: 110,
  foremanPerM2: 10,
  amortEquipPerM2: 20,
  amortTransportPerM2: 15,
  minCheck: 25000,
  marginThreshold: 25,
  fopRate: 0.06,
  vatRate: 0.22,
};

export const DEFAULT_PVC_PRICES: Record<string, MaterialPrice> = {
  // Армоване польове полотно. 1,5 мм підтверджено прайсом (Sikaplan 15 G, 2.0×20 м).
  pvc_15_sika: { buy: 360, sell: 468 },
  // 1,8 мм — ціна НЕ підтверджена в каталозі. Заборонено підставляти ціну D-15 (655 грн/м²).
  pvc_18_sika: { buy: 0, sell: 0 },
  // Неармована деталювальна мембрана Sikaplan D-15, 1×20 м — лише вузли/проходки.
  pvc_d15_detail: { buy: 655, sell: 851.5 },
  geo_300: { buy: 54, sell: 70 },
  fastener: { buy: 8, sell: 18 },
  funnel_scupper_75: { buy: 2000, sell: 2600 },
  funnel_scupper_110: { buy: 1927.1, sell: 2505 },
  funnel_gully_160: { buy: 2790, sell: 3627 },
  pvc_aerator_75: { buy: 710, sell: 923 },
  pvc_aerator_110: { buy: 890, sell: 1157 },
  pvc_aerator_160: { buy: 1290, sell: 1677 },
  pvc_angle: { buy: 85, sell: 110 },
  pvc_clamp: { buy: 50, sell: 65 },
  drip_edge: { buy: 110, sell: 143 },
  sika_sealant: { buy: 440, sell: 572 },
  dowel_8x50: { buy: 230, sell: 299 },
  screw_5x70: { buy: 96.3, sell: 125 },
  washer_50: { buy: 270, sell: 351 },
  pvc_metal: { buy: 2800, sell: 3640 },
  xps_50: { buy: 220, sell: 286 },
};


export const DEFAULT_PVC_WORKS: Record<string, number> = {
  prep: 40,
  geo_lay: 40,
  pvc_lay: 320,
  pvc_lay_lin: 200,
  funnel: 1500,
  aerator: 1100,
  opaika: 150,
  drip_edge: 200,
  pvc_angle_lay: 80,
  pvc_clamp_lay: 90,
  slope: 220,
  demount: 150,
};

export const DEFAULT_PVC_WORK_COSTS: Record<string, number> = {
  prep: 20,
  geo_lay: 20,
  pvc_lay: 160,
  pvc_lay_lin: 100,
  funnel: 750,
  aerator: 550,
  opaika: 60,
  drip_edge: 100,
  pvc_angle_lay: 40,
  pvc_clamp_lay: 45,
  slope: 80,
  demount: 60,
};

export const DEFAULT_PVC_LOGISTICS = {
  delivery_city: { buy: 800, sell: 1200 },
  delivery_km: { buy: 30, sell: 50 },
  lift: { buy: 1500, sell: 2500 },
  haul: { buy: 3500, sell: 5000 },
};

export interface PvcResult extends RoofingResult {
  horizontalAreaM2: number;
  verticalAreaM2: number;
  verticalHeightM: number;
  membraneM2: number;
}

const ceil = Math.ceil;

export function calculatePvc(
  input: PvcInput,
  prices: Record<string, MaterialPrice> = DEFAULT_PVC_PRICES,
  works: Record<string, number> = DEFAULT_PVC_WORKS,
  workCosts: Record<string, number> = DEFAULT_PVC_WORK_COSTS,
  logistics = DEFAULT_PVC_LOGISTICS,
  c: PvcCoefficients = DEFAULT_PVC_COEFFS,
): PvcResult {
  const px = (k: string): MaterialPrice => prices[k] ?? DEFAULT_PVC_PRICES[k] ?? { buy: 0, sell: 0 };
  const wp = (k: string): number => works[k] ?? DEFAULT_PVC_WORKS[k] ?? 0;
  const wc = (k: string): number => workCosts[k] ?? DEFAULT_PVC_WORK_COSTS[k] ?? 0;

  const warnings: string[] = [];
  const lines: RoofLine[] = [];
  const push = (l: Omit<RoofLine, "sum" | "cost">) =>
    lines.push({ ...l, sum: +(l.qty * l.pricePerUnit).toFixed(2), cost: +(l.qty * l.costPerUnit).toFixed(2) });

  /** ПВХ-планки/профілі — 2-метрові елементи: розрахунок у м.п., закупівля у штуках. */
  const barPurchase = (meters: number) => {
    const bar = c.profileBarLengthM > 0 ? c.profileBarLengthM : 2;
    const pcs = ceil(meters / bar);
    return {
      purchaseQty: pcs,
      purchaseUnit: `шт × ${bar} м`,
      note: `Розрахунок ${meters} м.п.; закупівля ${pcs} шт по ${bar} м.`,
    };
  };

  const area = Math.max(0, input.area);
  const perimeter = Math.max(0, input.perimeter);
  const verticalHeightM = +(
    Math.max(0, input.parapetHeightM) + Math.max(0, input.parapetWidthM) + Math.max(0, input.parapetOverlapM)
  ).toFixed(3);
  const verticalAreaM2 = +(perimeter * verticalHeightM).toFixed(2);
  const totalGeomM2 = +(area + verticalAreaM2).toFixed(2);
  const membraneM2 = ceil(totalGeomM2 * c.overlapCoef);

  // ---- Матеріали ----
  // Польове полотно — ЗАВЖДИ армована мембрана. Неармована D-15 сюди не підставляється.
  const pvcKey = input.thickness === "1.8" ? "pvc_18_sika" : "pvc_15_sika";
  const fieldPrice = px(pvcKey);
  if (!(fieldPrice.buy > 0) || !(fieldPrice.sell > 0)) {
    warnings.push(
      `Ціна армованої ПВХ-мембрани ${input.thickness} мм не підтверджена в каталозі (код ${pvcKey}). ` +
      "Внесіть підтверджену ціну в довідник. Підставляти ціну неармованої Sikaplan D-15 (655 грн/м²) заборонено.",
    );
  }
  const fieldRolls = c.fieldRollM2 > 0 ? ceil(membraneM2 / c.fieldRollM2) : 0;
  const fieldPurchaseM2 = +(fieldRolls * c.fieldRollM2).toFixed(2);
  push({
    key: "m_pvc", block: "materials",
    name: `ПВХ-мембрана армована Sikaplan ${input.thickness} мм, польове полотно (з нахльостом ×${c.overlapCoef})`,
    unit: "м²", qty: membraneM2, pricePerUnit: fieldPrice.sell, costPerUnit: fieldPrice.buy,
    purchaseQty: fieldRolls > 0 ? fieldRolls : undefined,
    purchaseUnit: `рул. × ${c.fieldRollM2} м²`,
    note: `Чиста площа ${totalGeomM2} м²; розрахункова з нахльостом ${membraneM2} м²; ` +
      `закупівля ${fieldRolls} рул. = ${fieldPurchaseM2} м²; залишок ${+(fieldPurchaseM2 - membraneM2).toFixed(2)} м².`,
  });


  // Неармована D-15 — окремий код, окрема одиниця, лише вузли/проходки/примикання.
  const detailPointsQty = Math.max(0, input.opaikaPoints) +
    Math.max(0, input.funnels75) + Math.max(0, input.funnels110) + Math.max(0, input.funnels160) +
    Math.max(0, input.aerators75) + Math.max(0, input.aerators110) + Math.max(0, input.aerators160);
  const detailM2 = input.detailMembraneM2 > 0
    ? +input.detailMembraneM2.toFixed(2)
    : +(perimeter * c.detailPerMeterM2 + detailPointsQty * c.detailPerPointM2).toFixed(2);
  if (detailM2 > 0) {
    push({
      key: "m_pvc_d15", block: "materials",
      name: "ПВХ-мембрана неармована Sikaplan D-15 (вузли, проходки, примикання)",
      unit: "м²", qty: detailM2,
      pricePerUnit: px("pvc_d15_detail").sell, costPerUnit: px("pvc_d15_detail").buy,
      purchaseQty: c.detailRollM2 > 0 ? ceil(detailM2 / c.detailRollM2) : undefined,
      purchaseUnit: `рул. × ${c.detailRollM2} м²`,
      note: "Деталювальна неармована мембрана. Не є заміною армованого польового полотна.",
    });
  }

  if (input.withGeotextile) {
    const geoM2 = ceil(totalGeomM2 * c.geoCoef);
    push({ key: "m_geo", block: "materials", name: "Геотекстиль-розділювач", unit: "м²", qty: geoM2,
      pricePerUnit: px("geo_300").sell, costPerUnit: px("geo_300").buy });
    push({ key: "w_geo", block: "works", name: "Монтаж геотекстилю", unit: "м²", qty: area,
      pricePerUnit: wp("geo_lay"), costPerUnit: wc("geo_lay") });
  }

  const fasteners = ceil(area * c.fastenersPerM2);
  push({ key: "m_fast", block: "materials", name: "Кріплення телескопічне (дюбель + тарілка)", unit: "шт",
    qty: fasteners, pricePerUnit: px("fastener").sell, costPerUnit: px("fastener").buy });

  // Профілі — автоматично від периметру, якщо користувач не задав вручну
  const angleM = input.pvcAngleMeters > 0 ? input.pvcAngleMeters : +(perimeter * c.angleReserve).toFixed(1);
  const clampM = input.pvcClampMeters > 0 ? input.pvcClampMeters : +(perimeter * c.clampReserve).toFixed(1);
  const dripM = input.dripEdgeMeters > 0 ? input.dripEdgeMeters : perimeter;

  if (angleM > 0) {
    push({ key: "m_angle", block: "materials", name: "ПВХ-уголок (внутрішнє примикання)", unit: "п.м", qty: angleM,
      pricePerUnit: px("pvc_angle").sell, costPerUnit: px("pvc_angle").buy,
      ...barPurchase(angleM) });
    push({ key: "w_angle", block: "works", name: "Монтаж ПВХ-уголка", unit: "п.м", qty: angleM,
      pricePerUnit: wp("pvc_angle_lay"), costPerUnit: wc("pvc_angle_lay") });
  }
  if (clampM > 0) {
    push({ key: "m_clamp", block: "materials", name: "ПВХ-планка прижимна", unit: "п.м", qty: clampM,
      pricePerUnit: px("pvc_clamp").sell, costPerUnit: px("pvc_clamp").buy,
      ...barPurchase(clampM) });
    push({ key: "w_clamp", block: "works", name: "Монтаж прижимної планки з герметиком", unit: "п.м", qty: clampM,
      pricePerUnit: wp("pvc_clamp_lay"), costPerUnit: wc("pvc_clamp_lay") });
  }
  if (dripM > 0) {
    push({ key: "m_drip", block: "materials", name: "Капельник", unit: "п.м", qty: dripM,
      pricePerUnit: px("drip_edge").sell, costPerUnit: px("drip_edge").buy,
      ...barPurchase(dripM) });
    push({ key: "w_drip", block: "works", name: "Монтаж капельника", unit: "п.м", qty: dripM,
      pricePerUnit: wp("drip_edge"), costPerUnit: wc("drip_edge") });
  }

  // Воронки за діаметрами
  const funnelDefs: Array<[PvcDiameter, number, string]> = [
    ["75", input.funnels75, "funnel_scupper_75"],
    ["110", input.funnels110, "funnel_scupper_110"],
    ["160", input.funnels160, "funnel_gully_160"],
  ];
  let funnelsTotal = 0;
  for (const [d, qty, code] of funnelDefs) {
    if (qty <= 0) continue;
    funnelsTotal += qty;
    push({ key: `m_funnel_${d}`, block: "materials", name: `Воронка покрівельна ПВХ d ${d} мм`, unit: "шт", qty,
      pricePerUnit: px(code).sell, costPerUnit: px(code).buy });
  }
  if (funnelsTotal > 0) {
    push({ key: "w_funnel", block: "works", name: "Монтаж і обпайка воронок", unit: "шт", qty: funnelsTotal,
      pricePerUnit: wp("funnel"), costPerUnit: wc("funnel") });
  }

  // Аератори за діаметрами
  const aeratorDefs: Array<[PvcDiameter, number, string]> = [
    ["75", input.aerators75, "pvc_aerator_75"],
    ["110", input.aerators110, "pvc_aerator_110"],
    ["160", input.aerators160, "pvc_aerator_160"],
  ];
  let aeratorsTotal = 0;
  for (const [d, qty, code] of aeratorDefs) {
    if (qty <= 0) continue;
    aeratorsTotal += qty;
    push({ key: `m_aerator_${d}`, block: "materials", name: `Аератор/флюгарка ПВХ d ${d} мм`, unit: "шт", qty,
      pricePerUnit: px(code).sell, costPerUnit: px(code).buy });
  }
  if (aeratorsTotal > 0) {
    push({ key: "w_aerator", block: "works", name: "Монтаж і обпайка аераторів", unit: "шт", qty: aeratorsTotal,
      pricePerUnit: wp("aerator"), costPerUnit: wc("aerator") });
  }

  // Точки обпайки (виходи труб, стійки тощо)
  if (input.opaikaPoints > 0) {
    push({ key: "w_opaika", block: "works", name: "Обпайка точок примикання (труби, виходи)", unit: "шт",
      qty: input.opaikaPoints, pricePerUnit: wp("opaika"), costPerUnit: wc("opaika") });
  }

  // ---- Розхідники: рондоль, дюбель, шуруп, герметик ----
  const rondelPcs = ceil(perimeter * c.rondelPerMeterVert);
  const dowelPcs = ceil(clampM * c.dowelsPerMeterStrip);
  const sealantPcs = ceil((input.opaikaPoints + funnelsTotal + aeratorsTotal) / c.sealantPointsPerTube) +
    (clampM > 0 ? ceil(clampM / 8) : 0);

  if (rondelPcs > 0) {
    const packs = ceil(rondelPcs / c.packSize);
    push({ key: "m_rondel", block: "materials", name: `Рондоль (тарілка дожимна), уп. ${c.packSize} шт — ${rondelPcs} шт`,
      unit: "уп.", qty: packs, pricePerUnit: px("washer_50").sell, costPerUnit: px("washer_50").buy });
  }
  if (dowelPcs > 0) {
    const packs = ceil(dowelPcs / c.packSize);
    push({ key: "m_dowel", block: "materials", name: `Дюбель розпірний 8×50, уп. ${c.packSize} шт — ${dowelPcs} шт`,
      unit: "уп.", qty: packs, pricePerUnit: px("dowel_8x50").sell, costPerUnit: px("dowel_8x50").buy });
    push({ key: "m_screw", block: "materials", name: `Шуруп гартований 5,0×70, уп. ${c.packSize} шт — ${dowelPcs} шт`,
      unit: "уп.", qty: packs, pricePerUnit: px("screw_5x70").sell, costPerUnit: px("screw_5x70").buy });
  }
  if (sealantPcs > 0) {
    push({ key: "m_sealant", block: "materials", name: "Клей-герметик Sikaflex-11FC", unit: "шт", qty: sealantPcs,
      pricePerUnit: px("sika_sealant").sell, costPerUnit: px("sika_sealant").buy });
  }

  // ---- Основні роботи ----
  if (input.withPrep && area > 0) {
    push({ key: "w_prep", block: "works", name: "Підготовка поверхні", unit: "м²", qty: area,
      pricePerUnit: wp("prep"), costPerUnit: wc("prep") });
  }
  if (input.withDemount && area > 0) {
    push({ key: "w_demount", block: "works", name: "Демонтаж старого покриття", unit: "м²", qty: area,
      pricePerUnit: wp("demount"), costPerUnit: wc("demount") });
  }
  if (input.withSlope && area > 0) {
    const xpsM2 = ceil(area * 1.05);
    push({ key: "m_xps", block: "materials", name: "XPS 50 мм (розуклонка)", unit: "м²", qty: xpsM2,
      pricePerUnit: px("xps_50").sell, costPerUnit: px("xps_50").buy });
    push({ key: "w_slope", block: "works", name: "Розуклонка XPS", unit: "м²", qty: area,
      pricePerUnit: wp("slope"), costPerUnit: wc("slope") });
  }
  if (area > 0) {
    push({ key: "w_pvc", block: "works", name: "Монтаж ПВХ-мембрани по площі", unit: "м²", qty: area,
      pricePerUnit: wp("pvc_lay"), costPerUnit: wc("pvc_lay") });
  }
  if (perimeter > 0 && verticalHeightM > 0) {
    push({ key: "w_pvc_lin", block: "works", name: "Монтаж ПВХ-мембрани на парапет/примикання", unit: "п.м",
      qty: perimeter, pricePerUnit: wp("pvc_lay_lin"), costPerUnit: wc("pvc_lay_lin") });
  }

  // ---- Логістика ----
  const deliverySell = input.cityDelivery ? logistics.delivery_city.sell
    : Math.max(logistics.delivery_city.sell, input.outOfCityKm * 2 * logistics.delivery_km.sell);
  const deliveryCost = input.cityDelivery ? logistics.delivery_city.buy
    : Math.max(logistics.delivery_city.buy, input.outOfCityKm * 2 * logistics.delivery_km.buy);
  push({ key: "log_delivery", block: "logistics", name: "Доставка матеріалів", unit: "шт", qty: 1,
    pricePerUnit: deliverySell, costPerUnit: deliveryCost });
  if (input.withLift) {
    push({ key: "log_lift", block: "logistics", name: "Підйом матеріалів на дах", unit: "шт", qty: 1,
      pricePerUnit: logistics.lift.sell, costPerUnit: logistics.lift.buy });
  }
  if (input.haulContainers > 0) {
    push({ key: "log_haul", block: "logistics", name: "Вивіз сміття (контейнер 8 м³)", unit: "шт",
      qty: input.haulContainers, pricePerUnit: logistics.haul.sell, costPerUnit: logistics.haul.buy });
  }

  // ---- Підсумки ----
  const sumBy = (b: RoofLine["block"], f: "sum" | "cost") =>
    lines.filter((l) => l.block === b).reduce((a, l) => a + l[f], 0);

  const materialsSell = sumBy("materials", "sum");
  const worksSell = sumBy("works", "sum");
  const logisticsSell = sumBy("logistics", "sum");
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

  const totalClient = Math.round(subtotal);

  const materialsCost = sumBy("materials", "cost");
  const worksAddCost = sumBy("works", "cost");
  const brigadeFloor = area <= 100 ? c.brigadeMinUpTo100 : area * c.brigadePerM2Over100;
  const worksCost = Math.max(brigadeFloor, worksAddCost) + area * c.foremanPerM2;
  const logisticsCost = sumBy("logistics", "cost");
  const amortEquip = area * c.amortEquipPerM2;
  const amortTransport = area * c.amortTransportPerM2;
  const totalCost = materialsCost + worksCost + logisticsCost + amortEquip + amortTransport + input.partnerCommission;

  const grossProfit = totalClient - totalCost;
  const marginPercent = totalClient > 0 ? (grossProfit / totalClient) * 100 : 0;
  if (marginPercent < c.marginThreshold) warnings.push("warnLowMargin");
  if (verticalHeightM === 0) warnings.push("Не задана вертикаль парапету — мембрана рахується лише по горизонталі.");

  return {
    horizontalAreaM2: area,
    verticalAreaM2,
    verticalHeightM,
    membraneM2,
    effectiveAreaM2: totalGeomM2,
    fasteners,
    lines, warnings,
    materialsSell, worksSell, logisticsSell,
    subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
}
