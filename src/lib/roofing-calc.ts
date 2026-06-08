/**
 * TERZI Roofing calculator engine.
 *
 * Supports two waterproofing systems:
 *  1) Rubemast (наплавний бітумний рулон) — 1, 2 or 3 layers.
 *  2) PVC-membrane 1.5 mm з механічним кріпленням.
 *
 * Norms / коефіцієнти зберігаються у RoofingSettings та редагуються
 * через "Налаштування → Покрівля". Ціни матеріалів/робіт/логістики
 * беруться з catalog_items через useModulePricing("roofing").
 */
import type { MaterialPrice } from "./screed-calc";

export type RoofSystem = "rubemast" | "pvc";
export type PaymentForm = "cash" | "cashless" | "fop";

export interface RoofingInput {
  area: number;             // m²
  perimeter: number;        // п.м (фактичний периметр даху)
  parapetHeightCm: number;  // см (висота парапету) — стандарт 30
  system: RoofSystem;
  layers: 1 | 2 | 3;        // тільки для rubemast

  withPrimer: boolean;
  withSlope: boolean;
  slopeAvgThicknessMm: number; // mm, для XPS розуклонки (опц.)
  withDemount: boolean;
  withGeotextile: boolean;     // для ПВХ — за замовчуванням true
  withParapetWork: boolean;    // обробка примикань

  // Logistics
  cityDelivery: boolean;
  outOfCityKm: number;
  withLift: boolean;            // підйом на дах
  haulContainers: number;       // к-сть контейнерів вивозу сміття

  // Commercial
  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
}

