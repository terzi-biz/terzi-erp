/**
 * TERZI — виробничо-кошторисний рушій напівсухої машинної стяжки за марками М100–М300.
 *
 * Базова технологічна точка: 100 м² × 7 см = 7 м³ суміші.
 * Усі рецептури масштабуються коефіцієнтом scaleFactor = volumeM3 / 7.
 *
 * Політика округлення: округлюємо вгору тільки штучні одиниці закупівлі
 * (мішки цементу, упаковки фібри, машини піску). Грошові підсумки —
 * без проміжного округлення, округлення лише при відображенні.
 */

export type ScreedGrade = "M100" | "M150" | "M200" | "M250" | "M300";
export type CementGrade = "m400" | "m500";

export const SCREED_GRADE_LIST: ScreedGrade[] = ["M100", "M150", "M200", "M250", "M300"];
export const GRADE_LABEL: Record<ScreedGrade, string> = {
  M100: "М100", M150: "М150", M200: "М200", M250: "М250", M300: "М300",
};

export interface GradeRecipe {
  strengthMPa: number;
  sandTonsPer7m3: number;
  cementM500BagsPer7m3: number;
  cementM400BagsPer7m3: number;
  fiberPacksPer7m3: number;
  plasticizerLitersPer7m3: number;
}

/** Технологічна матриця TERZI (на 7 м³ суміші = 100 м² × 7 см). */
export const SCREED_GRADES: Record<ScreedGrade, GradeRecipe> = {
  M100: { strengthMPa: 10, sandTonsPer7m3: 13.6, cementM500BagsPer7m3: 42, cementM400BagsPer7m3: 49, fiberPacksPer7m3: 4,  plasticizerLitersPer7m3: 7 },
  M150: { strengthMPa: 15, sandTonsPer7m3: 13.5, cementM500BagsPer7m3: 50, cementM400BagsPer7m3: 59, fiberPacksPer7m3: 6,  plasticizerLitersPer7m3: 8.5 },
  M200: { strengthMPa: 20, sandTonsPer7m3: 13.4, cementM500BagsPer7m3: 60, cementM400BagsPer7m3: 70, fiberPacksPer7m3: 8,  plasticizerLitersPer7m3: 10 },
  M250: { strengthMPa: 25, sandTonsPer7m3: 13.2, cementM500BagsPer7m3: 70, cementM400BagsPer7m3: 82, fiberPacksPer7m3: 10, plasticizerLitersPer7m3: 12 },
  M300: { strengthMPa: 30, sandTonsPer7m3: 13.0, cementM500BagsPer7m3: 80, cementM400BagsPer7m3: 94, fiberPacksPer7m3: 12, plasticizerLitersPer7m3: 13.5 },
};

/** Централізована конфігурація: закупівельні ціни, норми, тарифи робіт і логістики. */
export interface ScreedProductionConfig {
  // Закупівельні ціни
  sandPricePerTon: number;
  cementM400BagPrice: number;
  cementM500BagPrice: number;
  fiberPackPrice: number;
  plasticizerPricePerL: number;
  filmPricePerM2: number;
  damperPricePerM: number;
  dieselPricePerL: number;
  // Норми
  dieselLitersPer100m2: number;
  filmCoef: number;
  cementBagKg: number;
  fiberPackKg: number;
  // Робота бригади
  brigadeMinCost: number;      // до 100 м² включно
  brigadePerM2Over100: number; // понад 100 м²
  cementUnloadPerBag: number;
  meshPerM2: number;
  slopePerM2: number;
  baseThicknessCm: number;
  extraThicknessPerCmPerM2: number;
  // Логістика
  stationDeliveryCost: number;
  sandTruckCost: number;
  sandTruckCapacityTons: number;
  cementDeliveryCost: number;
}

export const DEFAULT_SCREED_PRODUCTION_CONFIG: ScreedProductionConfig = {
  sandPricePerTon: 700,
  cementM400BagPrice: 159,
  cementM500BagPrice: 169,
  fiberPackPrice: 130,
  plasticizerPricePerL: 70,
  filmPricePerM2: 5,
  damperPricePerM: 7,
  dieselPricePerL: 75,

  dieselLitersPer100m2: 17,
  filmCoef: 1.2,
  cementBagKg: 25,
  fiberPackKg: 0.6,

  brigadeMinCost: 11000,
  brigadePerM2Over100: 110,
  cementUnloadPerBag: 5,
  meshPerM2: 5,
  slopePerM2: 10,
  baseThicknessCm: 7,
  extraThicknessPerCmPerM2: 10,

  stationDeliveryCost: 500,
  sandTruckCost: 1700,
  sandTruckCapacityTons: 15,
  cementDeliveryCost: 1200,
};

