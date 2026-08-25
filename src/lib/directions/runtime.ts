/**
 * Wave 2 — Unified Direction Runtime.
 *
 * Єдиний детермінований рушій розрахунку для всіх напрямків (стяжка, ПВХ, руберойд,
 * утеплення, демонтаж і будь-який no-code напрямок з конструктора).
 *
 * Принципи:
 *  - жодного AI, жодної випадковості: результат повністю відтворюється з
 *    (definition + inputs + pricing) і фіксованої версії рушія;
 *  - розрахункова кількість (calcQty) і рекомендована до закупки (purchaseQty)
 *    завжди окремі поля — ми ніколи не «підтягуємо» розрахунок під фасовку;
 *  - усі ціни/норми приходять з довідників (definition), в коді немає прайсів;
 *  - округлення — тільки на фінальному етапі.
 */
import { evalFormula, type FormulaContext } from "../engines/formula-eval";
import type { DirectionDefinition, DirectionDefItem } from "../engines/direction-engine";

export const DIRECTION_ENGINE_VERSION = "direction-runtime@2.0.0";

export type RuntimeBlock = "materials" | "works" | "logistics" | "services";

/** Додаткові (необов'язкові) поля елемента довідника, які підтримує рушій. */
export interface RuntimeItemExtras {
  /** Фасовка/крок закупки в одиницях позиції (рулон 10 м², профіль 2 м, мішок 25 кг…). */
  pack_size?: number | null;
  /** Одиниця закупки для відображення (рул., шт., меш.). */
  pack_unit?: string | null;
  /** Мінімальна кількість, яку має сенс включати в кошторис. */
  min_qty?: number | null;
  is_client_visible?: boolean;
}

export type RuntimeItem = DirectionDefItem & RuntimeItemExtras;

export interface DerivedFormula {
  formula_key: string;
  expression: string;
  output_unit?: string | null;
}

export interface RuntimeDefinition extends Omit<DirectionDefinition, "materials" | "works" | "logistics"> {
  materials: RuntimeItem[];
  works: RuntimeItem[];
  logistics: RuntimeItem[];
  /** Додаткові послуги (той самий формат, що і роботи). */
  services?: RuntimeItem[];
  /** Проміжні формули: доступні у виразах як derived.<key> та як <key>. */
  formulas?: DerivedFormula[];
}

/** Правила ціноутворення напрямку (з налаштувань, не з коду). */
export interface RuntimePricing {
  /** Коефіцієнти площі: {maxArea, coef}, застосовуються до робіт. */
  areaTiers?: { maxArea: number | null; coef: number }[];
  /** Поле inputs, з якого беремо площу для тарифної сітки. */
  areaField?: string;
  /** Мінімальна сума замовлення (грн, продажна). */
  minOrder?: number;
  /** Знижка клієнту, %. */
  discountPercent?: number;
  /** Надбавка (термін/доступ/складність), %. */
  surchargePercent?: number;
  /** ПДВ на матеріали, % (0 = вимкнено). */
  vatMaterialsPercent?: number;
  /** Надбавка за безготівку ФОП, %. */
  fopPercent?: number;
  /** Комісія партнера, % від продажної суми (входить у собівартість). */
  partnerCommissionPercent?: number;
  /** Мінімально допустима маржа, % — нижче цього значення видаємо попередження. */
  minMarginPercent?: number;
}

export interface RuntimeLine {
  block: RuntimeBlock;
  key: string;
  name: string;
  unit: string;
  /** Прозора розрахункова кількість (без округлення під фасовку). */
  calcQty: number;
  /** Рекомендована до закупки кількість в одиницях позиції. */
  purchaseQty: number;
  /** Рекомендована закупка в упаковках (якщо задана фасовка). */
  packs: number | null;
  packUnit: string | null;
  costPerUnit: number;
  pricePerUnit: number;
  /** Собівартість за розрахунковою кількістю. */
  cost: number;
  /** Продажна сума за розрахунковою кількістю. */
  sum: number;
  /** Собівартість закупки (для відомості закупника). */
  purchaseCost: number;
  showToClient: boolean;
  priceMissing: boolean;
}

