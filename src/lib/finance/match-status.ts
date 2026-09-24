/**
 * Статуси зв'язку операції з Клієнтом/Замовленням.
 * `ignored` — «Не потребує зв'язку»: свідомо виключено з беклогу зіставлення,
 * НЕ видалено і НЕ виключено з фінансових підсумків (cash flow / P&L за категорією).
 */
export const MATCH_STATUS_LABEL: Record<string, string> = {
  matched: "Пов'язані",
  unmatched: "Без зв'язку",
  needs_review: "На перевірку",
  ignored: "Не потребує зв'язку",
};

/** Авто-зіставлення не чіпає ручні зв'язки і свідомо проігноровані операції. */
export function isProtectedFromAutoMatch(t: { id: string; match_status?: string | null }, manualIds: Set<string>): boolean {
  return manualIds.has(t.id) || t.match_status === "ignored";
}

/** Беклог зіставлення: без переказів і без `ignored`. Фінансові підсумки рахуються окремо по всіх рядках. */
export function splitReconciliationBacklog<T extends { kind?: string | null; match_status?: string | null }>(rows: T[]) {
  const nonTransfer = rows.filter((t) => t.kind !== "transfer");
  const ignored = nonTransfer.filter((t) => t.match_status === "ignored");
  const backlog = nonTransfer.filter((t) => t.match_status !== "ignored");
  return { nonTransfer, ignored, backlog };
}
