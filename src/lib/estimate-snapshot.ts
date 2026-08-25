/**
 * Незмінний знімок кошторису (П2 аудиту, затверджено директором).
 *
 * Кожен збережений кошторис зберігає ФАКТИЧНО використані:
 *   - ціни (закупівля/продаж матеріалів, робіт, логістики),
 *   - норми та коефіцієнти калькулятора,
 *   - engine_version і price_book_version,
 *   - джерело кожної ціни (довідник / дефолт / відсутня),
 *   - розраховані рядки та підсумки.
 *
 * Наслідок: подальші зміни довідника НЕ змінюють раніше збережений кошторис.
 * Історичні кошториси не перераховуються і не бекфіляться автоматично.
 */

export const ESTIMATE_SNAPSHOT_VERSION = "snapshot@1";

export interface EstimateSnapshotSource<TInput, TResult> {
  module: string;
  engineVersion: string;
  priceBookVersion?: number | null;
  inputs: TInput;
  result: TResult;
  /** Ціни, реально передані в рушій розрахунку. */
  prices: Record<string, unknown>;
  /** Норми, коефіцієнти, тарифи, конфігурації рушія. */
  norms?: Record<string, unknown>;
  /** Джерело ціни за кодом позиції. */
  priceSources?: Record<string, string>;
}

export interface EstimateSnapshot extends Record<string, unknown> {
  snapshotVersion: string;
  module: string;
  engineVersion: string;
  priceBookVersion: number | null;
  capturedAt: string;
  inputs: unknown;
  prices: Record<string, unknown>;
  norms: Record<string, unknown>;
  priceSources: Record<string, string>;
}

/**
 * Формує повний знімок. Результат розрахунку розкладається в корінь
 * (сумісність з наявними читачами `calculation_json.lines/totalClient/...`),
 * а знімок цін і норм додається окремими полями.
 */
export function buildEstimateSnapshot<TInput, TResult extends object>(
  src: EstimateSnapshotSource<TInput, TResult>,
): EstimateSnapshot {
  return {
    ...src.result,
    snapshotVersion: ESTIMATE_SNAPSHOT_VERSION,
    module: src.module,
    engineVersion: src.engineVersion,
    priceBookVersion: src.priceBookVersion ?? null,
    capturedAt: new Date().toISOString(),
    inputs: src.inputs as unknown,
    prices: { ...src.prices },
    norms: { ...(src.norms ?? {}) },
    priceSources: { ...(src.priceSources ?? {}) },
  };
}

/** Знімок придатний для відтворення розрахунку без звернення до довідника. */
export function isSnapshotComplete(snap: unknown): boolean {
  if (!snap || typeof snap !== "object") return false;
  const s = snap as Partial<EstimateSnapshot>;
  return (
    s.snapshotVersion === ESTIMATE_SNAPSHOT_VERSION &&
    typeof s.engineVersion === "string" && s.engineVersion.length > 0 &&
    !!s.prices && typeof s.prices === "object" && Object.keys(s.prices).length > 0 &&
    !!s.norms && typeof s.norms === "object"
  );
}