export interface RuntimeTotals {
  materialsSell: number;
  worksSell: number;
  logisticsSell: number;
  servicesSell: number;
  subtotalSell: number;
  discount: number;
  surcharge: number;
  vatMaterials: number;
  fopFee: number;
  partnerCommission: number;
  minOrderTopUp: number;
  totalSell: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  markupPercent: number;
}

export interface RuntimeResult {
  engineVersion: string;
  lines: RuntimeLine[];
  derived: Record<string, number>;
  areaCoef: number;
  totals: RuntimeTotals;
  ctx: FormulaContext;
  warnings: string[];
  blocking: string[];
}

const DEFAULT_MARKUP = 1.5;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function priceOf(item: RuntimeItem, coeffs: Record<string, number>): number {
  const key = item.sale_coef_key?.trim();
  const cost = Number(item.cost_price) || 0;
  if (!key) return cost * DEFAULT_MARKUP;
  const asNum = Number(key);
  if (Number.isFinite(asNum) && asNum > 0) return cost * asNum;
  const c = coeffs[key];
  if (c && c > 0) return cost * c;
  return cost * DEFAULT_MARKUP;
}

export function areaCoefFor(area: number, tiers?: RuntimePricing["areaTiers"]): number {
  if (!tiers || tiers.length === 0 || !(area > 0)) return 1;
  const sorted = [...tiers].sort((a, b) => (a.maxArea ?? Infinity) - (b.maxArea ?? Infinity));
  for (const t of sorted) {
    if (t.maxArea == null || area <= t.maxArea) return Number(t.coef) || 1;
  }
  return Number(sorted[sorted.length - 1]?.coef) || 1;
}

/** Рекомендована закупка: ціла кількість упаковок, ніколи не менша за розрахунок. */
export function purchaseFor(calcQty: number, packSize?: number | null): { qty: number; packs: number | null } {
  if (!(calcQty > 0)) return { qty: 0, packs: packSize && packSize > 0 ? 0 : null };
  if (!packSize || packSize <= 0) return { qty: r3(calcQty), packs: null };
  const packs = Math.ceil(r3(calcQty) / packSize - 1e-9);
  return { qty: r3(packs * packSize), packs };
}

