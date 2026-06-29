/**
 * TERZI Screed (напівсуха стяжка) — core calculation engine.
 * All norms and prices are editable via the settings store; defaults below
 * implement the brief's control scenario: 100 m² / 7 cm / Standard М200 →
 * 7 m³, 60 bags cement М500, 13.9 t sand (14 t to client), 10 L plast,
 * 11 packs fiber, 22 L diesel (floors 1–5).
 */

export type Profile = "econom" | "standard" | "reinforced" | "manual";
export type MeshType = "none" | "comp25" | "comp35" | "met25" | "met35";
export type CementDelivery = "own" | "smallManip" | "bigManip" | "manual" | "none";
export type SandDelivery = "city" | "outskirts" | "chornomorsk" | "manual";
export type PaymentForm = "cash" | "cashless" | "fop";

export interface MaterialPrice {
  buy: number;
  sell: number;
}

export interface ScreedInput {
  area: number;            // m²
  thicknessCm: number;     // 4..15 enforced
  perimeter?: number;      // п.м (optional, fallback to area)
  floor: number;           // floor of supply
  profile: Profile;

  // Optional add-ons
  withFilm: boolean;
  withDamper: boolean;
  meshType: MeshType;
  withSlope: boolean;
  withGrind: boolean;

  // Logistics
  cityDelivery: boolean;
  outOfCityKm: number;     // one way km
  cementDelivery: CementDelivery;
  sandDelivery: SandDelivery;

  // Payment / commercial
  payment: PaymentForm;
  withVAT: boolean;
  partnerCommission: number;
  discountPercent: number;
  complexityPercent: number;
  manualThickness?: boolean; // admin override beyond 15 cm

  // Manual norm overrides (for profile === "manual")
  manualNorms?: Partial<NormsPerM3>;
}

export interface NormsPerM3 {
  cementBagsPerM3: number;   // bags 25 kg
  sandTonsPerM3: number;     // t
  plasticizerLPerM3: number; // L
  fiberPacksPerM3: number;   // packs
  dieselLPerM3: number;      // L (station)
}

// Note: plasticizerLPerM3 is 10/7 ≈ 1.4286 (displayed as ~1.43) so the
// control scenario (7 m³ → 10 L plast) lands exactly on the spec.
export const PROFILE_NORMS: Record<Exclude<Profile, "manual">, NormsPerM3 & { cementType: "m500" | "m400" }> = {
  econom:     { cementType: "m400", cementBagsPerM3: 8.57, sandTonsPerM3: 1.99, plasticizerLPerM3: 10 / 7, fiberPacksPerM3: 1.0, dieselLPerM3: 3.14 },
  standard:   { cementType: "m500", cementBagsPerM3: 8.57, sandTonsPerM3: 1.99, plasticizerLPerM3: 10 / 7, fiberPacksPerM3: 1.5, dieselLPerM3: 3.14 },
  reinforced: { cementType: "m500", cementBagsPerM3: 8.57, sandTonsPerM3: 1.99, plasticizerLPerM3: 10 / 7, fiberPacksPerM3: 2.0, dieselLPerM3: 3.14 },
};

// Закупка / Продаж — синхронізовано з TERZI_Стяжка_v3_2.xlsx (вкладка МАТЕРІАЛИ).
export const DEFAULT_MATERIAL_PRICES: Record<string, MaterialPrice> = {
  sand:        { buy: 650, sell: 690 },
  cement500:   { buy: 165, sell: 172 },
  cement400:   { buy: 150, sell: 162 },
  fiber:       { buy: 100, sell: 230 },
  plast:       { buy: 70,  sell: 82 },
  film:        { buy: 4,   sell: 10 },
  damper:      { buy: 8,   sell: 12 },
  mesh_comp_25:{ buy: 30,  sell: 60 },
  mesh_comp_35:{ buy: 55,  sell: 95 },
  mesh_met_25: { buy: 40,  sell: 80 },
  mesh_met_35: { buy: 55,  sell: 110 },
};

export const DEFAULT_WORK_PRICES = {
  screedBase: 180,         // 4–7 cm: 180 грн/м² (клієнт)
  screedExtraPerCm: 10,    // +10 грн/м² за кожен см понад 7
  prep: 10,
  film: 15,
  damper: 15,
  cuts: 15,
  grind: 30,
  mesh: 30,
  slope: 30,
  cementUnload: 10,        // клієнту
};