export interface ProductionInput {
  areaM2: number;
  thicknessCm: number;
  perimeterM: number;
  screedGrade: ScreedGrade;
  cementGrade: CementGrade;
  hasMesh: boolean;
  hasSlope: boolean;
  marginPercent: number; // маржа від виручки, %
}

export interface ProductionRow {
  key: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  sum: number;
}

export interface ProductionResult {
  // Геометрія
  areaM2: number;
  thicknessCm: number;
  perimeterM: number;
  screedVolumeM3: number;
  scaleFactor: number;
  screedGrade: ScreedGrade;
  cementGrade: CementGrade;
  strengthMPa: number;
  hasMesh: boolean;
  hasSlope: boolean;

  // Матеріали (кількості)
  sandTons: number;
  cementBagsRaw: number;
  cementBags: number;
  cementKg: number;
  fiberPacksRaw: number;
  fiberPacks: number;
  fiberKg: number;
  plasticizerLiters: number;
  plasticizerLitersPurchase: number;
  filmM2: number;
  damperM: number;
  dieselLiters: number;

  materialRows: ProductionRow[];
  materialsTotal: number;

  // Робота
  baseLaborCost: number;
  cementUnloadingCost: number;
  meshLaborCost: number;
  slopeLaborCost: number;
  extraThicknessCm: number;
  extraThicknessLaborCost: number;
  laborRows: ProductionRow[];
  laborTotal: number;

  // Логістика
  stationDeliveryCost: number;
  sandTruckCount: number;
  sandDeliveryCost: number;
  cementDeliveryCost: number;
  logisticsRows: ProductionRow[];
  logisticsTotal: number;

  // Підсумки
  productionCost: number;
  productionCostPerM2: number;
  marginPercent: number;
  sellingPrice: number;
  sellingPricePerM2: number;
  grossProfit: number;

  warnings: string[];
}

const r2 = (v: number) => +v.toFixed(2);

