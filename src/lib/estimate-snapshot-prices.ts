/**
 * Відтворення збереженого кошторису за його знімком.
 *
 * Збережений кошторис не перераховується за поточним довідником: ціни, джерела
 * цін і версія прайсу беруться зі знімка (`calculation_json`), який був
 * зафіксований у момент збереження. Якщо знімка немає (новий розрахунок або
 * історичний запис без знімка) — використовуються живі ціни довідника.
 */
import type { EstimateSnapshotLike } from "./useEstimateDraft";

/** Ціни для прев'ю: знімок перекриває живий довідник блок за блоком. */
export function snapshotPrices<T extends Record<string, unknown>>(
  live: T,
  snapshot: EstimateSnapshotLike | null | undefined,
): T {
  const snap = snapshot?.prices;
  if (!snap || typeof snap !== "object") return live;
  return { ...live, ...snap } as T;
}

/** Версія прайсу: зі знімка, якщо він є. */
export function snapshotPriceBookVersion(
  live: number | null | undefined,
  snapshot: EstimateSnapshotLike | null | undefined,
): number | null | undefined {
  const v = snapshot?.priceBookVersion;
  return snapshot && (typeof v === "number" || v === null) ? v : live;
}

/** Джерела цін (для перевірки нульових позицій): зі знімка, якщо він є. */
export function snapshotPriceSources(
  live: Record<string, string>,
  snapshot: EstimateSnapshotLike | null | undefined,
): Record<string, string> {
  const s = snapshot?.priceSources;
  return s && typeof s === "object" && Object.keys(s).length ? { ...live, ...s } : live;
}
