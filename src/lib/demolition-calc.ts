/**
 * TERZI Demolition (Демонтаж) — core calculation engine.
 *
 * Типи робіт:
 *  - screed: демонтаж стяжки
 *  - tile:   демонтаж плитки
 *  - roof:   демонтаж покрівлі / гідроізоляції
 *  - walls:  демонтаж перегородок
 *
 *  Вивіз сміття рахується по об'єму (м³) → переводиться у контейнери
 *  (8 м³ або 27 м³). Витрати на мішки/диски — у каталозі матеріалів.
 */
import type { MaterialPrice } from "./screed-calc";
import { areaLaborTier } from "./area-tiers";
import { coreFromLegacyResult } from "./core/legacy-adapter";
import type { CanonicalResult } from "./core/dto";

export type DemoType = "screed" | "tile" | "roof" | "walls";
export type ContainerSize = 8 | 27;
export type PaymentForm = "cash" | "cashless" | "fop";

export interface DemolitionInput {
  area: number;
  thicknessCm: number;       // для стяжки/перегородок → впливає на об'єм сміття
  type: DemoType;
  manualHaulM3?: number;     // якщо вказати, бере це замість розрахункового
  containerSize: ContainerSize;

  withBags: boolean;         // винос мішками (для верхніх поверхів)
  floor: number;             // поверх (впливає на тариф)

  cityDelivery: boolean;
  outOfCityKm: number;

  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
}

