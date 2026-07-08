/**
 * Універсальний рушій розрахунку для no-code напрямків.
 * На вхід: визначення напрямку (fields/materials/works/logistics/coefficients) + значення полів.
 * На вихід: CalcResult у форматі, сумісному з UI кошторису.
 */
import { evalFormula, type FormulaContext } from "./formula-eval";

export interface DirectionDefField {
  field_key: string;
  label: string;
  type: string; // number | select | checkbox | text
  unit?: string | null;
  default_value?: unknown;
  enum_values?: unknown;
  help_text?: string | null;
  sort_order: number;
}

export interface DirectionDefItem {
  code?: string | null;
  name: string;
  unit: string;
  cost_price: number;
  sale_coef_key?: string | null; // ключ коеф. націнки або множник відносно cost
  consumption_formula?: string | null; // для матеріалів (qty)
  quantity_formula?: string | null; // для робіт / логістики
  is_optional?: boolean;
  is_client_visible?: boolean;
  sort_order: number;
}

export interface DirectionDefinition {
  id: string;
  name: string;
  category: string;
  fields: DirectionDefField[];
  materials: DirectionDefItem[];
  works: DirectionDefItem[];
  logistics: DirectionDefItem[];
  coefficients: { coef_group: string; coef_key: string; value: number }[];
}

export interface Line {
  block: "materials" | "works" | "logistics";
  key: string;
  name: string;
  unit: string;
  qty: number;
  costPerUnit: number;
  pricePerUnit: number;
  cost: number;
  sum: number;
  showToClient: boolean;
}

export interface DirectionCalcResult {
  lines: Line[];
  materialsSell: number;
  worksSell: number;
  logisticsSell: number;
  totalSell: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  ctx: FormulaContext;
  warnings: string[];
}

const DEFAULT_MARKUP = 1.5;

function priceOf(item: DirectionDefItem, coeffs: Record<string, number>): number {
  const key = item.sale_coef_key?.trim();
  if (!key) return +(item.cost_price * DEFAULT_MARKUP);
  // допускаємо або числовий множник ("1.5"), або посилання на coef
  const asNum = Number(key);
  if (Number.isFinite(asNum) && asNum > 0) return +(item.cost_price * asNum);
  const c = coeffs[key];
  if (c && c > 0) return +(item.cost_price * c);
  return +(item.cost_price * DEFAULT_MARKUP);
}

export function evaluateDirection(
  def: DirectionDefinition,
  inputs: Record<string, unknown>,
): DirectionCalcResult {
  const warnings: string[] = [];
  const coeffs: Record<string, number> = {};
  for (const c of def.coefficients) coeffs[c.coef_key] = Number(c.value);

  const ctx: FormulaContext = {
    ...inputs,
    inputs,
    coeffs,
  };

  const lines: Line[] = [];

  const pushItem = (
    block: "materials" | "works" | "logistics",
    item: DirectionDefItem,
    formula: string | null | undefined,
  ) => {
    const qty = formula ? evalFormula(formula, ctx) : 0;
    if (qty <= 0) return;
    const costPer = Number(item.cost_price);
    const pricePer = priceOf(item, coeffs);
    lines.push({
      block,
      key: item.code || item.name,
      name: item.name,
      unit: item.unit,
      qty: +qty.toFixed(3),
      costPerUnit: costPer,
      pricePerUnit: +pricePer.toFixed(2),
      cost: +(qty * costPer).toFixed(2),
      sum: +(qty * pricePer).toFixed(2),
      showToClient: item.is_client_visible !== false,
    });
  };

  for (const m of def.materials) pushItem("materials", m, m.consumption_formula);
  for (const w of def.works) pushItem("works", w, w.quantity_formula);
  for (const l of def.logistics) pushItem("logistics", l, l.quantity_formula);

  const sumBlock = (b: Line["block"], key: "sum" | "cost") =>
    lines.filter((l) => l.block === b).reduce((a, l) => a + l[key], 0);

  const materialsSell = sumBlock("materials", "sum");
  const worksSell = sumBlock("works", "sum");
  const logisticsSell = sumBlock("logistics", "sum");
  const totalSell = materialsSell + worksSell + logisticsSell;
  const totalCost =
    sumBlock("materials", "cost") + sumBlock("works", "cost") + sumBlock("logistics", "cost");
  const grossProfit = totalSell - totalCost;
  const marginPercent = totalSell > 0 ? (grossProfit / totalSell) * 100 : 0;

  if (lines.length === 0) warnings.push("Немає розрахованих ліній — перевірте формули або значення полів.");

  return {
    lines,
    materialsSell,
    worksSell,
    logisticsSell,
    totalSell,
    totalCost,
    grossProfit,
    marginPercent,
    ctx,
    warnings,
  };
}
