/**
 * Finance Core v3 — цільовий фінансовий водоспад.
 *
 * Нарахування (P&L) і рух грошей (Cash Flow) — різні звіти й ніколи не
 * змішуються. Transfer не впливає на жоден показник P&L. Округлення —
 * тільки на фінальному кроці. Модуль чистий і тестований.
 */

import { FINANCE_CORE_VERSION } from "./rules";

const num = (v: unknown): number => Number(v) || 0;
const r2 = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;

/* --------------------------- Об'єктний рівень --------------------------- */

export type ObjectEconomyInput = {
  orderId: string;
  /** Нарахована виручка (акт / виконані роботи), НЕ гроші. */
  accrualRevenue: number;
  /** Прямі витрати: матеріали, роботи, логістика, підряд, техніка на об'єкт. */
  directCost: number;
  /** Розподілені виробничі накладні. */
  allocatedOverhead?: number;
  directionKey?: string | null;
};

export type ObjectEconomy = {
  orderId: string;
  directionKey: string | null;
  revenue: number;
  directCost: number;
  grossProfit: number;
  grossMargin: number | null;
  allocatedOverhead: number;
  contribution: number;
};

export function objectEconomy(input: ObjectEconomyInput): ObjectEconomy {
  const revenue = num(input.accrualRevenue);
  const directCost = num(input.directCost);
  const overhead = num(input.allocatedOverhead);
  const gp = revenue - directCost;
  return {
    orderId: input.orderId,
    directionKey: input.directionKey ?? null,
    revenue: r2(revenue),
    directCost: r2(directCost),
    grossProfit: r2(gp),
    grossMargin: revenue > 0 ? r2((gp / revenue) * 100) : null,
    allocatedOverhead: r2(overhead),
    contribution: r2(gp - overhead),
  };
}

/**
 * Розподіл нерозподілених виробничих накладних між об'єктами.
 * База — виручка об'єкта. Сума розподілу дорівнює вхідній сумі до копійки:
 * різниця округлення дістається найбільшому об'єкту.
 */
export function allocateProductionOverhead(
  objects: { orderId: string; revenue: number }[],
  overheadTotal: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const total = objects.reduce((s, o) => s + num(o.revenue), 0);
  const amount = num(overheadTotal);
  if (objects.length === 0 || total <= 0 || amount === 0) {
    for (const o of objects) out.set(o.orderId, 0);
    return out;
  }
  let assigned = 0;
  for (const o of objects) {
    const share = r2((num(o.revenue) / total) * amount);
    out.set(o.orderId, share);
    assigned = r2(assigned + share);
  }
  const drift = r2(amount - assigned);
  if (drift !== 0) {
    const biggest = [...objects].sort((a, b) => num(b.revenue) - num(a.revenue))[0];
    if (biggest) out.set(biggest.orderId, r2(num(out.get(biggest.orderId)) + drift));
  }
  return out;
}

/* -------------------------- Компанійський рівень ------------------------- */

export type CompanyWaterfallInput = {
  period: string;
  objects: ObjectEconomy[];
  roleVariable: number;
  fixedOpex: number;
  mediaSpend: number;
  taxes: number;
  ceoBonus?: number;
  reserveTopUp?: number;
  /** Нерозподілені виробничі накладні, що не потрапили на об'єкти. */
  unallocatedProductionOverhead?: number;
};

export type CompanyWaterfall = {
  period: string;
  engineVersion: string;
  revenue: number;
  directCost: number;
  grossProfit: number;
  grossMargin: number | null;
  allocatedOverhead: number;
  unallocatedProductionOverhead: number;
  contribution: number;
  roleVariable: number;
  fixedOpex: number;
  mediaSpend: number;
  taxes: number;
  operatingProfit: number;
  operatingMargin: number | null;
  ceoBonus: number;
  reserveTopUp: number;
  distributableProfit: number;
};

export function companyWaterfall(input: CompanyWaterfallInput): CompanyWaterfall {
  const revenue = input.objects.reduce((s, o) => s + num(o.revenue), 0);
  const directCost = input.objects.reduce((s, o) => s + num(o.directCost), 0);
  const allocated = input.objects.reduce((s, o) => s + num(o.allocatedOverhead), 0);
  const unallocated = num(input.unallocatedProductionOverhead);
  const gp = revenue - directCost;
  const contribution = gp - allocated - unallocated;
  const operating =
    contribution - num(input.roleVariable) - num(input.fixedOpex) - num(input.mediaSpend) - num(input.taxes);
  const distributable = operating - num(input.ceoBonus) - num(input.reserveTopUp);
  return {
    period: input.period,
    engineVersion: FINANCE_CORE_VERSION,
    revenue: r2(revenue),
    directCost: r2(directCost),
    grossProfit: r2(gp),
    grossMargin: revenue > 0 ? r2((gp / revenue) * 100) : null,
    allocatedOverhead: r2(allocated),
    unallocatedProductionOverhead: r2(unallocated),
    contribution: r2(contribution),
    roleVariable: r2(num(input.roleVariable)),
    fixedOpex: r2(num(input.fixedOpex)),
    mediaSpend: r2(num(input.mediaSpend)),
    taxes: r2(num(input.taxes)),
    operatingProfit: r2(operating),
    operatingMargin: revenue > 0 ? r2((operating / revenue) * 100) : null,
    ceoBonus: r2(num(input.ceoBonus)),
    reserveTopUp: r2(num(input.reserveTopUp)),
    distributableProfit: r2(distributable),
  };
}

/* -------------------------------- Резерв -------------------------------- */

export type ReserveState = {
  targetAmount: number;
  balance: number;
  coverage: number | null;
  dividendsUnlocked: boolean;
};

/** Ціль ФНЗ = місяці × нормалізований фіксований burn. */
export function fnzTarget(normalizedMonthlyBurn: number, months: number | null): number | null {
  if (months === null || !Number.isFinite(months)) return null;
  return r2(num(normalizedMonthlyBurn) * months);
}

/** Гейт дивідендів: розподіл дозволений лише коли резерв досяг цілі. */
export function reserveState(balance: number, target: number | null): ReserveState {
  const b = r2(num(balance));
  if (target === null) return { targetAmount: 0, balance: b, coverage: null, dividendsUnlocked: false };
  const t = r2(target);
  return {
    targetAmount: t,
    balance: b,
    coverage: t > 0 ? r2((b / t) * 100) : null,
    dividendsUnlocked: t > 0 ? b >= t : false,
  };
}

/**
 * Нормалізований місячний burn: середнє за закриті місяці з виключенням
 * разових статей. Порожній вхід → `null` (не нуль).
 */
export function normalizedMonthlyBurn(months: { period: string; fixedCost: number }[]): number | null {
  if (!months.length) return null;
  const total = months.reduce((s, m) => s + num(m.fixedCost), 0);
  return r2(total / months.length);
}