export function calculateScreedProduction(
  input: ProductionInput,
  cfg: ScreedProductionConfig = DEFAULT_SCREED_PRODUCTION_CONFIG,
): ProductionResult {
  const warnings: string[] = [];
  const areaM2 = Math.max(0, input.areaM2);
  const thicknessCm = Math.max(0, input.thicknessCm);
  const perimeterM = Math.max(0, input.perimeterM);
  if (perimeterM <= 0) warnings.push("Периметр не вказано — демпферна стрічка не порахована.");

  const recipe = SCREED_GRADES[input.screedGrade] ?? SCREED_GRADES.M200;
  const screedVolumeM3 = r2(areaM2 * thicknessCm / 100);
  const scaleFactor = screedVolumeM3 / 7;

  // Матеріали
  const sandTons = r2(recipe.sandTonsPer7m3 * scaleFactor);
  const bagsPer7 = input.cementGrade === "m400" ? recipe.cementM400BagsPer7m3 : recipe.cementM500BagsPer7m3;
  const cementBagsRaw = r2(bagsPer7 * scaleFactor);
  const cementBags = Math.ceil(cementBagsRaw);
  const cementKg = cementBags * cfg.cementBagKg;
  const cementBagPrice = input.cementGrade === "m400" ? cfg.cementM400BagPrice : cfg.cementM500BagPrice;

  const fiberPacksRaw = r2(recipe.fiberPacksPer7m3 * scaleFactor);
  const fiberPacks = Math.ceil(fiberPacksRaw);
  const fiberKg = r2(fiberPacks * cfg.fiberPackKg);

  const plasticizerLiters = r2(recipe.plasticizerLitersPer7m3 * scaleFactor);
  const plasticizerLitersPurchase = Math.ceil(plasticizerLiters);

  const filmM2 = r2(areaM2 * cfg.filmCoef);
  const damperM = perimeterM;
  const dieselLiters = r2(areaM2 / 100 * cfg.dieselLitersPer100m2);

  const sandCost = sandTons * cfg.sandPricePerTon;
  const cementCost = cementBags * cementBagPrice;
  const fiberCost = fiberPacks * cfg.fiberPackPrice;
  const plasticizerCost = plasticizerLiters * cfg.plasticizerPricePerL;
  const filmCost = filmM2 * cfg.filmPricePerM2;
  const damperCost = damperM * cfg.damperPricePerM;
  const dieselCost = dieselLiters * cfg.dieselPricePerL;

  const materialRows: ProductionRow[] = [
    { key: "sand", name: "Вознесенський пісок", unit: "т", qty: sandTons, price: cfg.sandPricePerTon, sum: sandCost },
    { key: "cement", name: `Цемент ${input.cementGrade === "m400" ? "М400" : "М500"}`, unit: `міш. ${cfg.cementBagKg} кг`, qty: cementBags, price: cementBagPrice, sum: cementCost },
    { key: "fiber", name: "Sika Fiber 600 г", unit: "уп.", qty: fiberPacks, price: cfg.fiberPackPrice, sum: fiberCost },
    { key: "plast", name: "Пластифікатор Sika", unit: "л", qty: plasticizerLiters, price: cfg.plasticizerPricePerL, sum: plasticizerCost },
    { key: "film", name: "Плівка", unit: "м²", qty: filmM2, price: cfg.filmPricePerM2, sum: filmCost },
    { key: "damper", name: "Демпферна стрічка", unit: "м.п.", qty: damperM, price: cfg.damperPricePerM, sum: damperCost },
    { key: "diesel", name: "Дизель (станція)", unit: "л", qty: dieselLiters, price: cfg.dieselPricePerL, sum: dieselCost },
  ];
  const materialsTotal = materialRows.reduce((a, l) => a + l.sum, 0);

  // Робота бригади
  const baseLaborCost = areaM2 <= 100 ? cfg.brigadeMinCost : areaM2 * cfg.brigadePerM2Over100;
  const cementUnloadingCost = cementBags * cfg.cementUnloadPerBag;
  const meshLaborCost = input.hasMesh ? areaM2 * cfg.meshPerM2 : 0;
  const slopeLaborCost = input.hasSlope ? areaM2 * cfg.slopePerM2 : 0;
  const extraThicknessCm = Math.max(0, thicknessCm - cfg.baseThicknessCm);
  const extraThicknessLaborCost = areaM2 * extraThicknessCm * cfg.extraThicknessPerCmPerM2;

  const laborRows: ProductionRow[] = [
    { key: "base", name: areaM2 <= 100 ? "Основна робота бригади (мінімалка)" : "Основна робота бригади", unit: areaM2 <= 100 ? "замовлення" : "м²", qty: areaM2 <= 100 ? 1 : areaM2, price: areaM2 <= 100 ? cfg.brigadeMinCost : cfg.brigadePerM2Over100, sum: baseLaborCost },
    { key: "unload", name: "Вивантаження цементу", unit: "міш.", qty: cementBags, price: cfg.cementUnloadPerBag, sum: cementUnloadingCost },
  ];
  if (input.hasMesh) laborRows.push({ key: "mesh", name: "Укладка армувальної сітки", unit: "м²", qty: areaM2, price: cfg.meshPerM2, sum: meshLaborCost });
  if (input.hasSlope) laborRows.push({ key: "slope", name: "Розуклонка", unit: "м²", qty: areaM2, price: cfg.slopePerM2, sum: slopeLaborCost });
  if (extraThicknessCm > 0) laborRows.push({ key: "extra", name: `Доплата за шар понад ${cfg.baseThicknessCm} см (+${extraThicknessCm} см)`, unit: "м²×см", qty: r2(areaM2 * extraThicknessCm), price: cfg.extraThicknessPerCmPerM2, sum: extraThicknessLaborCost });
  const laborTotal = laborRows.reduce((a, l) => a + l.sum, 0);

  // Логістика
  const sandTruckCount = sandTons > 0 ? Math.ceil(r2(sandTons) / cfg.sandTruckCapacityTons) : 0;
  const sandDeliveryCost = sandTruckCount * cfg.sandTruckCost;
  const logisticsRows: ProductionRow[] = [
    { key: "station", name: "Доставка станції (туди-назад)", unit: "об'єкт", qty: 1, price: cfg.stationDeliveryCost, sum: cfg.stationDeliveryCost },
    { key: "sand", name: `Доставка піску (КамАЗ до ${cfg.sandTruckCapacityTons} т)`, unit: "рейс", qty: sandTruckCount, price: cfg.sandTruckCost, sum: sandDeliveryCost },
    { key: "cement", name: "Доставка цементу", unit: "об'єкт", qty: 1, price: cfg.cementDeliveryCost, sum: cfg.cementDeliveryCost },
  ];
  const logisticsTotal = logisticsRows.reduce((a, l) => a + l.sum, 0);

  const productionCost = materialsTotal + laborTotal + logisticsTotal;
  const productionCostPerM2 = areaM2 > 0 ? productionCost / areaM2 : 0;

  const marginPercent = Math.min(95, Math.max(0, input.marginPercent));
  const sellingPrice = marginPercent > 0 ? productionCost / (1 - marginPercent / 100) : productionCost;
  const sellingPricePerM2 = areaM2 > 0 ? sellingPrice / areaM2 : 0;
  const grossProfit = sellingPrice - productionCost;

  return {
    areaM2, thicknessCm, perimeterM, screedVolumeM3, scaleFactor,
    screedGrade: input.screedGrade, cementGrade: input.cementGrade,
    strengthMPa: recipe.strengthMPa, hasMesh: input.hasMesh, hasSlope: input.hasSlope,
    sandTons, cementBagsRaw, cementBags, cementKg, fiberPacksRaw, fiberPacks, fiberKg,
    plasticizerLiters, plasticizerLitersPurchase, filmM2, damperM, dieselLiters,
    materialRows, materialsTotal,
    baseLaborCost, cementUnloadingCost, meshLaborCost, slopeLaborCost,
    extraThicknessCm, extraThicknessLaborCost, laborRows, laborTotal,
    stationDeliveryCost: cfg.stationDeliveryCost, sandTruckCount, sandDeliveryCost,
    cementDeliveryCost: cfg.cementDeliveryCost, logisticsRows, logisticsTotal,
    productionCost, productionCostPerM2,
    marginPercent, sellingPrice, sellingPricePerM2, grossProfit,
    warnings,
  };
}

