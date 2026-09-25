/** Детермінована математика складу. Жодних звернень до БД. */

export type BalanceRow = { item_id: string; warehouse_id: string; qty: number; reserved_qty: number };
export type DocLine = { qty: number; price: number };

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Вільний залишок = фактичний мінус резерв (не менше нуля). */
export function availableQty(row: { qty?: number | null; reserved_qty?: number | null }): number {
  return round3(Math.max(0, (Number(row.qty) || 0) - (Number(row.reserved_qty) || 0)));
}

/** Сума документа = Σ кількість × ціна. */
export function documentTotal(lines: DocLine[]): number {
  return round2(lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
}

/** Скільки треба докупити під потребу з урахуванням вільного залишку. */
export function deficit(required: number, available: number): number {
  return round3(Math.max(0, (Number(required) || 0) - (Number(available) || 0)));
}

/** Середньозважена собівартість після приходу. */
export function weightedAvgCost(prevQty: number, prevCost: number, inQty: number, inPrice: number): number {
  const total = (Number(prevQty) || 0) + (Number(inQty) || 0);
  if (total <= 0) return round2(inPrice);
  return round2(((Number(prevQty) || 0) * (Number(prevCost) || 0) + (Number(inQty) || 0) * (Number(inPrice) || 0)) / total);
}

/** Позиція нижче мінімального запасу. */
export function isBelowMin(qty: number, minQty: number): boolean {
  return (Number(minQty) || 0) > 0 && (Number(qty) || 0) < (Number(minQty) || 0);
}

export const STOCK_DOC_LABELS: Record<string, string> = {
  in: "Прихід",
  out: "Видача на замовлення",
  transfer: "Переміщення",
  writeoff: "Списання",
  return: "Повернення",
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  posted: "Проведено",
  cancelled: "Скасовано",
};

export const WAREHOUSE_KINDS: Record<string, string> = {
  main: "Основний склад",
  vehicle: "Авто / бригада",
  order: "Склад на замовленні",
};

/** Типи документів приходу (inbound). */
export const RECEIPT_DOC_TYPES = ["in", "return"] as const;
/** Типи документів видачі (outbound). */
export const ISSUE_DOC_TYPES = ["out", "writeoff"] as const;

export type ReceiptDocType = (typeof RECEIPT_DOC_TYPES)[number];
export type IssueDocType = (typeof ISSUE_DOC_TYPES)[number];

export function isReceiptDocType(t: string): boolean {
  return (RECEIPT_DOC_TYPES as readonly string[]).includes(t);
}
export function isIssueDocType(t: string): boolean {
  return (ISSUE_DOC_TYPES as readonly string[]).includes(t);
}

/** Календарний місяць YYYY-MM з дати документа (вже бізнес-дата). */
export function docMonthKey(docDate: string | null | undefined): string {
  const s = String(docDate ?? "").slice(0, 10);
  return s.length >= 7 ? s.slice(0, 7) : "";
}

/** Рядок місячного звіту складу. */
export type MonthlyStockRow = {
  month: string; // YYYY-MM
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  netQty: number;
  netValue: number;
  docsIn: number;
  docsOut: number;
};

/** Агрегація проведених документів за календарним місяцем (Europe/Kyiv date string). */
export function aggregateMonthlyStock(
  docs: Array<{
    status?: string | null;
    doc_type?: string | null;
    doc_date?: string | null;
    total_cost?: number | null;
    lines?: Array<{ qty?: number | null; price?: number | null }> | null;
  }>,
): MonthlyStockRow[] {
  const map = new Map<string, MonthlyStockRow>();
  for (const d of docs) {
    if (d.status !== "posted") continue;
    const month = docMonthKey(d.doc_date);
    if (!month) continue;
    const type = String(d.doc_type ?? "");
    const qty = (d.lines ?? []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const value = d.total_cost != null ? Number(d.total_cost) : documentTotal(d.lines ?? []);
    const row = map.get(month) ?? {
      month, inQty: 0, inValue: 0, outQty: 0, outValue: 0, netQty: 0, netValue: 0, docsIn: 0, docsOut: 0,
    };
    if (isReceiptDocType(type)) {
      row.inQty = round3(row.inQty + qty);
      row.inValue = round2(row.inValue + value);
      row.docsIn += 1;
    } else if (isIssueDocType(type)) {
      row.outQty = round3(row.outQty + qty);
      row.outValue = round2(row.outValue + value);
      row.docsOut += 1;
    } else {
      continue; // transfer не входить у in/out звіт
    }
    row.netQty = round3(row.inQty - row.outQty);
    row.netValue = round2(row.inValue - row.outValue);
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}
