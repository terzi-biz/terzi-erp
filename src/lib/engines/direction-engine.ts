/**
 * Універсальний детермінований engine для напрямів TERZI.
 *
 * Вхід: manifest напряму (з БД) + значення inputs.
 * Вихід: EstimateResult з окремими блоками materials/works/logistics/additional,
 *        clientTotal / internalCost, маржинальність, попередження.
 *
 * НЕ використовує LLM. Всі формули з БД виконуються safe DSL (formula-eval).
 */
import { evalFormula, type Scope } from "./formula-eval";

export const ENGINE_VERSION = "v1.0.0-pvc";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface DirectionManifest {
  direction: { id: string; name: string; category: string };
  inputs: Array<{
    field_key: string;
    label: string;
    type: string;
    unit?: string | null;
    required: boolean;
    default_value: JsonValue;
    sort_order: number;
    help_text?: string | null;
  }>;
  materials: Array<CatalogItem>;
  works: Array<CatalogItem>;
  logistics: Array<CatalogItem>;
  additional: Array<CatalogItem>;
  coefficients: Array<{ coef_key: string; value: number; coef_group: string; description?: string | null }>;
  sections: Array<{ section_key: string; section_name: string; sort_order: number; client_visible: boolean; internal_visible: boolean }>;
  formulas: Array<{ formula_key: string; expression: string; output_unit?: string | null; description?: string | null }>;
}

export interface CatalogItem {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  cost_price: number;
  sale_coef_key: string | null;
  quantity_formula?: string | null;
  consumption_formula?: string | null;
  sort_order: number;
  is_optional?: boolean;
  is_client_visible?: boolean;
  category?: string | null;
  section?: string | null;
  supplier?: string | null;
  source_ref?: string | null;
}

export interface EstimateLine {
  block: "materials" | "works" | "logistics" | "additional";
  code: string | null;
  name: string;
  unit: string;
  qty: number;
  costPerUnit: number;
  cost: number;
  saleCoef: number;
  pricePerUnit: number;
  sum: number;
  clientVisible: boolean;
}

export interface EstimateResult {
  directionId: string;
  engineVersion: string;
  lines: EstimateLine[];
  totals: {
    materialsCost: number; materialsSale: number;
    worksCost: number; worksSale: number;
    logisticsCost: number; logisticsSale: number;
    additionalCost: number; additionalSale: number;
    reserveAmount: number;
    subtotalCost: number;
    subtotalSale: number;
    totalCost: number;
    totalClient: number;
    grossProfit: number;
    marginPercent: number;
    pricePerM2: number;
  };
  warnings: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function buildScope(manifest: DirectionManifest, inputs: Record<string, number>): Scope {
  const coef: Record<string, number> = {};
  for (const c of manifest.coefficients) coef[c.coef_key] = Number(c.value);
  // fill defaults for missing inputs from field defaults
  const fullInputs: Record<string, number> = {};
  for (const f of manifest.inputs) {
    const dv = f.default_value;
    const parsed = typeof dv === "string" ? Number(dv) : typeof dv === "number" ? dv : 0;
    fullInputs[f.field_key] = Number.isFinite(parsed) ? parsed : 0;
  }
  for (const [k, v] of Object.entries(inputs)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) fullInputs[k] = n;
  }
  return { inputs: fullInputs, coef };
}

function makeLine(
  item: CatalogItem,
  block: EstimateLine["block"],
  scope: Scope,
): EstimateLine {
  const formula = item.quantity_formula ?? item.consumption_formula ?? null;
  const qty = round2(evalFormula(formula, scope));
  const cost = round2(qty * Number(item.cost_price));
  const saleCoef = item.sale_coef_key ? (scope.coef[item.sale_coef_key] ?? 1) : 1;
  const pricePerUnit = round2(Number(item.cost_price) * saleCoef);
  const sum = round2(qty * pricePerUnit);
  return {
    block,
    code: item.code,
    name: item.name,
    unit: item.unit,
    qty,
    costPerUnit: Number(item.cost_price),
    cost,
    saleCoef,
    pricePerUnit,
    sum,
    clientVisible: item.is_client_visible !== false,
  };
}

export function calculate(manifest: DirectionManifest, inputs: Record<string, number>): EstimateResult {
  const scope = buildScope(manifest, inputs);
  const warnings: string[] = [];
  const lines: EstimateLine[] = [];

  for (const it of manifest.materials) lines.push(makeLine(it, "materials", scope));
  for (const it of manifest.works) lines.push(makeLine(it, "works", scope));
  for (const it of manifest.logistics) lines.push(makeLine(it, "logistics", scope));
  for (const it of manifest.additional) lines.push(makeLine(it, "additional", scope));

  const sumBy = (block: EstimateLine["block"], key: "cost" | "sum") =>
    round2(lines.filter((l) => l.block === block).reduce((s, l) => s + l[key], 0));

  const materialsCost = sumBy("materials", "cost");
  const materialsSale = sumBy("materials", "sum");
  const worksCost = sumBy("works", "cost");
  const worksSale = sumBy("works", "sum");
  const logisticsCost = sumBy("logistics", "cost");
  const logisticsSale = sumBy("logistics", "sum");
  const additionalCost = sumBy("additional", "cost");
  const additionalSale = sumBy("additional", "sum");

  const subtotalSale = round2(materialsSale + worksSale + logisticsSale + additionalSale);
  const subtotalCost = round2(materialsCost + worksCost + logisticsCost + additionalCost);

  const reserveCoef = scope.coef["K_reserve"] ?? 0;
  const reserveAmount = round2(subtotalSale * reserveCoef);
  const totalClient = round2(subtotalSale + reserveAmount);
  const totalCost = subtotalCost;
  const grossProfit = round2(totalClient - totalCost);
  const marginPercent = totalClient > 0 ? round2((grossProfit / totalClient) * 100) : 0;
  const area = scope.inputs["area_m2"] ?? 0;
  const pricePerM2 = area > 0 ? round2(totalClient / area) : 0;

  if (marginPercent < 20) warnings.push(`Низька маржа: ${marginPercent}%`);
  if (totalClient <= 0) warnings.push("Клієнтська сума = 0 — перевірте вводні дані");

  return {
    directionId: manifest.direction.id,
    engineVersion: ENGINE_VERSION,
    lines,
    totals: {
      materialsCost, materialsSale, worksCost, worksSale,
      logisticsCost, logisticsSale, additionalCost, additionalSale,
      reserveAmount, subtotalCost, subtotalSale,
      totalCost, totalClient, grossProfit, marginPercent, pricePerM2,
    },
    warnings,
  };
}