export function evaluateDirectionRuntime(
  def: RuntimeDefinition,
  inputs: Record<string, unknown>,
  pricing: RuntimePricing = {},
): RuntimeResult {
  const warnings: string[] = [];
  const blocking: string[] = [];

  const coeffs: Record<string, number> = {};
  for (const c of def.coefficients ?? []) coeffs[c.coef_key] = Number(c.value);

  const derived: Record<string, number> = {};
  const ctx: FormulaContext = { ...inputs, inputs, coeffs, derived };

  // Проміжні формули рахуємо послідовно — кожна бачить попередні.
  for (const f of def.formulas ?? []) {
    const v = evalFormula(f.expression, ctx);
    derived[f.formula_key] = v;
    (ctx as Record<string, unknown>)[f.formula_key] = v;
  }

  const areaField = pricing.areaField ?? "area";
  const area = Number((inputs as Record<string, unknown>)[areaField] ?? derived[areaField] ?? 0) || 0;
  const areaCoef = areaCoefFor(area, pricing.areaTiers);
  (ctx as Record<string, unknown>)["areaCoef"] = areaCoef;

  const lines: RuntimeLine[] = [];

  const pushItem = (block: RuntimeBlock, item: RuntimeItem, formula: string | null | undefined) => {
    let qty = formula ? evalFormula(formula, ctx) : 0;
    if (!(qty > 0)) return;
    const minQty = Number(item.min_qty ?? 0);
    if (minQty > 0 && qty < minQty) qty = minQty;

    const costPer = Number(item.cost_price) || 0;
    // Коефіцієнт площі впливає тільки на роботи/послуги (трудомісткість), не на матеріали.
    const tierCoef = block === "works" || block === "services" ? areaCoef : 1;
    const pricePer = priceOf(item, coeffs) * tierCoef;
    const purchase = purchaseFor(qty, item.pack_size);
    const priceMissing = costPer <= 0 || pricePer <= 0;
    if (priceMissing) {
      blocking.push(`Немає ціни для «${item.name}» (${item.code || "без коду"}) — уточніть у довіднику.`);
    }

    lines.push({
      block,
      key: item.code || item.name,
      name: item.name,
      unit: item.unit,
      calcQty: r3(qty),
      purchaseQty: purchase.qty,
      packs: purchase.packs,
      packUnit: item.pack_unit ?? null,
      costPerUnit: r2(costPer),
      pricePerUnit: r2(pricePer),
      cost: r2(qty * costPer),
      sum: r2(qty * pricePer),
      purchaseCost: r2(purchase.qty * costPer),
      showToClient: item.is_client_visible !== false,
      priceMissing,
    });
  };

  for (const m of def.materials ?? []) pushItem("materials", m, m.consumption_formula);
  for (const w of def.works ?? []) pushItem("works", w, w.quantity_formula);
  for (const l of def.logistics ?? []) pushItem("logistics", l, l.quantity_formula);
  for (const s of def.services ?? []) pushItem("services", s, s.quantity_formula);

  const sumBy = (b: RuntimeBlock, k: "sum" | "cost") =>
    r2(lines.filter((l) => l.block === b).reduce((a, l) => a + l[k], 0));

  const materialsSell = sumBy("materials", "sum");
  const worksSell = sumBy("works", "sum");
  const logisticsSell = sumBy("logistics", "sum");
  const servicesSell = sumBy("services", "sum");
  const subtotalSell = r2(materialsSell + worksSell + logisticsSell + servicesSell);

  const pct = (v?: number) => (Number.isFinite(Number(v)) ? Number(v) : 0) / 100;
  const discount = r2(subtotalSell * pct(pricing.discountPercent));
  const surcharge = r2(subtotalSell * pct(pricing.surchargePercent));
  const afterAdj = r2(subtotalSell - discount + surcharge);
  const vatMaterials = r2(materialsSell * pct(pricing.vatMaterialsPercent));
  const fopFee = r2((afterAdj + vatMaterials) * pct(pricing.fopPercent));
  let totalSell = r2(afterAdj + vatMaterials + fopFee);

  const minOrder = Number(pricing.minOrder) || 0;
  let minOrderTopUp = 0;
  if (minOrder > 0 && totalSell > 0 && totalSell < minOrder) {
    minOrderTopUp = r2(minOrder - totalSell);
    totalSell = r2(minOrder);
    warnings.push(`Застосовано мінімальне замовлення ${minOrder.toLocaleString("uk-UA")} грн (+${minOrderTopUp.toLocaleString("uk-UA")} грн).`);
  }

  const partnerCommission = r2(totalSell * pct(pricing.partnerCommissionPercent));
  const baseCost = r2(
    sumBy("materials", "cost") + sumBy("works", "cost") + sumBy("logistics", "cost") + sumBy("services", "cost"),
  );
  const totalCost = r2(baseCost + partnerCommission);
  const grossProfit = r2(totalSell - totalCost);
  const marginPercent = totalSell > 0 ? r2((grossProfit / totalSell) * 100) : 0;
  const markupPercent = totalCost > 0 ? r2((grossProfit / totalCost) * 100) : 0;

  if (lines.length === 0) warnings.push("Немає розрахованих позицій — перевірте формули та значення полів.");
  const minMargin = Number(pricing.minMarginPercent) || 0;
  if (minMargin > 0 && lines.length > 0 && marginPercent < minMargin) {
    warnings.push(`Маржа ${marginPercent.toFixed(1)}% нижче мінімально допустимої ${minMargin}%.`);
  }

  return {
    engineVersion: DIRECTION_ENGINE_VERSION,
    lines,
    derived,
    areaCoef,
    totals: {
      materialsSell, worksSell, logisticsSell, servicesSell, subtotalSell,
      discount, surcharge, vatMaterials, fopFee, partnerCommission, minOrderTopUp,
      totalSell, totalCost, grossProfit, marginPercent, markupPercent,
    },
    ctx,
    warnings,
    blocking: [...new Set(blocking)],
  };
}