export interface DemolitionCoefficients {
  // Об'єм сміття на 1 м² за типом (м³/м²)
  wasteM3PerM2Screed: number;     // ~ товщина/100, але з коеф. розпушення
  wasteM3PerM2Tile: number;       // плитка + клей
  wasteM3PerM2Roof: number;       // стара покрівля
  wasteM3PerM2Walls: number;      // перегородки 100 мм цегла/блок
  wasteLooseCoef: number;         // коеф. розпушення (1.4..1.6)
  bagsPerM3: number;              // мішків 70 л на м³ розпушеного сміття
  floorAddPercent: number;        // % надбавки за поверх (понад 1)

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

export const DEFAULT_DEMOLITION_COEFFS: DemolitionCoefficients = {
  wasteM3PerM2Screed: 0.07,   // ~7 см
  wasteM3PerM2Tile: 0.03,
  wasteM3PerM2Roof: 0.05,
  wasteM3PerM2Walls: 0.10,
  wasteLooseCoef: 1.5,
  bagsPerM3: 18,
  floorAddPercent: 5,
  brigadeMin: 8000,
  brigadePerM2: 60,
  amortEquipPerM2: 8,
  amortTransportPerM2: 8,
  minCheck: 12000,
  marginThreshold: 25,
  roundStep: 1,
  fopRate: 0.06,
  vatRate: 0.22,
};

export const DEFAULT_DEMOLITION_PRICES: Record<string, MaterialPrice> = {
  bags:  { buy: 18, sell: 35 },
  blade: { buy: 380, sell: 600 },
};

export const DEFAULT_DEMOLITION_WORKS = {
  screed: 250,
  tile: 180,
  roof: 220,
  walls: 320,
  haul: 900,         // винос/вивіз, грн/м³
};

export const DEFAULT_DEMOLITION_LOGISTICS = {
  container_8:  { buy: 3500, sell: 5000 },
  container_27: { buy: 7000, sell: 10000 },
  delivery_km:  { buy: 30, sell: 50 },
};

export interface DemoLine {
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

export interface DemolitionResult {
  /** Канонічний результат Calculation Core — єдине джерело підсумків. */
  core?: CanonicalResult;
  wasteM3: number;
  containers: number;
  lines: DemoLine[];
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

export function calculateDemolition(
  input: DemolitionInput,
  prices: Record<string, MaterialPrice> = DEFAULT_DEMOLITION_PRICES,
  works = DEFAULT_DEMOLITION_WORKS,
  logistics = DEFAULT_DEMOLITION_LOGISTICS,
  c: DemolitionCoefficients = DEFAULT_DEMOLITION_COEFFS,
): DemolitionResult {
  const px = (k: string): MaterialPrice => prices[k] ?? DEFAULT_DEMOLITION_PRICES[k] ?? { buy: 0, sell: 0 };
  const warnings: string[] = [];
  const area = Math.max(0, input.area);
  const lines: DemoLine[] = [];

  // Об'єм сміття
  let basePerM2 = 0;
  if (input.type === "screed") basePerM2 = (input.thicknessCm > 0 ? input.thicknessCm / 100 : c.wasteM3PerM2Screed);
  else if (input.type === "tile") basePerM2 = c.wasteM3PerM2Tile;
  else if (input.type === "roof") basePerM2 = c.wasteM3PerM2Roof;
  else if (input.type === "walls") basePerM2 = (input.thicknessCm > 0 ? input.thicknessCm / 100 : c.wasteM3PerM2Walls);
  const looseM3 = input.manualHaulM3 && input.manualHaulM3 > 0
    ? input.manualHaulM3
    : +(area * basePerM2 * c.wasteLooseCoef).toFixed(2);
  const containers = ceil(looseM3 / input.containerSize);

  // ===== Works =====
  const baseRate = input.type === "screed" ? works.screed
    : input.type === "tile" ? works.tile
    : input.type === "roof" ? works.roof
    : works.walls;
  const floorMult = 1 + Math.max(0, input.floor - 1) * (c.floorAddPercent / 100);
  const ratePerM2 = +(baseRate * floorMult).toFixed(1);

  const typeLabel: Record<DemoType, string> = {
    screed: "Демонтаж стяжки", tile: "Демонтаж плитки",
    roof: "Демонтаж покрівлі", walls: "Демонтаж перегородок",
  };
  lines.push({
    key: "w_demo", block: "works", name: typeLabel[input.type],
    unit: "м²", qty: area, pricePerUnit: ratePerM2, costPerUnit: 0,
    sum: area * ratePerM2, cost: 0,
  });

  // Винос/вивіз
  lines.push({
    key: "w_haul", block: "works", name: "Винесення сміття до контейнера",
    unit: "м³", qty: looseM3, pricePerUnit: works.haul, costPerUnit: 0,
    sum: looseM3 * works.haul, cost: 0,
  });

  // Мішки
  if (input.withBags) {
    const bags = ceil(looseM3 * c.bagsPerM3);
    lines.push({
      key: "m_bags", block: "materials", name: "Будівельні мішки 70 л", unit: "шт",
      qty: bags, pricePerUnit: px("bags").sell, costPerUnit: px("bags").buy,
      sum: bags * px("bags").sell, cost: bags * px("bags").buy,
    });
  }

  // Алмазний диск (приблизно 1 шт на 30 м² плитки/стяжки)
  if (input.type === "screed" || input.type === "tile") {
    const blades = ceil(area / 30);
    if (blades > 0) {
      lines.push({
        key: "m_blade", block: "materials", name: "Алмазний диск 230 мм", unit: "шт",
        qty: blades, pricePerUnit: px("blade").sell, costPerUnit: px("blade").buy,
        sum: blades * px("blade").sell, cost: blades * px("blade").buy,
      });
    }
  }

  // ===== Logistics — контейнери =====
  const contKey = input.containerSize === 27 ? "container_27" : "container_8";
  const contPrice = logistics[contKey];
  lines.push({
    key: "log_container", block: "logistics",
    name: `Контейнер ${input.containerSize} м³ (вивіз)`,
    unit: "шт", qty: containers,
    pricePerUnit: contPrice.sell, costPerUnit: contPrice.buy,
    sum: containers * contPrice.sell, cost: containers * contPrice.buy,
  });
  if (!input.cityDelivery && input.outOfCityKm > 0) {
    const km2 = input.outOfCityKm * 2;
    lines.push({
      key: "log_km", block: "logistics", name: "Кілометраж за межі міста (×2)",
      unit: "км", qty: km2,
      pricePerUnit: logistics.delivery_km.sell, costPerUnit: logistics.delivery_km.buy,
      sum: km2 * logistics.delivery_km.sell, cost: km2 * logistics.delivery_km.buy,
    });
  }

  // ===== Totals =====
  const laborTier = areaLaborTier(area);
  const brigadeBaseCost = Math.max(c.brigadeMin, area * c.brigadePerM2) * laborTier.coef;
  
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

  const result: DemolitionResult = {
    wasteM3: looseM3, containers,
    lines, warnings,
    materialsSell, worksSell, logisticsSell, subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
  result.core = coreFromLegacyResult("demolition", area, result, {
    payment: input.payment,
    withVAT: input.withVAT,
    vatRatePercent: 20, // Launch Contract §6: справжня ставка ПДВ
    complexityPercent: input.complexityPercent,
    discountPercent: input.discountPercent,
    partnerCommission: input.partnerCommission,
    minCheck: c.minCheck,
    engineVersion: "demolition@core1",
  });
  return result;
}