export interface RoofingCoefficients {
  // Rubemast
  rubemastOverlapCoef: number;     // 1.15 (нахльост 10см)
  rubemastRollAreaM2: number;      // 10 м² ефективна площа рулону
  rubemastPrimerLPerM2: number;    // 0.35 л/м²
  rubemastGasKgPerLayerM2: number; // 0.35 кг/м²/шар
  rubemastGasCylinderKg: number;   // 22 кг у балоні
  // PVC
  pvcOverlapCoef: number;          // 1.10
  pvcGeoCoef: number;              // 1.10
  pvcFastenersPerM2: number;       // 4 шт/м² (середнє)
  pvcParapetExtraCoef: number;     // 1.10 на парапет
  // Common
  parapetHeightCmDefault: number;  // 30 см (виливається у площу нахльосту)
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

export const DEFAULT_ROOFING_COEFFS: RoofingCoefficients = {
  rubemastOverlapCoef: 1.15,
  rubemastRollAreaM2: 10,
  rubemastPrimerLPerM2: 0.35,
  rubemastGasKgPerLayerM2: 0.35,
  rubemastGasCylinderKg: 22,
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

export const DEFAULT_ROOFING_PRICES: Record<string, MaterialPrice> = {
  rubemast: { buy: 850, sell: 1300 },
  primer:   { buy: 65,  sell: 110 },
  gas:      { buy: 1200, sell: 1600 },
  pvc_15:   { buy: 280, sell: 420 },
  geo_300:  { buy: 28,  sell: 55 },
  fastener: { buy: 8,   sell: 18 },
  xps_50:   { buy: 220, sell: 320 },
};

export const DEFAULT_ROOFING_WORKS = {
  rubemast_lay: 200,
  primer_apply: 40,
  pvc_lay: 280,
  geo_lay: 50,
  slope: 220,
  demount: 150,
  parapet: 120,
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
  effectiveAreaM2: number;     // площа з парапетом
  rolls?: number;
  fasteners?: number;
  primerL?: number;
  gasCylinders?: number;
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
  logistics = DEFAULT_ROOFING_LOGISTICS,
  c: RoofingCoefficients = DEFAULT_ROOFING_COEFFS,
): RoofingResult {
  const warnings: string[] = [];
  const area = Math.max(0, input.area);
  const perimeter = Math.max(0, input.perimeter || Math.sqrt(area) * 4);
  const parapetH = Math.max(0, input.parapetHeightCm) / 100; // m

  // Площа парапету додається до робочої площі (нахльост на парапет)
  const parapetAreaM2 = perimeter * parapetH;
  const effectiveAreaM2 = +(area + parapetAreaM2).toFixed(2);

  const lines: RoofLine[] = [];
  let rollsCount: number | undefined;
  let gasCylinders: number | undefined;
  let primerL: number | undefined;
  let fastenersCount: number | undefined;

  if (input.system === "rubemast") {
    const layers = input.layers;
    const perLayerM2 = effectiveAreaM2 * c.rubemastOverlapCoef;
    const totalM2 = perLayerM2 * layers;
    rollsCount = ceil(totalM2 / c.rubemastRollAreaM2);
    lines.push({
      key: "m_rubemast", block: "materials",
      name: `Рубемаст (${layers} ${layers === 1 ? "шар" : "шари"})`,
      unit: "рул.", qty: rollsCount,
      pricePerUnit: prices.rubemast.sell, costPerUnit: prices.rubemast.buy,
      sum: rollsCount * prices.rubemast.sell, cost: rollsCount * prices.rubemast.buy,
    });

    // Gas
    const gasKg = totalM2 * c.rubemastGasKgPerLayerM2;
    gasCylinders = ceil(gasKg / c.rubemastGasCylinderKg);
    lines.push({
      key: "m_gas", block: "materials", name: "Газ пропан", unit: "бал.",
      qty: gasCylinders, pricePerUnit: prices.gas.sell, costPerUnit: prices.gas.buy,
      sum: gasCylinders * prices.gas.sell, cost: gasCylinders * prices.gas.buy,
    });

    if (input.withPrimer) {
      primerL = ceil(effectiveAreaM2 * c.rubemastPrimerLPerM2);
      lines.push({
        key: "m_primer", block: "materials", name: "Бітумний праймер", unit: "л",
        qty: primerL, pricePerUnit: prices.primer.sell, costPerUnit: prices.primer.buy,
        sum: primerL * prices.primer.sell, cost: primerL * prices.primer.buy,
      });
      lines.push({
        key: "w_primer", block: "works", name: "Праймування основи", unit: "м²",
        qty: area, pricePerUnit: works.primer_apply, costPerUnit: 0,
        sum: area * works.primer_apply, cost: 0,
      });
    }

    // Робота — наплавлення (за кожен шар)
    lines.push({
      key: "w_rubemast", block: "works",
      name: `Наплавлення рубемасту (${layers} ${layers === 1 ? "шар" : "шари"})`,
      unit: "м²", qty: area * layers,
      pricePerUnit: works.rubemast_lay, costPerUnit: 0,
      sum: area * layers * works.rubemast_lay, cost: 0,
    });
  } else {
    // PVC membrane
    const pvcM2 = ceil(effectiveAreaM2 * c.pvcOverlapCoef);
    lines.push({
      key: "m_pvc", block: "materials", name: "ПВХ-мембрана 1.5 мм", unit: "м²",
      qty: pvcM2, pricePerUnit: prices.pvc_15.sell, costPerUnit: prices.pvc_15.buy,
      sum: pvcM2 * prices.pvc_15.sell, cost: pvcM2 * prices.pvc_15.buy,
    });

    if (input.withGeotextile) {
      const geoM2 = ceil(effectiveAreaM2 * c.pvcGeoCoef);
      lines.push({
        key: "m_geo", block: "materials", name: "Геотекстиль 300 г/м²", unit: "м²",
        qty: geoM2, pricePerUnit: prices.geo_300.sell, costPerUnit: prices.geo_300.buy,
        sum: geoM2 * prices.geo_300.sell, cost: geoM2 * prices.geo_300.buy,
      });
      lines.push({
        key: "w_geo", block: "works", name: "Укладка геотекстилю", unit: "м²",
        qty: area, pricePerUnit: works.geo_lay, costPerUnit: 0,
        sum: area * works.geo_lay, cost: 0,
      });
    }

    fastenersCount = ceil(area * c.pvcFastenersPerM2);
    lines.push({
      key: "m_fast", block: "materials", name: "Кріплення телескопічне", unit: "шт",
      qty: fastenersCount, pricePerUnit: prices.fastener.sell, costPerUnit: prices.fastener.buy,
      sum: fastenersCount * prices.fastener.sell, cost: fastenersCount * prices.fastener.buy,
    });

    lines.push({
      key: "w_pvc", block: "works", name: "Монтаж ПВХ-мембрани", unit: "м²",
      qty: area, pricePerUnit: works.pvc_lay, costPerUnit: 0,
      sum: area * works.pvc_lay, cost: 0,
    });
  }

  // Common works
  if (input.withDemount) {
    lines.push({
      key: "w_demount", block: "works", name: "Демонтаж старого покриття", unit: "м²",
      qty: area, pricePerUnit: works.demount, costPerUnit: 0,
      sum: area * works.demount, cost: 0,
    });
  }
  if (input.withSlope) {
    const xpsM2 = ceil(area * 1.05);
    lines.push({
      key: "m_xps", block: "materials", name: "XPS 50 мм (розуклонка)", unit: "м²",
      qty: xpsM2, pricePerUnit: prices.xps_50.sell, costPerUnit: prices.xps_50.buy,
      sum: xpsM2 * prices.xps_50.sell, cost: xpsM2 * prices.xps_50.buy,
    });
    lines.push({
      key: "w_slope", block: "works", name: "Розуклонка XPS", unit: "м²",
      qty: area, pricePerUnit: works.slope, costPerUnit: 0,
      sum: area * works.slope, cost: 0,
    });
  }
  if (input.withParapetWork && perimeter > 0) {
    lines.push({
      key: "w_parapet", block: "works", name: "Обробка парапету/примикань", unit: "п.м",
      qty: perimeter, pricePerUnit: works.parapet, costPerUnit: 0,
      sum: perimeter * works.parapet, cost: 0,
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

  // Brigade base
  const brigadeRate = input.system === "rubemast" ? c.brigadePerM2Rubemast : c.brigadePerM2Pvc;
  const brigadeBaseCost = Math.max(c.brigadeMin, area * brigadeRate);

  // Totals
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
  const worksCost = brigadeBaseCost + worksAddCost;
  const logisticsCost = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.cost, 0);
  const amortEquip = area * c.amortEquipPerM2;
  const amortTransport = area * c.amortTransportPerM2;
  const totalCost = materialsCost + worksCost + logisticsCost + amortEquip + amortTransport + input.partnerCommission;

  const grossProfit = totalClient - totalCost;
  const marginPercent = totalClient > 0 ? (grossProfit / totalClient) * 100 : 0;
  if (marginPercent < c.marginThreshold) warnings.push("warnLowMargin");

  return {
    effectiveAreaM2,
    rolls: rollsCount, fasteners: fastenersCount, primerL, gasCylinders,
    lines, warnings,
    materialsSell, worksSell, logisticsSell, subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
}
