#!/usr/bin/env node
/**
 * TERZI: sync roofing prices/coefficients from the Markdown knowledge base
 * into a typed TS module used by src/lib/roofing-calc.ts.
 *
 * Source of truth: .lovable/knowledge/roofing-calculator.md
 * Output:          src/lib/roofing-knowledge.generated.ts
 *
 * Run: `bun run sync:roofing` (or `node scripts/sync-roofing-knowledge.mjs`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, ".lovable/knowledge/roofing-calculator.md");
const OUT = resolve(ROOT, "src/lib/roofing-knowledge.generated.ts");

const md = readFileSync(SRC, "utf8");

/** Extract a Markdown table under a `## <heading>` section as array of row objects keyed by first header row. */
function parseSection(heading) {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = md.match(re);
  if (!m) throw new Error(`Section not found: ${heading}`);
  const lines = m[1].split("\n").filter((l) => l.trim().startsWith("|"));
  const rows = lines.map((l) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()),
  );
  // rows[0] = column ids (c0..cN), rows[1] = separators (:---), rows[2] = real headers, rows[3..] = data
  const headers = rows[2];
  return rows.slice(3).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

const toNum = (v) => {
  if (v == null) return NaN;
  const s = String(v).replace(/\s+/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

// ---------- Materials ----------
const materialRows = parseSection("5_Прайс_материалы");
const materials = materialRows
  .filter((r) => r["Наименование"] && toNum(r["Цена"]) > 0)
  .map((r) => ({
    category: r["Категория"] || "",
    name: r["Наименование"],
    unit: r["Ед."] || "",
    price: toNum(r["Цена"]),
    rollM2: toNum(r["Площадь рулона/упаковки"]),
    purpose: r["Назначение"] || "",
    weightKgPerM2: toNum(r["Вес кг/м²"]),
    source: r["Источник"] || "",
  }));

// ---------- Works ----------
const workRows = parseSection("6_Прайс_работы");
const works = workRows
  .filter((r) => r["Наименование работ"] && toNum(r["Базовая цена"]) > 0)
  .map((r) => ({
    name: r["Наименование работ"],
    unit: r["Ед."] || "",
    basePrice: toNum(r["Базовая цена"]),
    multiplierLogic: r["Логика множителя"] || "",
    fixedMultiplier: toNum(r["Множитель фиксированный"]) || 0,
    source: r["Источник"] || "",
  }));

// ---------- Coefficients (from 1_Ввод_замер: Расходные коэффициенты column pair) ----------
function extractCoeff(label) {
  // Rows are `| left | ... | right label | value | unit |`. Scan every table line.
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  for (const l of lines) {
    const cells = l.split("|").map((c) => c.trim());
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === label) {
        const v = toNum(cells[i + 1]);
        if (Number.isFinite(v)) return v;
      }
    }
  }
  return NaN;
}

const kbCoeffs = {
  primerLPerM2:      extractCoeff("Расход праймера"),
  gasKgPerLayerM2:   extractCoeff("Расход газа"),
  gasCylinderKg:     extractCoeff("Баллон/емкость газа"),
  gasPricePerKg:     extractCoeff("Цена газа"),
  mastiKgPerNode:    extractCoeff("Расход мастики на узлах"),
  mastiZoneWidthM:   extractCoeff("Ширина зоны мастики по примыканиям"),
  overlapPercent:    extractCoeff("Коэф. нахлеста рулона"),
  wastePercent:      extractCoeff("Коэф. сложности и отходов"),
  parapetHeightM:    extractCoeff("Высота заведения на парапет"),
  companyMarkup:     extractCoeff("Резерв/наценка компании"),
  fopRate:           extractCoeff("ФОП / комиссия оплаты"),
};

// ---------- Canonical engine keys ----------
// Map MD-derived data into the price/work keys used by src/lib/roofing-calc.ts.
const px = (buy, sellMult = 1.5) => ({ buy, sell: +(buy * sellMult).toFixed(2) });

const findMat = (predicate) => materials.find(predicate);
const findWork = (namePart) =>
  works.find((w) => w.name.toLowerCase().includes(namePart.toLowerCase()));

const primer  = findMat((m) => /Праймер/i.test(m.name));
const mastic  = findMat((m) => /Мастика.*10 кг/i.test(m.name)) || findMat((m) => /Мастика/i.test(m.name));
const funnel  = findMat((m) => /Воронка.*100/i.test(m.name));
const aerator = findMat((m) => /Вентилятор.*75/i.test(m.name)) || findMat((m) => /Вентилятор/i.test(m.name));

/** Engine `MaterialPrice` overrides derived from the MD (buy = supplier price). */
const priceOverrides = {};
if (primer && primer.price > 0)
  priceOverrides.primer = px(+(primer.price / 20).toFixed(2)); // per L (ведро 20 л)
if (mastic && mastic.price > 0)
  priceOverrides.opaika_mastic = px(+(mastic.price / (mastic.rollM2 || 10)).toFixed(2)); // per kg
if (funnel && funnel.price > 0)
  priceOverrides.funnel = px(funnel.price);