// Собівартість бригади — з TERZI_Стяжка_v3_2.xlsx (РОБОТИ І ОПЦІЇ, "Ми платимо").
export const DEFAULT_SETTINGS = {
  dieselPrice: 75,         // грн/л (закупка)
  busFuelPer100: 10,       // L / 100 km
  cityStationDelivery: 2000,
  cementOwnBusToClient: 1000,
  smallManipCost: 1500, smallManipClient: 2000,
  bigManipCost: 2500, bigManipClient: 3000,
  cementUnloadClient: 10, cementUnloadCost: 5,
  sandTripCapacity: 15,    // t
  sandCityCost: 1700, sandCityClient: 1800,
  sandOutskirtsClient: 2000,
  sandChornomorskClient: 2500,
  brigadeMin: 10000,       // мін. оплата бригаді за об'єкт ≤100 м²
  brigadePerM2: 100,       // базова робота бригади 100 грн/м² (понад 100 м²)
  foremanMin: 1000,        // мін. оплата бригадиру за об'єкт ≤100 м²
  foremanPerM2: 10,        // оплата бригадиру 10 грн/м² (понад 100 м²)
  brigadePrepCost: 5,      // підготовка складних об'єктів
  brigadeMeshCost: 10,
  brigadeSlopeCost: 10,
  brigadeUnloadCost: 5,
  brigadeLiftCost: 1000,   // підйом матеріалу на поверх (за об'єкт)
  brigadeLiftClient: 2000,
  amortEquipPerM2: 30,
  amortTransportPerM2: 15,
  minCheck: 30000,
  marginThreshold: 20,
  roundStep: 1,
  fopRate: 0.06,
  vatRate: 0.22,
};

export type Settings = typeof DEFAULT_SETTINGS;

export function floorCoef(floor: number): number {
  if (floor <= 5) return 1.0;
  if (floor <= 10) return 1.05;
  if (floor <= 15) return 1.15;
  if (floor <= 20) return 1.25;
  if (floor <= 25) return 1.40;
  return 1.50;
}

export interface CalcLine {
  key: string;
  block: "materials" | "works" | "logistics";
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;     // sell to client
  costPerUnit: number;      // internal cost (0 if pure margin item)
  sum: number;              // sell
  cost: number;             // internal
  showToClient: boolean;
}

export interface CalcResult {
  volumeM3: number;
  thicknessUsed: number;
  lines: CalcLine[];
  warnings: string[];

  // Totals (client)
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

  // Internal cost
  materialsCost: number;
  worksCost: number;
  logisticsCost: number;
  amortEquip: number;
  amortTransport: number;
  totalCost: number;

  // Margin
  grossProfit: number;
  marginPercent: number;
}

const ceil = Math.ceil;
const round = (v: number, step = 1) => Math.round(v / step) * step;

