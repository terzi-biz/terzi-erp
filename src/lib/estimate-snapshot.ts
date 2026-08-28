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

import { CONTRACT_VERSION } from "./core/contract";
import type { CanonicalResult, ClientEstimateDTO, InternalEstimateDTO } from "./core/dto";
import { toClientDTO, toInternalDTO } from "./core/dto";

export const ESTIMATE_SNAPSHOT_VERSION = "snapshot@3";


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
  /** Версія Launch Contract, за правилами якої побудовано кошторис. */
  contractVersion: string;
  module: string;
  engineVersion: string;
  priceBookVersion: number | null;
  capturedAt: string;
  inputs: unknown;
  prices: Record<string, unknown>;
  norms: Record<string, unknown>;
  priceSources: Record<string, string>;
  /** Канонічний результат Core: податки, оплата, амортизація, коригування. */
  canonical?: CanonicalResult;
  /** Заморожені рядки внутрішнього та клієнтського контурів. */
  internalDTO?: InternalEstimateDTO;
  clientDTO?: ClientEstimateDTO;
}


/**
 * Формує повний знімок. Результат розрахунку розкладається в корінь
 * (сумісність з наявними читачами `calculation_json.lines/totalClient/...`),
 * а знімок цін і норм додається окремими полями.
 */
/** Глибока копія — знімок не повинен посилатися на живі об'єкти довідника. */
function deepClone<T>(v: T): T {
  if (v === undefined || v === null) return v;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(v);
    } catch {
      /* fallthrough */
    }
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

export function buildEstimateSnapshot<TInput, TResult extends object>(
  src: EstimateSnapshotSource<TInput, TResult>,
): EstimateSnapshot {
  return {
    ...deepClone(src.result),
    snapshotVersion: ESTIMATE_SNAPSHOT_VERSION,
    contractVersion: CONTRACT_VERSION,

    module: src.module,
    engineVersion: src.engineVersion,
    priceBookVersion: src.priceBookVersion ?? null,
    capturedAt: new Date().toISOString(),
    inputs: deepClone(src.inputs) as unknown,
    prices: deepClone(src.prices),
    norms: deepClone(src.norms ?? {}),
    priceSources: { ...(src.priceSources ?? {}) },
    ...(() => {
      const canonical = (src.result as { core?: CanonicalResult }).core;
      if (!canonical) return {};
      const frozen = deepClone(canonical);
      return {
        canonical: frozen,
        internalDTO: toInternalDTO(frozen),
        clientDTO: toClientDTO(frozen),
      };
    })(),
  };
}

/** Знімок придатний для відтворення розрахунку без звернення до довідника. */
export function isSnapshotComplete(snap: unknown): boolean {
  if (!snap || typeof snap !== "object") return false;
  const s = snap as Partial<EstimateSnapshot>;
  return (
    // snapshot@1 залишається читабельним — історичні кошториси не перебудовуються.
    (s.snapshotVersion === ESTIMATE_SNAPSHOT_VERSION ||
      s.snapshotVersion === "snapshot@2" ||
      s.snapshotVersion === "snapshot@1") &&

    typeof s.engineVersion === "string" &&
    s.engineVersion.length > 0 &&
    !!s.prices &&
    typeof s.prices === "object" &&
    Object.keys(s.prices).length > 0 &&
    !!s.norms &&
    typeof s.norms === "object"
  );
}
