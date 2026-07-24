/**
 * TERZI Insulation (Утеплення) — core calculation engine.
 *
 * Зони утеплення:
 *  - facade: фасад (EPS/XPS/мінвата, клей + дюбель-парасолька)
 *  - roof:   покрівля (XPS/мінвата, без дюбелів — клей/механіка)
 *  - floor:  підлога (EPS/XPS під стяжку)
 *  - polystyrcrete: монолітна заливка полістиролбетону (м³)
 *
 * Ціни/перелік — з каталогу (useModulePricing("insulation"));
 * коефіцієнти витрат — у InsulationCoefficients.
 */
import type { MaterialPrice } from "./screed-calc";
import { areaLaborTier } from "./area-tiers";

export type InsZone = "facade" | "roof" | "floor" | "polystyrcrete";
export type InsMaterial = "eps_50" | "xps_50" | "mineral" | "polystyrcrete";
export type PaymentForm = "cash" | "cashless" | "fop";

export interface InsulationInput {
  area: number;
  perimeter: number;
  thicknessCm: number;          // товщина шару (для плитних), або висота заливки (для полістиролбетону)
  layersCount: number;          // кількість шарів плитного утеплювача
  zone: InsZone;
  material: InsMaterial;

  withGlue: boolean;
  withDowels: boolean;          // дюбель-парасолька (зазвичай фасад)
  withMesh: boolean;            // склосітка + ґрунт (фасад)

  cityDelivery: boolean;
  outOfCityKm: number;
  withLift: boolean;
  haulContainers: number;

  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
}

export interface InsulationCoefficients {
  cutoffCoef: number;           // коеф. перевитрати плит (нахльост/обрізки)
  glueBagsPer10M2: number;      // мішків клею на 10 м² (для плит з клеєм)
  dowelsPerM2: number;          // дюбелів на 1 м²
  meshCoef: number;             // склосітка з нахльостом
  polystyrcreteWastePercent: number; // втрати при заливці

  brigadeMin: number;
  brigadePerM2: number;
  amortEquipPerM2: number;
  amortTransportPerM2: number;
  minCheck: number;
  marginThreshold: number;
  roundStep: number;
  fopRate: number;
  vatRate: number;
}

export const DEFAULT_INSULATION_COEFFS: InsulationCoefficients = {
  cutoffCoef: 1.07,
  glueBagsPer10M2: 1.0,
  dowelsPerM2: 6,
  meshCoef: 1.10,
  polystyrcreteWastePercent: 3,
  brigadeMin: 10000,
  brigadePerM2: 80,
  amortEquipPerM2: 10,
  amortTransportPerM2: 10,
  minCheck: 18000,
  marginThreshold: 22,
  roundStep: 1,
  fopRate: 0.06,
  vatRate: 0.22,
};

export const DEFAULT_INSULATION_PRICES: Record<string, MaterialPrice> = {
  eps_50:        { buy: 85, sell: 145 },
  xps_50:        { buy: 220, sell: 320 },
  mineral:       { buy: 180, sell: 280 },
  polystyrcrete: { buy: 1900, sell: 2800 },
  glue:          { buy: 210, sell: 320 },
  dowel:         { buy: 4, sell: 9 },
  mesh:          { buy: 25, sell: 55 },
  primer:        { buy: 60, sell: 110 },
};

export const DEFAULT_INSULATION_WORKS = {
  facade: 380,
  roof: 280,
  floor: 220,
  polystyrcrete: 1200,
  mesh_apply: 90,
  dowel_apply: 12,
};

export const DEFAULT_INSULATION_LOGISTICS = {
  delivery_city: { buy: 800, sell: 1200 },
  delivery_km:   { buy: 30, sell: 50 },
  lift:          { buy: 1000, sell: 1800 },
  haul:          { buy: 3500, sell: 5000 },
};