export function calculateScreed(input: ScreedInput, prices: Record<string, MaterialPrice> = DEFAULT_MATERIAL_PRICES, works = DEFAULT_WORK_PRICES, s: Settings = DEFAULT_SETTINGS): CalcResult {
  const warnings: string[] = [];

  // Thickness gating
  let thickness = input.thicknessCm;
  if (thickness < 4) { warnings.push("warnMinThickness"); thickness = 4; }
  if (thickness > 15 && !input.manualThickness) { warnings.push("warnMaxThickness"); thickness = 15; }

  const area = Math.max(0, input.area);
  const volumeM3 = +(area * thickness / 100).toFixed(3);
  const fc = floorCoef(input.floor);

  // Norms
  let norms: NormsPerM3;
  let cementType: "m500" | "m400";
  if (input.profile === "manual") {
    const base = PROFILE_NORMS.standard;
    norms = { ...base, ...input.manualNorms } as NormsPerM3;
    cementType = "m500";
  } else {
    const p = PROFILE_NORMS[input.profile];
    norms = p;
    cementType = p.cementType;
  }

  const lines: CalcLine[] = [];

  // ===== Materials =====
  const cementBags = ceil(norms.cementBagsPerM3 * volumeM3);
  const cementKey = cementType === "m500" ? "cement500" : "cement400";
  const cementNameKey = cementType === "m500" ? "m_cement500" : "m_cement400";
  lines.push({ key: cementNameKey, block: "materials", name: cementNameKey, unit: "міш.", qty: cementBags,
    pricePerUnit: prices[cementKey].sell, costPerUnit: prices[cementKey].buy,
    sum: cementBags * prices[cementKey].sell, cost: cementBags * prices[cementKey].buy, showToClient: true });
  if (cementBags > 80) warnings.push("warnManipulator");

  const sandTonsTech = +(norms.sandTonsPerM3 * volumeM3).toFixed(2);
  const sandTonsSale = ceil(sandTonsTech);
  lines.push({ key: "m_sand", block: "materials", name: "m_sand", unit: "т", qty: sandTonsSale,
    pricePerUnit: prices.sand.sell, costPerUnit: prices.sand.buy,
    sum: sandTonsSale * prices.sand.sell, cost: sandTonsTech * prices.sand.buy, showToClient: true });

  const plastL = ceil(norms.plasticizerLPerM3 * volumeM3);
  lines.push({ key: "m_plast", block: "materials", name: "m_plast", unit: "л", qty: plastL,
    pricePerUnit: prices.plast.sell, costPerUnit: prices.plast.buy,
    sum: plastL * prices.plast.sell, cost: plastL * prices.plast.buy, showToClient: true });

  const fiberPacks = ceil(norms.fiberPacksPerM3 * volumeM3);
  lines.push({ key: "m_fiber", block: "materials", name: "m_fiber", unit: "уп.", qty: fiberPacks,
    pricePerUnit: prices.fiber.sell, costPerUnit: prices.fiber.buy,
    sum: fiberPacks * prices.fiber.sell, cost: fiberPacks * prices.fiber.buy, showToClient: true });

  if (input.withFilm) {
    const filmM2 = ceil(area * 1.2);
    lines.push({ key: "m_film", block: "materials", name: "m_film", unit: "м²", qty: filmM2,
      pricePerUnit: prices.film.sell, costPerUnit: prices.film.buy,
      sum: filmM2 * prices.film.sell, cost: filmM2 * prices.film.buy, showToClient: true });
  }

  if (input.withDamper) {
    const damperLm = ceil(input.perimeter && input.perimeter > 0 ? input.perimeter : area);
    lines.push({ key: "m_damper", block: "materials", name: "m_damper", unit: "п.м", qty: damperLm,
      pricePerUnit: prices.damper.sell, costPerUnit: prices.damper.buy,
      sum: damperLm * prices.damper.sell, cost: damperLm * prices.damper.buy, showToClient: true });
  }

  if (input.meshType !== "none") {
    const isMet = input.meshType.startsWith("met");
    const meshArea = ceil(area * (isMet ? 1.15 : 1.10));
    const map = { comp25: ["mesh_comp_25", "m_mesh_comp_25"], comp35: ["mesh_comp_35", "m_mesh_comp_35"],
                  met25: ["mesh_met_25", "m_mesh_met_25"], met35: ["mesh_met_35", "m_mesh_met_35"] } as const;
    const [pkey, nameKey] = map[input.meshType];
    lines.push({ key: nameKey, block: "materials", name: nameKey, unit: "м²", qty: meshArea,
      pricePerUnit: prices[pkey].sell, costPerUnit: prices[pkey].buy,
      sum: meshArea * prices[pkey].sell, cost: meshArea * prices[pkey].buy, showToClient: true });
  }

  // ===== Works =====
  const screedExtra = Math.max(0, thickness - 7) * works.screedExtraPerCm;
  const screedRate = works.screedBase + screedExtra;
  lines.push({ key: "w_screed", block: "works", name: "w_screed", unit: "м²", qty: area,
    pricePerUnit: screedRate, costPerUnit: 0, sum: area * screedRate, cost: 0, showToClient: true });

  lines.push({ key: "w_prep", block: "works", name: "w_prep", unit: "м²", qty: area,
    pricePerUnit: works.prep, costPerUnit: s.brigadePrepCost, sum: area * works.prep, cost: area * s.brigadePrepCost, showToClient: true });

  if (input.withFilm) lines.push({ key: "w_film", block: "works", name: "w_film", unit: "м²", qty: area,
    pricePerUnit: works.film, costPerUnit: 0, sum: area * works.film, cost: 0, showToClient: true });
  if (input.withDamper) {
    const lm = input.perimeter && input.perimeter > 0 ? input.perimeter : area;
    lines.push({ key: "w_damper", block: "works", name: "w_damper", unit: "п.м", qty: lm,
      pricePerUnit: works.damper, costPerUnit: 0, sum: lm * works.damper, cost: 0, showToClient: true });
  }
  if (input.withGrind) lines.push({ key: "w_grind", block: "works", name: "w_grind", unit: "м²", qty: area,
    pricePerUnit: works.grind, costPerUnit: 0, sum: area * works.grind, cost: 0, showToClient: true });
  if (input.meshType !== "none") lines.push({ key: "w_mesh", block: "works", name: "w_mesh", unit: "м²", qty: area,
    pricePerUnit: works.mesh, costPerUnit: s.brigadeMeshCost, sum: area * works.mesh, cost: area * s.brigadeMeshCost, showToClient: true });
  if (input.withSlope) lines.push({ key: "w_slope", block: "works", name: "w_slope", unit: "м²", qty: area,
    pricePerUnit: works.slope, costPerUnit: s.brigadeSlopeCost, sum: area * works.slope, cost: area * s.brigadeSlopeCost, showToClient: true });

  lines.push({ key: "w_cement_unload", block: "works", name: "w_cement_unload", unit: "міш.", qty: cementBags,
    pricePerUnit: works.cementUnload, costPerUnit: s.brigadeUnloadCost,
    sum: cementBags * works.cementUnload, cost: cementBags * s.brigadeUnloadCost, showToClient: true });

  // Brigade base cost (covers screed/film/damper/cuts/grind)
  const brigadeBaseCost = area <= 100 ? s.brigadeMin : area * s.brigadePerM2;
  const foremanCost = area <= 100 ? s.foremanMin : area * s.foremanPerM2;

  // ===== Logistics =====
  const stationDeliveryClient = input.cityDelivery
    ? s.cityStationDelivery
    : Math.max(s.cityStationDelivery, input.outOfCityKm * 2 * 60);
  lines.push({ key: "log_station", block: "logistics", name: "stationDelivery", unit: "шт", qty: 1,
    pricePerUnit: stationDeliveryClient, costPerUnit: stationDeliveryClient,
    sum: stationDeliveryClient, cost: stationDeliveryClient, showToClient: true });

  if (input.cementDelivery !== "none") {
    let cClient = 0, cCost = 0, cName = "Доставка цементу";
    if (input.cementDelivery === "own") { cClient = s.cementOwnBusToClient; cCost = 0; }
    else if (input.cementDelivery === "smallManip") { cClient = s.smallManipClient; cCost = s.smallManipCost; }
    else if (input.cementDelivery === "bigManip") { cClient = s.bigManipClient; cCost = s.bigManipCost; }
    lines.push({ key: "log_cement", block: "logistics", name: cName, unit: "шт", qty: 1,
      pricePerUnit: cClient, costPerUnit: cCost, sum: cClient, cost: cCost, showToClient: true });
  }

  const sandTrips = Math.max(1, ceil(sandTonsSale / s.sandTripCapacity));
  let sandPerTripClient = s.sandCityClient, sandPerTripCost = s.sandCityCost;
  if (input.sandDelivery === "outskirts") { sandPerTripClient = s.sandOutskirtsClient; sandPerTripCost = s.sandCityCost; }
  if (input.sandDelivery === "chornomorsk") { sandPerTripClient = s.sandChornomorskClient; sandPerTripCost = s.sandCityCost; }
  lines.push({ key: "log_sand", block: "logistics", name: "Доставка піску", unit: "ходка", qty: sandTrips,
    pricePerUnit: sandPerTripClient, costPerUnit: sandPerTripCost,
    sum: sandTrips * sandPerTripClient, cost: sandTrips * sandPerTripCost, showToClient: true });

  // Diesel (internal)
  const stationDieselL = +(volumeM3 * norms.dieselLPerM3 * fc).toFixed(1);
  const dieselCost = stationDieselL * s.dieselPrice;

  // ===== Totals =====
  const materialsSell = lines.filter((l) => l.block === "materials").reduce((a, l) => a + l.sum, 0);
  const worksSell = lines.filter((l) => l.block === "works").reduce((a, l) => a + l.sum, 0);
  const logisticsSell = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.sum, 0);
  let subtotal = materialsSell + worksSell + logisticsSell;

  const complexityAmount = subtotal * (input.complexityPercent / 100);
  subtotal += complexityAmount;

  const discountAmount = subtotal * (input.discountPercent / 100);
  subtotal -= discountAmount;

  // Partner commission distributed (kept internal-visible, but baked into subtotal)
  subtotal += input.partnerCommission;

  let fopAdjustment = 0;
  if (input.payment === "fop") { fopAdjustment = subtotal * s.fopRate; subtotal += fopAdjustment; }

  let vatAdjustment = 0;
  if (input.withVAT) { vatAdjustment = materialsSell * s.vatRate; subtotal += vatAdjustment; }

  let minCheckAdjustment = 0;
  if (subtotal < s.minCheck) { minCheckAdjustment = s.minCheck - subtotal; subtotal = s.minCheck; warnings.push("warnMinCheck"); }

  const totalClient = round(subtotal, s.roundStep);

  // Costs
  const materialsCost = lines.filter((l) => l.block === "materials").reduce((a, l) => a + l.cost, 0);
  const worksAddCost = lines.filter((l) => l.block === "works").reduce((a, l) => a + l.cost, 0);
  const worksCost = brigadeBaseCost + worksAddCost;
  const logisticsCost = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.cost, 0) + dieselCost;
  const amortEquip = area * s.amortEquipPerM2;
  const amortTransport = area * s.amortTransportPerM2;
  const totalCost = materialsCost + worksCost + logisticsCost + amortEquip + amortTransport + input.partnerCommission;

  const grossProfit = totalClient - totalCost;
  const marginPercent = totalClient > 0 ? (grossProfit / totalClient) * 100 : 0;
  if (marginPercent < s.marginThreshold) warnings.push("warnLowMargin");

  return {
    volumeM3, thicknessUsed: thickness, lines, warnings,
    materialsSell, worksSell, logisticsSell, subtotalSell: materialsSell + worksSell + logisticsSell,
    discountAmount, complexityAmount, partnerCommission: input.partnerCommission,
    fopAdjustment, vatAdjustment, minCheckAdjustment, totalClient,
    pricePerM2: area > 0 ? totalClient / area : 0,
    materialsCost, worksCost, logisticsCost, amortEquip, amortTransport, totalCost,
    grossProfit, marginPercent,
  };
}