export interface GradeComparisonRow {
  grade: ScreedGrade;
  volumeM3: number;
  sandTons: number;
  cementBags: number;
  fiberPacks: number;
  plasticizerLiters: number;
  productionCost: number;
  costPerM2: number;
  deltaPerM2: number; // різниця до попередньої марки
}

export function compareGrades(
  input: Omit<ProductionInput, "screedGrade">,
  cfg: ScreedProductionConfig = DEFAULT_SCREED_PRODUCTION_CONFIG,
): GradeComparisonRow[] {
  let prev: number | null = null;
  return SCREED_GRADE_LIST.map((grade) => {
    const r = calculateScreedProduction({ ...input, screedGrade: grade }, cfg);
    const costPerM2 = r.productionCostPerM2;
    const row: GradeComparisonRow = {
      grade, volumeM3: r.screedVolumeM3, sandTons: r.sandTons, cementBags: r.cementBags,
      fiberPacks: r.fiberPacks, plasticizerLiters: r.plasticizerLiters,
      productionCost: r.productionCost, costPerM2,
      deltaPerM2: prev === null ? 0 : costPerM2 - prev,
    };
    prev = costPerM2;
    return row;
  });
}

/** Динамічна назва основної позиції кошторису. */
export function screedPositionName(r: Pick<ProductionResult, "screedGrade" | "thicknessCm" | "hasSlope" | "hasMesh">): string {
  const mm = Math.round(r.thicknessCm * 10);
  let name = `Напівсуха машинна стяжка TERZI ${GRADE_LABEL[r.screedGrade]}, середній шар ${mm} мм`;
  if (r.hasSlope) name += ", з розуклонкою";
  if (r.hasMesh) name += ", з армувальною сіткою";
  return name;
}

export const SCREED_GRADE_DISCLAIMER =
  "Марка М100–М300 є розрахунковим продуктовим класом TERZI. Фактична міцність готової стяжки залежить від характеристик цементу і піску, водоцементного відношення, вологості заповнювача, дозування добавок, якості ущільнення та умов тверднення. Для документального підтвердження фактичної міцності необхідний лабораторний контроль зразків.";
