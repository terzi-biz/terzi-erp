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

/* ------------------- Канонічна кредиторка (один розрахунок) ------------------- */

export type PayableObligation = {
  id: string;
  counterparty_id?: string | null;
  supplier_name?: string | null;
  order_id?: string | null;
  finmap_invoice_id?: string | null;
  amount?: unknown;
  due_date?: string | null;
  status?: string | null;
};

export type PayablePayment = {
  id?: string | null;
  counterparty_id?: string | null;
  order_id?: string | null;
  obligation_id?: string | null;
  finmap_invoice_id?: string | null;
  amount?: unknown;
  date?: string | null;
  state?: string | null;
};

export type PayableObligationRow = {
  id: string;
  supplier: string;
  counterpartyId: string | null;
  orderId: string | null;
  amount: number;
  paid: number;
  scheduled: number;
  /** Непогашений залишок — саме він показується в Кредиторці, Огляді й Очікуваних платежах. */
  remaining: number;
  overdue: number;
  dueDate: string | null;
  lastPayment: string | null;
  status: string;
};

export type PayableSupplierRow = {
  supplier: string;
  counterpartyId: string | null;
  obligations: number;
  scheduled: number;
  paid: number;
  remaining: number;
  overdue: number;
  lastPayment: string | null;
};

export type PayablesResult = {
  obligations: PayableObligationRow[];
  suppliers: PayableSupplierRow[];
  totals: { obligations: number; scheduled: number; paid: number; remaining: number; overdue: number };
  /** Витрати, які не можна достовірно віднести до зобовʼязання — на ручну перевірку. */
  unmatchedPayments: { id: string | null; amount: number; date: string | null; counterpartyId: string | null; orderId: string | null; reason: string }[];
};

const liveObligation = (o: PayableObligation) => !["cancelled"].includes(String(o.status ?? "open"));

/**
 * Зіставлення оплат із зобовʼязаннями. Пріоритет:
 *  1. явний звʼязок (obligation_id або спільний рахунок Finmap);
 *  2. точний збіг замовлення + контрагента;
 *  3. needs_review — оплата НЕ зменшує жодне зобовʼязання.
 * Ніякого fuzzy-матчингу за сумою чи назвою.
 */
function matchPayment(o: PayableObligation[], p: PayablePayment): { hits: PayableObligation[]; reason: string } {
  const explicit = o.filter(
    (x) =>
      (p.obligation_id && p.obligation_id === x.id) ||
      (p.finmap_invoice_id && x.finmap_invoice_id && p.finmap_invoice_id === x.finmap_invoice_id),
  );
  if (explicit.length) return { hits: explicit, reason: "explicit" };

  if (p.counterparty_id && p.order_id) {
    const exact = o.filter((x) => x.counterparty_id === p.counterparty_id && x.order_id === p.order_id);
    if (exact.length) return { hits: exact, reason: "order+counterparty" };
  }
  return { hits: [], reason: p.counterparty_id ? "Контрагент збігається, але немає звʼязку із зобовʼязанням" : "Немає звʼязку із зобовʼязанням" };
}

const byDue = (a: PayableObligation, b: PayableObligation) =>
  (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");

/** Єдиний канонічний розрахунок кредиторки для Кредиторки, Огляду й Очікуваних платежів. */
export function computePayables(input: {
  obligations: PayableObligation[];
  payments: PayablePayment[];
  today?: string;
  cpName?: (id: string | null) => string | null;
}): PayablesResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const live = (input.obligations ?? []).filter(liveObligation);
  const state = new Map<string, { o: PayableObligation; paid: number; scheduled: number; last: string | null }>();
  for (const o of live) state.set(o.id, { o, paid: 0, scheduled: 0, last: null });

  const unmatchedPayments: PayablesResult["unmatchedPayments"] = [];

  for (const p of input.payments ?? []) {
    const amount = num(p.amount);
    if (amount <= 0) continue;
    const scheduled = String(p.state ?? "actual") === "scheduled";
    const { hits, reason } = matchPayment(live, p);
    if (!hits.length) {
      if (!scheduled) {
        unmatchedPayments.push({
          id: p.id ?? null, amount: r2(amount), date: p.date ?? null,
          counterpartyId: p.counterparty_id ?? null, orderId: p.order_id ?? null, reason,
        });
      }
      continue;
    }
    // Часткова оплата зменшує тільки відповідні зобовʼязання (FIFO за строком).
    let pool = amount;
    for (const o of [...hits].sort(byDue)) {
      if (pool <= 0) break;
      const st = state.get(o.id)!;
      const capacity = Math.max(num(o.amount) - (scheduled ? st.paid + st.scheduled : st.paid), 0);
      const applied = Math.min(pool, capacity);
      if (applied <= 0) continue;
      pool = r2(pool - applied);
      if (scheduled) st.scheduled = r2(st.scheduled + applied);
      else {
        st.paid = r2(st.paid + applied);
        if (p.date && (!st.last || p.date > st.last)) st.last = p.date;
      }
    }
    if (pool > 0.01 && !scheduled) {
      unmatchedPayments.push({
        id: p.id ?? null, amount: r2(pool), date: p.date ?? null,
        counterpartyId: p.counterparty_id ?? null, orderId: p.order_id ?? null,
        reason: `${reason}: сума перевищує залишок зобовʼязання`,
      });
    }
  }

  const obligations: PayableObligationRow[] = [...state.values()].map(({ o, paid, scheduled, last }) => {
    const amount = r2(num(o.amount));
    const remaining = r2(Math.max(amount - paid, 0));
    return {
      id: o.id,
      supplier: (o.supplier_name ?? input.cpName?.(o.counterparty_id ?? null) ?? "—") as string,
      counterpartyId: o.counterparty_id ?? null,
      orderId: o.order_id ?? null,
      amount,
      paid: r2(paid),
      scheduled: r2(scheduled),
      remaining,
      overdue: o.due_date && o.due_date < today ? remaining : 0,
      dueDate: o.due_date ?? null,
      lastPayment: last,
      status: String(o.status ?? "open"),
    };
  });

  const groups = new Map<string, PayableSupplierRow>();
  for (const r of obligations) {
    const k = r.counterpartyId ?? `name:${r.supplier}`;
    const g = groups.get(k) ?? {
      supplier: r.supplier, counterpartyId: r.counterpartyId,
      obligations: 0, scheduled: 0, paid: 0, remaining: 0, overdue: 0, lastPayment: null,
    };
    g.obligations = r2(g.obligations + r.amount);
    g.scheduled = r2(g.scheduled + r.scheduled);
    g.paid = r2(g.paid + r.paid);
    g.remaining = r2(g.remaining + r.remaining);
    g.overdue = r2(g.overdue + r.overdue);
    if (r.lastPayment && (!g.lastPayment || r.lastPayment > g.lastPayment)) g.lastPayment = r.lastPayment;
    groups.set(k, g);
  }

  const suppliers = [...groups.values()].sort((a, b) => b.remaining - a.remaining);
  return {
    obligations: obligations.sort((a, b) => b.remaining - a.remaining),
    suppliers,
    totals: {
      obligations: r2(suppliers.reduce((s, r) => s + r.obligations, 0)),
      scheduled: r2(suppliers.reduce((s, r) => s + r.scheduled, 0)),
      paid: r2(suppliers.reduce((s, r) => s + r.paid, 0)),
      remaining: r2(suppliers.reduce((s, r) => s + r.remaining, 0)),
      overdue: r2(suppliers.reduce((s, r) => s + r.overdue, 0)),
    },
    unmatchedPayments,
  };
}
