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
