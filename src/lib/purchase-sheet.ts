/**
 * Закупівельний лист із рядків кошторису.
 * Детермінований: жодних перерахунків — тільки перенесення готових рядків
 * Calculation Core у табличний вигляд для постачальника.
 */
import type { EstimateLineLike } from "@/lib/estimate-line";

export interface PurchaseRow {
  name: string;
  /** Розрахункова витрата */
  qty: number;
  unit: string;
  /** Рекомендована закупівля з урахуванням фасовки (якщо відома) */
  purchaseQty: number | null;
  purchaseUnit: string | null;
  /** Ціна закупки за одиницю — тільки для внутрішнього листа */
  costPerUnit: number | null;
  cost: number | null;
  note: string | null;
}

export interface PurchaseSheetData {
  title: string;
  estimateNumber: string | null;
  rows: PurchaseRow[];
  total: number | null;
}

export function buildPurchaseSheet(
  lines: EstimateLineLike[],
  opts: { isInternal: boolean; estimateNumber?: string | null; title?: string },
): PurchaseSheetData {
  const materials = lines.filter((l) => l.block === "materials");
  const rows: PurchaseRow[] = materials.map((l) => ({
    name: l.name,
    qty: l.qty,
    unit: l.unit,
    purchaseQty: l.purchaseQty ?? null,
    purchaseUnit: l.purchaseQty != null ? l.purchaseUnit ?? l.unit : null,
    costPerUnit: opts.isInternal ? l.costPerUnit : null,
    cost: opts.isInternal ? l.cost : null,
    note: l.note ?? null,
  }));
  return {
    title: opts.title ?? "Закупівельний лист",
    estimateNumber: opts.estimateNumber ?? null,
    rows,
    total: opts.isInternal ? rows.reduce((s, r) => s + (r.cost ?? 0), 0) : null,
  };
}

const num = (v: number, d = 2) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

/** Текст для месенджера / листа постачальнику. */
export function purchaseSheetText(data: PurchaseSheetData): string {
  const head = [data.title, data.estimateNumber ? `Кошторис: ${data.estimateNumber}` : null]
    .filter(Boolean)
    .join(" · ");
  const body = data.rows.map((r, i) => {
    const want = r.purchaseQty != null ? `${num(r.purchaseQty)} ${r.purchaseUnit}` : `${num(r.qty)} ${r.unit}`;
    const money = r.cost != null ? ` — ${num(r.cost)} грн` : "";
    return `${i + 1}. ${r.name}: ${want}${money}`;
  });
  const foot = data.total != null ? `\nРазом: ${num(data.total)} грн` : "";
  return `${head}\n\n${body.join("\n")}${foot}`;
}

/** Матриця для XLSX-експорту (перший рядок — заголовки). */
export function purchaseSheetMatrix(data: PurchaseSheetData): (string | number | null)[][] {
  const internal = data.total != null;
  const header = ["№", "Позиція", "Розрахунок", "Од.", "До закупівлі", "Од. закупівлі"];
  if (internal) header.push("Ціна закупки, грн", "Сума, грн");
  header.push("Примітка");

  const rows: (string | number | null)[][] = data.rows.map((r, i) => {
    const line: (string | number | null)[] = [
      i + 1,
      r.name,
      r.qty,
      r.unit,
      r.purchaseQty,
      r.purchaseUnit,
    ];
    if (internal) line.push(r.costPerUnit, r.cost);
    line.push(r.note);
    return line;
  });

  if (internal) {
    const pad = new Array(header.length - 3).fill(null);
    rows.push([...pad, "Разом", data.total, null]);
  }
  return [header, ...rows];
}

export async function downloadPurchaseSheetXlsx(data: PurchaseSheetData, fileName?: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(purchaseSheetMatrix(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Закупівля");
  const name = fileName ?? `zakupivlya_${data.estimateNumber ?? new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