export interface InsLine {
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

export interface InsulationResult {
  lines: InsLine[];
  warnings: string[];
  materialsSell: number; worksSell: number; logisticsSell: number;
  subtotalSell: number; discountAmount: number; complexityAmount: number;
  partnerCommission: number; fopAdjustment: number; vatAdjustment: number;
  minCheckAdjustment: number; totalClient: number; pricePerM2: number;
  materialsCost: number; worksCost: number; logisticsCost: number;
  amortEquip: number; amortTransport: number; totalCost: number;
  grossProfit: number; marginPercent: number;
}

const ceil = Math.ceil;
const round = (v: number, step = 1) => Math.round(v / step) * step;

export function calculateInsulation(
  input: InsulationInput,
  prices: Record<string, MaterialPrice> = DEFAULT_INSULATION_PRICES,
  works = DEFAULT_INSULATION_WORKS,
  logistics = DEFAULT_INSULATION_LOGISTICS,
  c: InsulationCoefficients = DEFAULT_INSULATION_COEFFS,
): InsulationResult {
  const px = (k: string): MaterialPrice => prices[k] ?? DEFAULT_INSULATION_PRICES[k] ?? { buy: 0, sell: 0 };
  const warnings: string[] = [];
  const area = Math.max(0, input.area);
  const layers = input.material === "polystyrcrete" ? 1 : Math.max(1, Math.floor(input.layersCount || 1));
  const lines: InsLine[] = [];

  // ===== Materials =====
  if (input.material === "polystyrcrete") {
    const volume = +(area * input.thicknessCm / 100 * (1 + c.polystyrcreteWastePercent / 100)).toFixed(2);
    lines.push({
      key: "m_polystyrcrete", block: "materials", name: "Полістиролбетон D300",
      unit: "м³", qty: volume,
      pricePerUnit: px("polystyrcrete").sell, costPerUnit: px("polystyrcrete").buy,
      sum: volume * px("polystyrcrete").sell, cost: volume * px("polystyrcrete").buy,
    });
  } else {
    const matArea = +(area * layers * c.cutoffCoef).toFixed(1);
    const labels: Record<string, string> = {
      eps_50: "EPS-35 50 мм", xps_50: "XPS Carbon 50 мм", mineral: "Мінвата 100 мм",
    };
    lines.push({
      key: `m_${input.material}`, block: "materials", name: labels[input.material] ?? input.material,
      unit: "м²", qty: matArea,
      pricePerUnit: px(input.material).sell, costPerUnit: px(input.material).buy,
      sum: matArea * px(input.material).sell, cost: matArea * px(input.material).buy,
    });

    if (input.withGlue) {
      const bags = ceil((area / 10) * c.glueBagsPer10M2);
      lines.push({
        key: "m_glue", block: "materials", name: "Клей для утеплювача", unit: "міш.",
        qty: bags, pricePerUnit: px("glue").sell, costPerUnit: px("glue").buy,
        sum: bags * px("glue").sell, cost: bags * px("glue").buy,
      });
    }
    if (input.withDowels) {
      const dowels = ceil(area * c.dowelsPerM2);
      lines.push({
        key: "m_dowel", block: "materials", name: "Дюбель-парасолька", unit: "шт",
        qty: dowels, pricePerUnit: px("dowel").sell, costPerUnit: px("dowel").buy,
        sum: dowels * px("dowel").sell, cost: dowels * px("dowel").buy,
      });
      lines.push({
        key: "w_dowel", block: "works", name: "Установка дюбелів", unit: "шт",
        qty: dowels, pricePerUnit: works.dowel_apply, costPerUnit: 0,
        sum: dowels * works.dowel_apply, cost: 0,
      });
    }
    if (input.withMesh) {
      const meshArea = +(area * c.meshCoef).toFixed(1);
      lines.push({
        key: "m_mesh", block: "materials", name: "Склосітка 165 г/м²", unit: "м²",
        qty: meshArea, pricePerUnit: px("mesh").sell, costPerUnit: px("mesh").buy,
        sum: meshArea * px("mesh").sell, cost: meshArea * px("mesh").buy,
      });
      lines.push({
        key: "w_mesh", block: "works", name: "Армування склосіткою", unit: "м²",
        qty: area, pricePerUnit: works.mesh_apply, costPerUnit: 0,
        sum: area * works.mesh_apply, cost: 0,
      });
    }
  }

  // ===== Works (зона) =====
  const zoneWorkRate = input.material === "polystyrcrete"
    ? works.polystyrcrete
    : (input.zone === "facade" ? works.facade : input.zone === "roof" ? works.roof : works.floor);
  if (input.material === "polystyrcrete") {
    const volume = +(area * input.thicknessCm / 100).toFixed(2);
    lines.push({
      key: "w_zone", block: "works", name: "Заливка полістиролбетону",
      unit: "м³", qty: volume, pricePerUnit: zoneWorkRate, costPerUnit: 0,
      sum: volume * zoneWorkRate, cost: 0,
    });
  } else {
    lines.push({
      key: "w_zone", block: "works",
      name: input.zone === "facade" ? `Утеплення фасаду (${layers} ш.)`
          : input.zone === "roof" ? `Утеплення покрівлі (${layers} ш.)` : `Утеплення підлоги (${layers} ш.)`,
      unit: "м²", qty: area * layers, pricePerUnit: zoneWorkRate, costPerUnit: 0,
      sum: area * layers * zoneWorkRate, cost: 0,
    });
  }

  // ===== Logistics =====
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
      key: "log_lift", block: "logistics", name: "Підйом утеплювача на поверх/дах", unit: "шт", qty: 1,
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

  // ===== Totals =====
  const laborTier = areaLaborTier(area);
  const brigadeBaseCost = Math.max(c.brigadeMin, area * c.brigadePerM2) * laborTier.coef;
  warnings.push(`laborTier:${laborTier.label} ×${laborTier.coef}`);
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
  if (subtotal < c.minCheck) { minCheckAdjustment = c.minCheck - subtotal; subtotal = c.minCheck; warnings.push("Застосовано мінімальний чек"); }
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
  if (marginPercent < c.marginThreshold) warnings.push("Маржинальність нижче порогу");

  return {
    lines, warnings,
    materialsSell, worksSell, logisticsSell, subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
}
