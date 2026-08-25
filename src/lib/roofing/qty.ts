/**
 * Базова структура кількості для наплавної покрівлі.
 *
 * Головне правило TERZI: три числа ніколи не змішуються.
 *   net      — чиста кількість (що фізично на покрівлі)
 *   calc     — розрахункова витрата (з нахлистами / коефіцієнтом / розкроєм)
 *   purchase — рекомендована закупівля (заводська фасовка)
 */

export interface QtyManualOverride {
  /** Значення, яке підставив рушій до ручної правки. */
  original: number;
  /** Ручне значення. */
  value: number;
  reason: string;
  author?: string;
  at?: string;
}

export interface Qty {
  /** Чиста кількість. */
  net: number;
  /** Розрахункова витрата (net + нахлисти/запас). */
  calc: number;
  /** Одиниця чистої/розрахункової кількості (м², п.м, шт, л, кг). */
  unit: string;
  /** Місткість однієї упаковки (м² в рулоні, л у відрі, кг у балоні). 0 = без фасовки. */
  pack: number;
  /** Одиниця фасовки (рул., відро, бал., шт). */
  packUnit: string;
  /** Рекомендована закупівля у пакуваннях. */
  packs: number;
  /** Скільки одиниць реально куплено (packs × pack). */
  purchase: number;
  /** Залишок після закупівлі (purchase − calc), у одиницях `unit`. */
  remainder: number;
  manual?: QtyManualOverride;
}

const r3 = (v: number) => +(Math.round(v * 1000) / 1000).toFixed(3);

export interface MakeQtyInput {
  net: number;
  calc?: number;
  unit: string;
  pack?: number;
  packUnit?: string;
  /** Кратність закупівлі у пакуваннях (наприклад, палета = 20 рулонів). */
  packMultiple?: number;
  manual?: QtyManualOverride;
}

/** Детермінований конструктор Qty: округлення пакувань завжди вгору. */
export function makeQty(input: MakeQtyInput): Qty {
  const net = Math.max(0, r3(input.net));
  const calc = Math.max(net === 0 ? 0 : 0, r3(input.calc ?? input.net));
  const pack = Math.max(0, input.pack ?? 0);
  const packUnit = input.packUnit ?? input.unit;
  const multiple = Math.max(1, Math.floor(input.packMultiple ?? 1));

  let packs = 0;
  let purchase = calc;
  if (pack > 0 && calc > 0) {
    packs = Math.ceil(calc / pack);
    if (multiple > 1) packs = Math.ceil(packs / multiple) * multiple;
    purchase = r3(packs * pack);
  } else if (pack > 0) {
    purchase = 0;
  }

  return {
    net,
    calc,
    unit: input.unit,
    pack,
    packUnit,
    packs,
    purchase: r3(purchase),
    remainder: r3(Math.max(0, purchase - calc)),
    ...(input.manual ? { manual: input.manual } : {}),
  };
}

/** Застосовує ручне значення розрахункової витрати, зберігаючи оригінал і причину. */
export function applyManual(qty: Qty, value: number, reason: string, author?: string): Qty {
  return makeQty({
    net: qty.net,
    calc: value,
    unit: qty.unit,
    pack: qty.pack,
    packUnit: qty.packUnit,
    manual: {
      original: qty.calc,
      value,
      reason,
      ...(author ? { author } : {}),
      at: new Date().toISOString(),
    },
  });
}

/** Людський підпис рекомендованої закупівлі. */
export function purchaseLabel(qty: Qty): string | null {
  if (!(qty.pack > 0) || !(qty.packs > 0)) return null;
  return `Рекомендована закупівля: ${qty.packs} ${qty.packUnit} × ${qty.pack} ${qty.unit} = ${qty.purchase} ${qty.unit}`;
}
