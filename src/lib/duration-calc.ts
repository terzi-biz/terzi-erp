/**
 * Деттермінований розрахунок тривалості виконання робіт.
 * Норми продуктивності бригади (м²/день) на 1 робочу зміну.
 * Зберігаються тут, у майбутньому можна винести в БД як `productivity_norms`.
 */

export type ModuleKey = "screed" | "roofing" | "insulation" | "demolition";

export interface DurationInput {
  module: ModuleKey;
  area: number;
  /** для покрівлі (1–3) і пов'язаних випадків */
  layers?: number;
  /** додаткові важкі умови → коефіцієнт ускладнення */
  complexity?: "easy" | "normal" | "hard";
}

export interface DurationResult {
  days: number;
  perDayM2: number;
  reason: string;
}

const NORMS: Record<ModuleKey, number | Record<string, number>> = {
  screed: 200,
  roofing: { "1": 250, "2": 180, "3": 130, pvc: 150 },
  insulation: 180,
  demolition: 120,
};

const COMPLEXITY: Record<NonNullable<DurationInput["complexity"]>, number> = {
  easy: 0.85, normal: 1, hard: 1.25,
};

export function calcDuration({ module, area, layers, complexity = "normal" }: DurationInput): DurationResult {
  const safeArea = Math.max(1, area || 0);
  let perDay: number;
  let reason: string;

  if (module === "roofing") {
    const map = NORMS.roofing as Record<string, number>;
    const key = layers && layers >= 1 && layers <= 3 ? String(layers) : "pvc";
    perDay = map[key] ?? map.pvc;
    reason = `Покрівля (${key === "pvc" ? "ПВХ" : `${key} шар.`}) — норма ${perDay} м²/день`;
  } else {
    perDay = NORMS[module] as number;
    reason = `${module} — норма ${perDay} м²/день`;
  }

  const adjusted = perDay / COMPLEXITY[complexity];
  const days = Math.max(1, Math.ceil(safeArea / adjusted));
  return { days, perDayM2: Math.round(adjusted), reason };
}

/** Робочі дні (без неділь). Якщо weekendsOff=false — календарні. */
export function addBusinessDays(start: Date, days: number, weekendsOff = true): Date {
  const d = new Date(start);
  if (!weekendsOff) {
    d.setDate(d.getDate() + Math.max(0, days - 1));
    return d;
  }
  let added = 1; // включаючи день старту
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++; // skip Sunday
  }
  return d;
}
