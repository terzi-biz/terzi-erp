/**
 * Економіка робіт (Service Economics).
 *
 * Виручка й витрати беруться з фактичних операцій Finmap із урахуванням
 * розподілу по проєктах/статтях, кількості — з фактичного виробництва.
 * Середня собівартість одиниці — тільки зважена: сума прямих витрат / сума кількості.
 */

import { r2 } from "./core";
import { DIRECT_COST_CLASSES, type CostClass } from "./cost-class";

const num = (v: unknown): number => Number(v) || 0;

export type EconLine = {
  service: string | null;
  orderId?: string | null;
  kind: "income" | "expense";
  amount: unknown;
  costClass?: CostClass | null;
  /** ФОТ: виробничий — прямі витрати об'єкта; офісний/комерційний — ні. */
  payrollGroup?: "production" | "administrative" | "commercial" | null;
};

export type EconQuantity = { service: string | null; orderId?: string | null; qty: unknown; unit?: string | null };

export type ServiceEconomicsRow = {
  service: string;
  unit: string | null;
  quantity: number;
  hasQuantity: boolean;
  revenue: number;
  directCost: number;
  fullCost: number;
  costPerUnit: number | null;
  fullCostPerUnit: number | null;
  revenuePerUnit: number | null;
  grossProfit: number;
  grossMargin: number | null;
  objects: number;
  note: string | null;
};

/** Чи є витрата прямою собівартістю об'єкта. */
export function isDirectCost(line: EconLine): boolean {
  if (line.kind !== "expense") return false;
  if (line.payrollGroup) return line.payrollGroup === "production";
  const cls = line.costClass ?? null;
  return !!cls && DIRECT_COST_CLASSES.includes(cls);
}

/**
 * Зведення по послугах за період. Рядки без послуги збираються в «unallocated»
 * і ніколи не приписуються до конкретного напрямку.
 */
export function serviceEconomics(input: { lines: EconLine[]; quantities: EconQuantity[] }): {
  rows: ServiceEconomicsRow[];
  unallocated: { revenue: number; cost: number };
} {
  type Acc = { revenue: number; direct: number; full: number; orders: Set<string>; qty: number; unit: string | null };
  const acc = new Map<string, Acc>();
  const get = (k: string): Acc => {
    let a = acc.get(k);
    if (!a) { a = { revenue: 0, direct: 0, full: 0, orders: new Set(), qty: 0, unit: null }; acc.set(k, a); }
    return a;
  };

  const unallocated = { revenue: 0, cost: 0 };

  for (const l of input.lines) {
    const v = num(l.amount);
    if (v === 0) continue;
    if (!l.service) {
      if (l.kind === "income") unallocated.revenue += v;
      else unallocated.cost += v;
      continue;
    }
    const a = get(l.service);
    if (l.orderId) a.orders.add(l.orderId);
    if (l.kind === "income") a.revenue += v;
    else {
      a.full += v;
      if (isDirectCost(l)) a.direct += v;
    }
  }

  for (const q of input.quantities) {
    if (!q.service) continue;
    const a = get(q.service);
    a.qty += num(q.qty);
    if (!a.unit && q.unit) a.unit = q.unit;
    if (q.orderId) a.orders.add(q.orderId);
  }

  const rows: ServiceEconomicsRow[] = [...acc.entries()]
    .map(([service, a]) => {
      const quantity = r2(a.qty);
      const hasQuantity = quantity > 0;
      const revenue = r2(a.revenue);
      const directCost = r2(a.direct);
      const fullCost = r2(a.full);
      const grossProfit = r2(revenue - directCost);
      return {
        service,
        unit: a.unit,
        quantity,
        hasQuantity,
        revenue,
        directCost,
        fullCost,
        // Зважена собівартість одиниці; без фактичної кількості показуємо «Недостатньо даних».
        costPerUnit: hasQuantity ? r2(directCost / quantity) : null,
        fullCostPerUnit: hasQuantity ? r2(fullCost / quantity) : null,
        revenuePerUnit: hasQuantity ? r2(revenue / quantity) : null,
        grossProfit,
        grossMargin: revenue > 0 ? r2((grossProfit / revenue) * 100) : null,
        objects: a.orders.size,
        note: hasQuantity ? null : "Недостатньо даних: немає фактичної кількості",
      };
    })
    .sort((x, y) => y.revenue - x.revenue);

  return { rows, unallocated: { revenue: r2(unallocated.revenue), cost: r2(unallocated.cost) } };
}

/* ------------------------------ Кредиторка ------------------------------ */

export type ObligationInput = { id?: string; amount?: unknown; due_date?: string | null; status?: string | null };
export type SupplierPayment = { amount?: unknown; state?: string | null };

export type PayableResult = {
  obligations: number;
  scheduled: number;
  paid: number;
  remaining: number;
  overdue: number;
  lastPayment: string | null;
};

/**
 * Кредиторка постачальника. Зобовʼязання створює ERP (рахунок/закупівля),
 * фактична витрата Finmap лише закриває його. Витрата без зобовʼязання
 * НЕ створює борг заднім числом.
 */
export function computePayable(input: {
  obligations: ObligationInput[];
  actualPaid: { amount?: unknown; date?: string | null }[];
  scheduledPayments: { amount?: unknown }[];
  today?: string;
}): PayableResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const live = input.obligations.filter((o) => String(o.status ?? "open") !== "cancelled");
  const obligations = r2(live.reduce((s, o) => s + num(o.amount), 0));
  const paid = r2(input.actualPaid.reduce((s, p) => s + num(p.amount), 0));
  const scheduled = r2(input.scheduledPayments.reduce((s, p) => s + num(p.amount), 0));
  const remaining = r2(Math.max(obligations - paid, 0));

  // Прострочене — лише в межах непогашеного залишку зобовʼязань зі строком у минулому (FIFO).
  let pool = paid;
  let overdue = 0;
  for (const o of [...live].sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"))) {
    const amount = num(o.amount);
    const covered = Math.min(pool, amount);
    pool = r2(pool - covered);
    const rest = r2(amount - covered);
    if (rest > 0 && o.due_date && o.due_date < today) overdue = r2(overdue + rest);
  }

  const dates = input.actualPaid.map((p) => p.date).filter(Boolean) as string[];
  return {
    obligations,
    scheduled,
    paid,
    remaining,
    overdue,
    lastPayment: dates.length ? dates.sort().slice(-1)[0]! : null,
  };
}
