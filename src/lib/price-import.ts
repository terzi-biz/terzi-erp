/**
 * Імпорт прайсів постачальників із Excel/CSV.
 * Парсимо файл → нормалізуємо рядки → fuzzy-матч до позицій каталога.
 */
import * as XLSX from "xlsx";

export interface ParsedPriceRow {
  name: string;
  unit?: string;
  price: number;
  supplier?: string;
  sku?: string;
  raw: Record<string, unknown>;
}

export interface CatalogTarget {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  kind: "material" | "work" | "equipment" | "logistics";
}

export interface MatchedRow {
  row: ParsedPriceRow;
  targetId: string | null;   // selected catalog item id
  accept: boolean;
  score: number;             // 0..1 confidence
}

const NAME_KEYS = ["назва", "найменування", "наименование", "name", "товар", "матеріал", "позиція"];
const PRICE_KEYS = ["ціна", "цена", "price", "вартість", "вартiсть", "buy", "закупка"];
const UNIT_KEYS = ["од", "ед", "unit", "одиниця", "одиниця виміру"];
const SUPPLIER_KEYS = ["постач", "поставщик", "supplier", "бренд"];
const SKU_KEYS = ["sku", "код", "артикул"];

const norm = (s: string) =>
  s.toString().trim().toLowerCase()
    .replace(/[ёе]/g, "е").replace(/[ії]/g, "і")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const findKey = (obj: Record<string, unknown>, candidates: string[]): string | undefined => {
  const keys = Object.keys(obj);
  for (const k of keys) {
    const nk = norm(k);
    if (candidates.some((c) => nk.includes(c))) return k;
  }
  return undefined;
};

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).replace(/\s+/g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function rowsToParsed(rows: Record<string, unknown>[]): ParsedPriceRow[] {
  if (!rows.length) return [];
  const sample = rows[0];
  const nameK = findKey(sample, NAME_KEYS);
  const priceK = findKey(sample, PRICE_KEYS);
  const unitK = findKey(sample, UNIT_KEYS);
  const supK = findKey(sample, SUPPLIER_KEYS);
  const skuK = findKey(sample, SKU_KEYS);

  const out: ParsedPriceRow[] = [];
  for (const r of rows) {
    const name = nameK ? String(r[nameK] ?? "").trim() : "";
    const price = toNumber(priceK ? r[priceK] : 0);
    if (!name || price <= 0) continue;
    out.push({
      name,
      price,
      unit: unitK ? String(r[unitK] ?? "").trim() : undefined,
      supplier: supK ? String(r[supK] ?? "").trim() : undefined,
      sku: skuK ? String(r[skuK] ?? "").trim() : undefined,
      raw: r,
    });
  }
  return out;
}

export async function parsePriceFile(file: File): Promise<ParsedPriceRow[]> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buf);
    const rows = parseCsv(text);
    return rowsToParsed(rows);
  }
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsToParsed(rows);
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === "," || c === ";" || c === "\t") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); lines.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field || cur.length) { cur.push(field); lines.push(cur); }
  if (lines.length < 2) return [];
  const header = lines[0].map((h) => h.trim());
  return lines.slice(1).filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Similarity 0..1 by token overlap + substring boost. */
export function similarity(a: string, b: string): number {
  const A = norm(a); const B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const ta = new Set(A.split(" ").filter((t) => t.length > 1));
  const tb = new Set(B.split(" ").filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  const jaccard = inter / (ta.size + tb.size - inter);
  const contains = A.includes(B) || B.includes(A) ? 0.25 : 0;
  return Math.min(1, jaccard + contains);
}

export function autoMatch(rows: ParsedPriceRow[], targets: CatalogTarget[]): MatchedRow[] {
  return rows.map((row) => {
    let bestId: string | null = null; let bestScore = 0;
    for (const t of targets) {
      const s = Math.max(
        similarity(row.name, t.name),
        row.sku && t.code ? (norm(row.sku) === norm(t.code) ? 1 : 0) : 0,
      );
      if (s > bestScore) { bestScore = s; bestId = t.id; }
    }
    return { row, targetId: bestScore >= 0.35 ? bestId : null, accept: bestScore >= 0.5, score: bestScore };
  });
}