if (aerator && aerator.price > 0)
  priceOverrides.aerator = px(aerator.price);
if (Number.isFinite(kbCoeffs.gasPricePerKg) && Number.isFinite(kbCoeffs.gasCylinderKg)) {
  priceOverrides.gas = px(+(kbCoeffs.gasPricePerKg * kbCoeffs.gasCylinderKg).toFixed(2));
}

/** Engine work-price overrides (client-facing sell prices, грн/од.). */
const workOverrides = {};
const wPrimer  = findWork("Нанесение праймера");
const wFunnel  = findWork("воронки");
const wAerator = findWork("аэратора");
const wRubero  = findWork("Монтаж рубероида по площади");
const wPar     = findWork("Монтаж рубероида на примыканиях");
const wGaltel  = findWork("Галтели");
if (wPrimer)  workOverrides.primer_apply = wPrimer.basePrice;
if (wFunnel)  workOverrides.funnel = wFunnel.basePrice;
if (wAerator) workOverrides.aerator = wAerator.basePrice;
if (wRubero)  workOverrides.rubemast_lay = wRubero.basePrice;
if (wPar)     workOverrides.parapet = wPar.basePrice;
if (wGaltel)  workOverrides.galtel = wGaltel.basePrice;

/** Engine `RoofingCoefficients` overrides. */
const coeffOverrides = {};
if (Number.isFinite(kbCoeffs.primerLPerM2))    coeffOverrides.rubemastPrimerLPerM2   = kbCoeffs.primerLPerM2;
if (Number.isFinite(kbCoeffs.gasKgPerLayerM2)) coeffOverrides.rubemastGasKgPerLayerM2 = kbCoeffs.gasKgPerLayerM2;
if (Number.isFinite(kbCoeffs.gasCylinderKg))   coeffOverrides.rubemastGasCylinderKg   = kbCoeffs.gasCylinderKg;
if (Number.isFinite(kbCoeffs.overlapPercent))  coeffOverrides.rubemastOverlapCoef     = +(1 + kbCoeffs.overlapPercent).toFixed(3);
if (Number.isFinite(kbCoeffs.parapetHeightM))  coeffOverrides.parapetHeightCmDefault  = Math.round(kbCoeffs.parapetHeightM * 100);
if (Number.isFinite(kbCoeffs.fopRate))         coeffOverrides.fopRate                 = kbCoeffs.fopRate;

// ---------- Emit ----------
const banner = `// AUTO-GENERATED by scripts/sync-roofing-knowledge.mjs on ${new Date().toISOString()}
// Source of truth: .lovable/knowledge/roofing-calculator.md
// Do NOT edit by hand — run \`bun run sync:roofing\` to regenerate.
`;

const body = `${banner}
import type { MaterialPrice } from "./screed-calc";

export interface RoofingKbMaterial {
  category: string; name: string; unit: string; price: number;
  rollM2?: number; purpose?: string; weightKgPerM2?: number; source?: string;
}
export interface RoofingKbWork {
  name: string; unit: string; basePrice: number;
  multiplierLogic: string; fixedMultiplier: number; source?: string;
}

/** Full material price book parsed from MD (5_Прайс_материалы). */
export const ROOFING_KB_MATERIALS: RoofingKbMaterial[] = ${JSON.stringify(materials, null, 2)};

/** Full work price book parsed from MD (6_Прайс_работы). */
export const ROOFING_KB_WORKS: RoofingKbWork[] = ${JSON.stringify(works, null, 2)};

/** Raw coefficients pulled from MD 1_Ввод_замер (Расходные коэффициенты). */
export const ROOFING_KB_RAW_COEFFS = ${JSON.stringify(kbCoeffs, null, 2)} as const;

/** Overrides applied on top of DEFAULT_ROOFING_PRICES (buy = supplier price, sell = buy × 1.5). */
export const ROOFING_KB_PRICE_OVERRIDES: Record<string, MaterialPrice> = ${JSON.stringify(priceOverrides, null, 2)};

/** Overrides applied on top of DEFAULT_ROOFING_WORKS. */
export const ROOFING_KB_WORK_OVERRIDES: Record<string, number> = ${JSON.stringify(workOverrides, null, 2)};

/** Overrides applied on top of DEFAULT_ROOFING_COEFFS. */
export const ROOFING_KB_COEFF_OVERRIDES = ${JSON.stringify(coeffOverrides, null, 2)} as const;

export const ROOFING_KB_META = {
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  source: ".lovable/knowledge/roofing-calculator.md",
  materialsCount: ${materials.length},
  worksCount: ${works.length},
};
`;

writeFileSync(OUT, body, "utf8");
console.log(`✓ Wrote ${OUT}`);
console.log(`  materials: ${materials.length}, works: ${works.length}`);
console.log(`  price overrides: ${Object.keys(priceOverrides).join(", ") || "(none)"}`);
console.log(`  work overrides:  ${Object.keys(workOverrides).join(", ") || "(none)"}`);
console.log(`  coeff overrides: ${Object.keys(coeffOverrides).join(", ") || "(none)"}`);
