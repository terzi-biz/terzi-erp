/**
 * ACTUAL vs SCHEDULED операції Finmap.
 *
 * Планова операція Finmap — це фінансове підтвердження очікуваного руху грошей,
 * а не факт. Вона ніколи не входить у дохід/витрату/прибуток і не подвоює суму
 * після фактичного проведення.
 */

import { r2 } from "./core";
import { cashDate, type PeriodTx } from "./allocations";

const num = (v: unknown): number => Number(v) || 0;

export type ScheduleTx = PeriodTx & {
  id?: string;
  finmap_id?: string | null;
  external_id?: string | null;
  state?: string | null;
  kind?: string | null;
  amount?: unknown;
  amount_uah?: unknown;
  order_id?: string | null;
  counterparty_id?: string | null;
  counterparty_name?: string | null;
  category_name?: string | null;
  status?: string | null;
};

export const isScheduled = (t: ScheduleTx): boolean => String(t.state ?? "actual") === "scheduled";
export const isActual = (t: ScheduleTx): boolean => !isScheduled(t);
export const txMoney = (t: ScheduleTx): number => num(t.amount_uah ?? t.amount);

const keyOf = (t: ScheduleTx): string | null => {
  const ext = t.external_id ? String(t.external_id) : null;
  const fin = t.finmap_id ? String(t.finmap_id) : null;
  return ext ?? fin;
};

export type ReconcileResult = {
  /** планові операції, що ще не стали фактом */
  open: ScheduleTx[];
  /** планові операції, закриті фактом (не рахуються вдруге) */
  superseded: { scheduled: ScheduleTx; actual: ScheduleTx; reason: string }[];
};

/**
 * Scheduled → Actual. Звірка тільки за стабільними ідентифікаторами Finmap
 * (externalId / finmap id). Ніяких fuzzy-збігів за сумою й назвою.
 */
export function reconcileScheduled(scheduled: ScheduleTx[], actual: ScheduleTx[]): ReconcileResult {
  const byKey = new Map<string, ScheduleTx>();
  for (const a of actual) {
    const k = keyOf(a);
    if (k) byKey.set(k, a);
  }
  const open: ScheduleTx[] = [];
  const superseded: ReconcileResult["superseded"] = [];
  for (const s of scheduled) {
    const k = keyOf(s);
    const hit = k ? byKey.get(k) : undefined;
    if (hit) superseded.push({ scheduled: s, actual: hit, reason: "Проведено фактичну операцію з тим самим ідентифікатором Finmap" });
    else open.push(s);
  }
  return { open, superseded };
}

/** Сума фактичних грошей: планові операції свідомо виключені. */
export function actualOnly(rows: ScheduleTx[]): ScheduleTx[] {
  return rows.filter(isActual);
}

export type UpcomingRow = {
  id: string | null;
  date: string | null;
  kind: string;
  amount: number;
  counterparty: string | null;
  category: string | null;
  order_id: string | null;
  status: string;
  source: "finmap" | "erp";
};

export type UpcomingBuckets = {
  receipts: { d7: number; d30: number; month: number; rows: UpcomingRow[] };
  payments: { d7: number; d30: number; month: number; rows: UpcomingRow[] };
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const monthEnd = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

/** Найближчі надходження й виплати: планові операції Finmap + строки ERP. Без прогнозних формул. */
export function upcomingBuckets(rows: UpcomingRow[], today: string): UpcomingBuckets {
  const d7 = addDays(today, 7);
  const d30 = addDays(today, 30);
  const mEnd = monthEnd(today);

  const build = (list: UpcomingRow[]) => {
    const sorted = [...list].sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31"));
    const within = (edge: string) => r2(sorted.filter((r) => r.date && r.date >= today && r.date <= edge).reduce((s, r) => s + r.amount, 0));
    return { d7: within(d7), d30: within(d30), month: within(mEnd), rows: sorted };
  };

  return {
    receipts: build(rows.filter((r) => r.kind === "income")),
    payments: build(rows.filter((r) => r.kind === "expense")),
  };
}

/** Планова операція Finmap → рядок очікуваного платежу. */
export function toUpcomingRow(t: ScheduleTx): UpcomingRow {
  return {
    id: t.id ?? null,
    date: cashDate(t),
    kind: t.kind === "income" ? "income" : "expense",
    amount: r2(txMoney(t)),
    counterparty: t.counterparty_name ?? null,
    category: t.category_name ?? null,
    order_id: t.order_id ?? null,
    status: t.status ?? "scheduled",
    source: "finmap",
  };
}
