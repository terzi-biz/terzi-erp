/**
 * TERZI Screed (напівсуха стяжка) — core calculation engine.
 * Норми і ціни адмініструються; дефолти реалізують контрольний сценарій
 * Launch Contract v1.0 (docs/ERP_LAUNCH_CONTRACT.md §1):
 * 100 м² / 7 см / М200 → 7 м³, 60 мішків М500, 13,4 т піску (закупівля 14 т),
 * 10 л пластифікатора, 8 упаковок фібри, 17 л дизеля в базовому сценарії.
 * Легасі-норми М200 з 9 та 11 упаковками фібри виведені з runtime.
 */

import { SCREED_CONTROL } from "./core/contract";
import { SCREED_GRADES, type ScreedGrade } from "./screed-grades";


export type Profile = "econom" | "standard" | "reinforced" | "manual";
export type MeshType = "none" | "comp25" | "comp35" | "met25" | "met35";
export type CementDelivery = "own" | "smallManip" | "bigManip" | "manual" | "none";
export type SandType = "standard" | "screened";
export type SandDelivery = "city" | "outskirts" | "chornomorsk" | "manual";
export type PaymentForm = "cash" | "cashless" | "fop";
export type CementType = "auto" | "m500" | "m400";
export type InsulationType = "none" | "eps30" | "eps50" | "xps30" | "xps50";

export interface MaterialPrice {
  buy: number;
  sell: number;
}

export interface ScreedInput {
  area: number;            // m²
  thicknessCm: number;     // 4..15 enforced
  perimeter?: number;      // п.м (optional, fallback to area)
  roomsCount: number;      // кількість кімнат/зон — впливає на деформаційні шви
  floor: number;           // floor of supply
  profile: Profile;
  /** Марка стяжки М100–М300. Якщо задана — має пріоритет над профілем суміші. */
  screedGrade?: ScreedGrade;
  cementType: CementType;  // auto = за профілем, або ручний вибір М500/М400

  // Optional add-ons
  withFilm: boolean;
  withDamper: boolean;
  meshType: MeshType;
  withSlope: boolean;
  withGrind: boolean;
  withCuts: boolean;          // нарізка деформаційних швів
  sandType?: SandType;        // звичайний пісок або пісок з відсівом (посилена стяжка)
  withComplexPrep: boolean;   // "Складна підготовка" — умовна підготовка основи
  withCementUnload?: boolean; // Вивантаження мішків цементу (опція, +10 грн/міш. бригаді)
  withDemolition: boolean;    // "Демонтажні роботи" — демонтаж старої стяжки/покриття
  insulationType: InsulationType; // Утеплення під стяжку

  // Logistics
  cityDelivery: boolean;
  outOfCityKm: number;     // one way km
  withLift: boolean;        // підйом матеріалів на поверх / складна подача
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
  sand:          { buy: 650, sell: 690 },
  sand_screened: { buy: 750, sell: 850 },
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
  diesel:      { buy: 88.82, sell: 90 },
  ins_eps30:   { buy: 90,  sell: 130 },
  ins_eps50:   { buy: 150, sell: 210 },
  ins_xps30:   { buy: 180, sell: 260 },
  ins_xps50:   { buy: 300, sell: 420 },
};

export const DEFAULT_WORK_PRICES = {
  screedBase: 180,         // 4–7 cm: 180 грн/м² (клієнт, укладання н/с машинної стяжки)
  screedExtraPerCm: 15,    // окрема позиція «понад 7 см»: 15 грн/м² за кожен см понад 7
  prep: 10,                // підготовка основи
  film: 10,                // укладання плівки
  damper: 10,              // укладання демпфера
  cuts: 10,                // нарізка деформаційних швів
  grind: 40,               // шліфовка вертольотом
  mesh: 30,
  slope: 40,               // розуклонка
  cementUnload: 10,        // клієнту
  demolition: 100,         // демонтаж старої стяжки/покриття (клієнт)
  insulationLay: 40,       // укладання утеплювача під стяжку (клієнт)
};


