/**
 * Контроль цілісності прайсу для калькуляторів.
 *
 * Правило (аудит, П4): якщо коду позиції немає в довіднику і немає в дефолтах
 * калькулятора, ціна мовчки стає 0. Суму ми НЕ змінюємо автоматично — але
 * показуємо блокуюче попередження і забороняємо зберігати/експортувати
 * клієнтське КП, поки активна позиція має нульову ціну через відсутній код.
 */

export type PriceSource = "catalog" | "default" | "missing";

export interface PriceLineLike {
  key: string;
  block: string;
  name: string;
  qty: number;
  pricePerUnit: number;
  sum: number;
}

export interface PriceIssue {
  key: string;
  block: string;
  name: string;
  source: PriceSource;
}

/**
 * Джерело ціни для кожного коду: довідник (БД), дефолт калькулятора або нічого.
 * `catalogCodes` — коди, реально отримані з `catalog_items`.
 * `defaultCodes` — коди, для яких у калькуляторі є дефолтна ціна > 0.
 */
export function buildPriceSources(
  catalogCodes: Iterable<string>,
  defaultCodes: Iterable<string>,
): Record<string, PriceSource> {
  const out: Record<string, PriceSource> = {};
  for (const c of defaultCodes) out[c] = "default";
  for (const c of catalogCodes) out[c] = "catalog";
  return out;
}

/**
 * Позиції з ненульовою кількістю і нульовою ціною продажу.
 * Саме такі рядки означають «код не знайдено ні в довіднику, ні в дефолтах».
 */
export function findPriceIssues(
  lines: readonly PriceLineLike[],
  sources: Record<string, PriceSource> = {},
): PriceIssue[] {
  const out: PriceIssue[] = [];
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    if (l.pricePerUnit > 0 || l.sum > 0) continue;
    out.push({
      key: l.key,
      block: l.block,
      name: l.name,
      source: sources[l.key] ?? "missing",
    });
  }
  return out;
}

export const SOURCE_LABEL: Record<PriceSource, string> = {
  catalog: "довідник (ціна 0)",
  default: "дефолт калькулятора (ціна 0)",
  missing: "коду немає ні в довіднику, ні в дефолтах",
};

/** Текст блокування збереження/експорту або null, якщо все гаразд. */
export function priceBlockReason(issues: readonly PriceIssue[]): string | null {
  if (!issues.length) return null;
  const head = issues
    .slice(0, 3)
    .map((i) => `${i.name} [${i.key}] — ${SOURCE_LABEL[i.source]}`)
    .join("; ");
  const tail = issues.length > 3 ? ` та ще ${issues.length - 3}` : "";
  return `Ціна не знайдена у прайсі: ${head}${tail}. Додайте позицію в довідник або приберіть її з розрахунку.`;
}