export function formatUah(v: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(v)) + " грн";
}

export function formatNum(v: number, frac = 1): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: frac }).format(v);
}

/** Built-in self-test for the control scenario from the spec. */
export function selfTestControlScenario(): { ok: boolean; report: string[] } {
  const r = calculateScreed({
    area: 100, thicknessCm: 7, floor: 3, profile: "standard",
    withFilm: false, withDamper: false, meshType: "none", withSlope: false, withGrind: false,
    cityDelivery: true, outOfCityKm: 0, cementDelivery: "own", sandDelivery: "city",
    payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
  });
  const cement = r.lines.find((l) => l.key === "m_cement500");
  const sand = r.lines.find((l) => l.key === "m_sand");
  const plast = r.lines.find((l) => l.key === "m_plast");
  const fiber = r.lines.find((l) => l.key === "m_fiber");
  const stationDieselL = +(r.volumeM3 * 3.14 * floorCoef(3)).toFixed(1);

  const checks = [
    ["volume = 7 м³", r.volumeM3 === 7],
    ["цемент М500 = 60 мішків", cement?.qty === 60],
    ["пісок продажа = 14 т", sand?.qty === 14],
    ["пластифікатор = 10 л", plast?.qty === 10],
    ["фібра = 11 уп.", fiber?.qty === 11],
    ["дизель = 22 л (1-5 поверх)", stationDieselL === 22],
  ] as const;

  return {
    ok: checks.every((c) => c[1]),
    report: checks.map(([n, ok]) => `${ok ? "✓" : "✗"} ${n}`),
  };
}