// Собівартість бригади — з TERZI_Стяжка_v3_2.xlsx (РОБОТИ І ОПЦІЇ, "Ми платимо").
export const DEFAULT_SETTINGS = {
  dieselPrice: 88.82,      // грн/л (закупка, використовується як cost на лінії "Дизель")
  busFuelPer100: 10,       // L / 100 km
  cityStationDelivery: 2000,
  cementOwnBusToClient: 1500, // мінімалка доставки цементу власним бусом
  smallManipCost: 1500, smallManipClient: 2500, // >2 піддонів → малий маніпулятор
  bigManipCost: 2500, bigManipClient: 3000,
  cementUnloadClient: 10, cementUnloadCost: 5,
  sandTripCapacity: 15,    // т на ходку
  sandCityCost: 1700, sandCityClient: 2000, // місто (клієнт 2000, закупка 1700)
  sandOutskirtsClient: 2200,
  sandChornomorskClient: 2500,
  brigadeMin: 11000,       // фіксована оплата бригаді за замовлення до 100 м² включно
  brigadePerM2: 110,       // понад 100 м² — 110 грн/м² на ВСЮ площу (110 м² → 110×110)
  foremanMin: 0,           // бригадир оплачується строго за м² (див. foremanPerM2)
  foremanPerM2: 10,        // оплата бригадиру 10 грн/м²
  brigadePrepCost: 5,      // підготовка складних замовлень
  screedExtraCostPerCm: 5, // собівартість «понад 7 см»: 5 грн/м² за кожен см
  brigadeMeshCost: 10,
  brigadeSlopeCost: 10,
  brigadeUnloadCost: 10,   // вивантаження цементу — 10 грн/мішок бригаді (опція)
  brigadeLiftCost: 1000,   // підйом матеріалу на поверх (за замовлення)
  brigadeLiftClient: 2000,
  amortEquipPerM2: 30,
  amortTransportPerM2: 15,
  minCheck: 30000,
  marginThreshold: 20,
  roundStep: 1,
  fopRate: 0.06,
  vatRate: 0.22,
  // Націнка на матеріали (для перерахунку продажних цін із закупкових під час
  // ресинку каталогу з дефолтних прайсів постачальників). Одна на всі модулі.
  materialMarkupPercent: 30,
};

export type Settings = typeof DEFAULT_SETTINGS;

/**
 * Логістика — прайс-книга (кодами каталогу `screed.logistics`).
 * buy = собівартість TERZI, sell = ціна для клієнта. Редагується у Налаштуваннях,
 * тут лише дефолти на випадок відсутності запису в каталозі.
 */
export const DEFAULT_LOGISTICS_PRICES: Record<string, MaterialPrice> = {
  station_city: { buy: 500, sell: 2000 },
  station_km: { buy: 40, sell: 60 },
  cement_own: { buy: 0, sell: 1500 },
  cement_small_manip: { buy: 1500, sell: 2500 },
  cement_big_manip: { buy: 2500, sell: 3000 },
  sand_city: { buy: 1700, sell: 2000 },
  sand_outskirts: { buy: 1700, sell: 2200 },
  sand_chornomorsk: { buy: 1700, sell: 2500 },
  lift: { buy: 1000, sell: 2000 },
};

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

