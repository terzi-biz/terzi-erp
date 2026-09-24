/**
 * Правила вікна редагування місячних планів продажів (Europe/Kyiv).
 * Без серверних імпортів — зручно для unit-тестів.
 */

import { kyivToday } from "@/lib/kyiv-time";

/** Дефолтний seed корпоративного плану, якщо за місяць ще немає запису. */
export const DEFAULT_COMPANY_SALES_TARGET = 1_500_000;

/** Метрика в analytics_targets для дзеркала корпоративного плану. */
export const SALES_COMPANY_METRIC = "sales_company";

/** Префікс метрики менеджера в analytics_targets (legacy-сумісність). */
export const SALES_MANAGER_METRIC_PREFIX = "sales_manager:";

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function managerMetricKey(userId: string): string {
  return `${SALES_MANAGER_METRIC_PREFIX}${userId}`;
}

/**
 * Для місяця M план редагований з M-01 по M-05 включно (день Києва).
 * Поза вікном — лише admin override / admin_unlocked.
 */
export function isSalesPlanWindowOpen(planMonth: string, todayKyiv: string = kyivToday()): boolean {
  const m = monthStart(planMonth);
  const t = todayKyiv.slice(0, 10);
  if (t.slice(0, 7) !== m.slice(0, 7)) return false;
  const day = Number(t.slice(8, 10));
  return day >= 1 && day <= 5;
}

export function canEditSalesPlan(opts: {
  planMonth: string;
  todayKyiv?: string;
  /** admin / owner — можуть правити поза вікном */
  isAdminOverride?: boolean;
  /** прапорець sales_plan_months.admin_unlocked */
  adminUnlocked?: boolean;
}): { editable: boolean; reason: "window" | "admin_override" | "unlocked" | "locked" } {
  const today = opts.todayKyiv ?? kyivToday();
  if (isSalesPlanWindowOpen(opts.planMonth, today)) {
    return { editable: true, reason: "window" };
  }
  if (opts.adminUnlocked) return { editable: true, reason: "unlocked" };
  if (opts.isAdminOverride) return { editable: true, reason: "admin_override" };
  return { editable: false, reason: "locked" };
}

export function managersSum(targets: ReadonlyArray<{ target: number }>): number {
  return targets.reduce((s, r) => s + (Number(r.target) || 0), 0);
}

/**
 * Попередження, якщо сума менеджерів відхиляється від корпоративного плану > 1%.
 * Збереження все одно дозволене.
 */
export function sumManagersDriftWarning(
  companyTarget: number,
  managerTargets: ReadonlyArray<{ target: number }>,
  thresholdPct = 0.01,
): {
  managersTotal: number;
  driftAbs: number;
  driftPct: number;
  warn: boolean;
  message: string | null;
} {
  const company = Number(companyTarget) || 0;
  const managersTotal = managersSum(managerTargets);
  const driftAbs = Math.abs(managersTotal - company);
  const driftPct = company === 0 ? (managersTotal === 0 ? 0 : 1) : driftAbs / company;
  const warn = company > 0 ? driftPct > thresholdPct : managersTotal > 0;
  return {
    managersTotal,
    driftAbs,
    driftPct,
    warn,
    message: warn
      ? `Сума планів менеджерів (${Math.round(managersTotal)} ₴) відхиляється від корпоративного плану (${Math.round(company)} ₴) більш ніж на ${(thresholdPct * 100).toFixed(0)}%.`
      : null,
  };
}

/** Підпис «план vs факт» для KPI; якщо цілі немає — український placeholder. */
export function planFactHint(fact: number | null | undefined, plan: number | null | undefined): string {
  if (plan == null || !Number.isFinite(plan) || plan <= 0) return "Ціль не налаштована";
  if (fact == null || !Number.isFinite(fact)) return `план ${Math.round(plan).toLocaleString("uk-UA")} ₴`;
  const pct = plan === 0 ? 0 : (fact / plan) * 100;
  return `${Math.round(pct)}% від плану · ${Math.round(plan).toLocaleString("uk-UA")} ₴`;
}

export function planPct(fact: number | null | undefined, plan: number | null | undefined): number | null {
  if (plan == null || !Number.isFinite(plan) || plan <= 0) return null;
  if (fact == null || !Number.isFinite(fact)) return null;
  return (fact / plan) * 100;
}