export function calculateScreed(
  input: ScreedInput,
  prices: Record<string, MaterialPrice> = DEFAULT_MATERIAL_PRICES,
  works = DEFAULT_WORK_PRICES,
  s: Settings = DEFAULT_SETTINGS,
  logisticsPrices: Record<string, MaterialPrice> = DEFAULT_LOGISTICS_PRICES,
): CalcResult {
  const lp = (code: string): MaterialPrice =>
    logisticsPrices[code] ?? DEFAULT_LOGISTICS_PRICES[code] ?? { buy: 0, sell: 0 };
  const warnings: string[] = [];

  // Thickness gating
  let thickness = input.thicknessCm;
  if (thickness < 4) { warnings.push("warnMinThickness"); thickness = 4; }
  if (thickness > 25) { warnings.push("warnMaxThickness"); thickness = 25; }

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
  if (input.cementType === "m500" || input.cementType === "m400") cementType = input.cementType;

  // Марка стяжки (М100–М300) — технологічна матриця TERZI на 7 м³ суміші.
  // Має пріоритет над профілем: саме вона визначає пісок/цемент/фібру/пластифікатор.
  if (input.screedGrade && SCREED_GRADES[input.screedGrade]) {
    const g = SCREED_GRADES[input.screedGrade];
    if (input.cementType === "auto") cementType = "m500";
    const bagsPer7 = cementType === "m400" ? g.cementM400BagsPer7m3 : g.cementM500BagsPer7m3;
    norms = {
      cementBagsPerM3: bagsPer7 / 7,
      sandTonsPerM3: g.sandTonsPer7m3 / 7,
      plasticizerLPerM3: g.plasticizerLitersPer7m3 / 7,
      fiberPacksPerM3: g.fiberPacksPer7m3 / 7,
      dieselLPerM3: norms.dieselLPerM3,
    };
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
  const sandKey = input.sandType === "screened" ? "m_sand_screened" : "m_sand";
  const sandPrice = (input.sandType === "screened" ? prices.sand_screened : prices.sand) ?? DEFAULT_MATERIAL_PRICES.sand;
  lines.push({ key: sandKey, block: "materials", name: sandKey, unit: "т", qty: sandTonsSale,
    pricePerUnit: sandPrice.sell, costPerUnit: sandPrice.buy,
    sum: sandTonsSale * sandPrice.sell, cost: sandTonsTech * sandPrice.buy, showToClient: true });

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

  // Дизель для станції — залежить від об'єму (товщина × площа) та поверху.
  // Контроль: 100 м² × 7 см (V=7 м³), поверх 1–5 → 22 л.
  const stationDieselL = Math.ceil(volumeM3 * norms.dieselLPerM3 * fc);
  if (stationDieselL > 0) {
    lines.push({ key: "m_diesel", block: "materials", name: "m_diesel", unit: "л", qty: stationDieselL,
      pricePerUnit: prices.diesel.sell, costPerUnit: prices.diesel.buy,
      sum: stationDieselL * prices.diesel.sell, cost: stationDieselL * prices.diesel.buy, showToClient: true });
  }



  // ===== Works =====
  // Демонтаж старої стяжки/покриття — окрема опція для клієнта.
  if (input.withDemolition) {
    lines.push({ key: "w_demolition", block: "works", name: "w_demolition", unit: "м²", qty: area,
      pricePerUnit: works.demolition, costPerUnit: 40, sum: area * works.demolition, cost: area * 40, showToClient: true });
  }

  // Утеплення під стяжку.
  if (input.insulationType !== "none") {
    const insMap: Record<Exclude<InsulationType, "none">, { key: string; nameKey: string }> = {
      eps30: { key: "ins_eps30", nameKey: "m_ins_eps30" },
      eps50: { key: "ins_eps50", nameKey: "m_ins_eps50" },
      xps30: { key: "ins_xps30", nameKey: "m_ins_xps30" },
      xps50: { key: "ins_xps50", nameKey: "m_ins_xps50" },
    };
    const { key: pkey, nameKey } = insMap[input.insulationType];
    const insArea = ceil(area * 1.05);
    lines.push({ key: nameKey, block: "materials", name: nameKey, unit: "м²", qty: insArea,
      pricePerUnit: prices[pkey].sell, costPerUnit: prices[pkey].buy,
      sum: insArea * prices[pkey].sell, cost: insArea * prices[pkey].buy, showToClient: true });
    lines.push({ key: "w_ins_lay", block: "works", name: "w_ins_lay", unit: "м²", qty: area,
      pricePerUnit: works.insulationLay, costPerUnit: 15, sum: area * works.insulationLay, cost: area * 15, showToClient: true });
  }

  // Базова стяжка 4–7 см — окрема позиція.
  lines.push({ key: "w_screed", block: "works", name: "w_screed", unit: "м²", qty: area,
    pricePerUnit: works.screedBase, costPerUnit: 0, sum: area * works.screedBase, cost: 0, showToClient: true });

  // Понад 7 см — окрема позиція: 15 грн/м² за кожен см (собівартість 5 грн/м² за см).
  const extraCm = Math.max(0, thickness - 7);
  if (extraCm > 0) {
    const extraSell = extraCm * works.screedExtraPerCm;
    const extraCost = extraCm * (s.screedExtraCostPerCm ?? 5);
    lines.push({ key: "w_screed_extra", block: "works", name: "w_screed_extra", unit: "м²", qty: area,
      pricePerUnit: extraSell, costPerUnit: extraCost,
      sum: area * extraSell, cost: area * extraCost, showToClient: true });
  }

  // Складна підготовка основи — опціональна (грунтування, вирівнювання ям тощо).
  if (input.withComplexPrep) {
    lines.push({ key: "w_prep", block: "works", name: "w_prep", unit: "м²", qty: area,
      pricePerUnit: works.prep, costPerUnit: s.brigadePrepCost, sum: area * works.prep, cost: area * s.brigadePrepCost, showToClient: true });
  }

  if (input.withFilm) lines.push({ key: "w_film", block: "works", name: "w_film", unit: "м²", qty: area,
    pricePerUnit: works.film, costPerUnit: 0, sum: area * works.film, cost: 0, showToClient: true });
  if (input.withDamper) {
    const lm = input.perimeter && input.perimeter > 0 ? input.perimeter : area;
    lines.push({ key: "w_damper", block: "works", name: "w_damper", unit: "п.м", qty: lm,
      pricePerUnit: works.damper, costPerUnit: 0, sum: lm * works.damper, cost: 0, showToClient: true });
  }
  // Нарізка деформаційних швів — завжди у КП як окрема робота
  // (собівартість входить у фіксовану плату бригаді, тому costPerUnit=0).
  if (input.withCuts !== false) lines.push({ key: "w_cuts", block: "works", name: "w_cuts", unit: "м²", qty: area,
    pricePerUnit: works.cuts, costPerUnit: 0, sum: area * works.cuts, cost: 0, showToClient: true });
  if (input.withGrind) lines.push({ key: "w_grind", block: "works", name: "w_grind", unit: "м²", qty: area,
    pricePerUnit: works.grind, costPerUnit: 0, sum: area * works.grind, cost: 0, showToClient: true });
  if (input.meshType !== "none") lines.push({ key: "w_mesh", block: "works", name: "w_mesh", unit: "м²", qty: area,
    pricePerUnit: works.mesh, costPerUnit: s.brigadeMeshCost, sum: area * works.mesh, cost: area * s.brigadeMeshCost, showToClient: true });
  if (input.withSlope) lines.push({ key: "w_slope", block: "works", name: "w_slope", unit: "м²", qty: area,
    pricePerUnit: works.slope, costPerUnit: s.brigadeSlopeCost, sum: area * works.slope, cost: area * s.brigadeSlopeCost, showToClient: true });

  // Вивантаження цементу — ОПЦІЙНА позиція. Якщо вимкнена, вона не потрапляє
  // ані в КП, ані в собівартість бригади.
  if (input.withCementUnload) {
    lines.push({ key: "w_cement_unload", block: "works", name: "w_cement_unload", unit: "міш.", qty: cementBags,
      pricePerUnit: works.cementUnload, costPerUnit: s.brigadeUnloadCost,
      sum: cementBags * works.cementUnload, cost: cementBags * s.brigadeUnloadCost, showToClient: true });
  }

  // Собівартість бригади: до 100 м² включно — фіксовано 11 000 грн за замовлення;
  // понад 100 м² — 110 грн/м² на ВСЮ площу (напр. 110 м² → 110 × 110 = 12 100).
  // Плюс бригадир — 10 грн/м². Тарифні коефіцієнти площі тут не застосовуються,
  // ставки задані прямо.
  const brigadeBaseCost = area <= 100 ? s.brigadeMin : area * s.brigadePerM2;
  const foremanCost = area * s.foremanPerM2;

  lines.push({ key: "w_brigade", block: "works", name: "Бригада (стяжка, плівка, демпфер, шліфовка, шви)",
    unit: "замовлення", qty: 1, pricePerUnit: 0, costPerUnit: brigadeBaseCost,
    sum: 0, cost: brigadeBaseCost, showToClient: false });
  lines.push({ key: "w_foreman", block: "works", name: "Бригадир (10 грн/м²)",
    unit: "м²", qty: area, pricePerUnit: 0, costPerUnit: s.foremanPerM2,
    sum: 0, cost: foremanCost, showToClient: false });
  
  

  

  // ===== Logistics =====
  // Усі ставки — з прайс-книги логістики (каталог `screed.logistics`).
  const stCity = lp("station_city");
  const stKm = lp("station_km");
  // Ставка «км×2»: якщо у прайсі вказано > 200 грн, трактуємо її як фіксовану
  // надбавку за виїзд за місто, інакше — як ціну за кілометр.
  const kmQty = input.cityDelivery ? 0 : input.outOfCityKm * 2;
  const kmSell = stKm.sell > 200 ? stKm.sell : kmQty * stKm.sell;
  const kmCost = stKm.buy > 200 ? stKm.buy : kmQty * stKm.buy;
  const stationSell = input.cityDelivery ? stCity.sell : stCity.sell + kmSell;
  const stationCost = input.cityDelivery ? stCity.buy : stCity.buy + kmCost;
  lines.push({ key: "log_station", block: "logistics", name: "stationDelivery", unit: "шт", qty: 1,
    pricePerUnit: stationSell, costPerUnit: stationCost,
    sum: stationSell, cost: stationCost, showToClient: true });

  if (input.withLift) {
    const lift = lp("lift");
    lines.push({ key: "log_lift", block: "logistics", name: "Підйом матеріалів / складна подача", unit: "шт", qty: 1,
      pricePerUnit: lift.sell, costPerUnit: lift.buy,
      sum: lift.sell, cost: lift.buy, showToClient: true });
  }

  if (input.cementDelivery !== "none") {
    const cementCode =
      input.cementDelivery === "smallManip" ? "cement_small_manip" :
      input.cementDelivery === "bigManip" ? "cement_big_manip" : "cement_own";
    const cm = lp(cementCode);
    lines.push({ key: "log_cement", block: "logistics", name: "Доставка цементу", unit: "шт", qty: 1,
      pricePerUnit: cm.sell, costPerUnit: cm.buy, sum: cm.sell, cost: cm.buy, showToClient: true });
  }

  const sandTrips = Math.max(1, ceil(sandTonsSale / s.sandTripCapacity));
  const sandCode =
    input.sandDelivery === "outskirts" ? "sand_outskirts" :
    input.sandDelivery === "chornomorsk" ? "sand_chornomorsk" : "sand_city";
  const sandP = lp(sandCode);
  lines.push({ key: "log_sand", block: "logistics", name: "Доставка піску", unit: "ходка", qty: sandTrips,
    pricePerUnit: sandP.sell, costPerUnit: sandP.buy,
    sum: sandTrips * sandP.sell, cost: sandTrips * sandP.buy, showToClient: true });

  // Дизель уже врахований як матеріальна лінія (m_diesel) вище.


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
  // Собівартість бригади і бригадира вже додана як окремі внутрішні рядки
  // у блок "works" вище (showToClient=false), тож окремо не додаємо.
  const worksCost = lines.filter((l) => l.block === "works").reduce((a, l) => a + l.cost, 0);
  const logisticsCost = lines.filter((l) => l.block === "logistics").reduce((a, l) => a + l.cost, 0);
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
    area: 100, thicknessCm: 7, roomsCount: 1, floor: 3, profile: "standard", cementType: "auto",
    withFilm: false, withDamper: false, meshType: "none", withSlope: false, withGrind: false, withCuts: true,
    withComplexPrep: false, withDemolition: false, insulationType: "none",
    cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
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
