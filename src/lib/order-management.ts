/**
 * Ручні управлінські дані замовлення (orders.management_data) та детерміновані
 * KPI план/факт. Чиста математика без побічних ефектів — використовується
 * і на сервері, і в UI. Нічого не зберігає: KPI завжди перераховуються.
 */
import { z } from "zod";

export type ManagementData = {
  estimate_total?: number | null;
  contract_total?: number | null;
  planned_cost?: number | null;
  actual_revenue?: number | null;
  actual_cost?: number | null;
  actual_start?: string | null;
  actual_end?: string | null;
  source_detail?: string | null;
  responsible_name?: string | null;
  foreman_name?: string | null;
  work_description?: string | null;
  internal_note?: string | null;
};

const num = z.number().finite().optional().nullable();
const str = (max: number) => z.string().max(max).optional().nullable();

export const managementDataSchema = z.object({
  estimate_total: num,
  contract_total: num,
  planned_cost: num,
  actual_revenue: num,
  actual_cost: num,
  actual_start: str(40),
  actual_end: str(40),
  source_detail: str(200),
  responsible_name: str(200),
  foreman_name: str(200),
  work_description: str(4000),
  internal_note: str(4000),
});

export const MANAGEMENT_KEYS = Object.keys(managementDataSchema.shape) as (keyof ManagementData)[];

/** Безпечне читання jsonb-поля замовлення. */
export function readManagement(order: any): ManagementData {
  const raw = order?.management_data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const parsed = managementDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export type ValueSource = "manual" | "estimate" | "crm" | "none";

export type OrderKpi = {
  plan: { revenue: number | null; cost: number | null; profit: number | null; margin: number | null };
  fact: { revenue: number | null; cost: number | null; profit: number | null; margin: number | null };
  delta: { revenue: number | null; cost: number | null; profit: number | null; margin: number | null };
  days: { plan: number | null; fact: number | null; delta: number | null };
  paid: number | null;
  due: number | null;
  revenueSource: ValueSource;
};

function diffDays(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const sub = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const margin = (profit: number | null, revenue: number | null) =>
  profit == null || revenue == null || revenue === 0 ? null : profit / revenue;

/**
 * План: дохід = contract_total ?? estimate_total ?? amount_total; витрати = planned_cost.
 * Факт: дохід = actual_revenue; витрати = actual_cost. paid_total — це оплата, не виручка.
 */
export function computeOrderKpi(order: any, m: ManagementData = readManagement(order)): OrderKpi {
  const contract = n(m.contract_total);
  const estimate = n(m.estimate_total);
  const amount = n(order?.amount_total);

  const planRevenue = contract ?? estimate ?? amount;
  const revenueSource: ValueSource =
    contract != null ? "manual" : estimate != null ? "manual" : amount != null ? "estimate" : "none";
  const planCost = n(m.planned_cost);
  const planProfit = sub(planRevenue, planCost);

  const factRevenue = n(m.actual_revenue);
  const factCost = n(m.actual_cost);
  const factProfit = sub(factRevenue, factCost);

  const paid = n(order?.paid_total);
  const dueBase = factRevenue ?? planRevenue;

  return {
    plan: { revenue: planRevenue, cost: planCost, profit: planProfit, margin: margin(planProfit, planRevenue) },
    fact: { revenue: factRevenue, cost: factCost, profit: factProfit, margin: margin(factProfit, factRevenue) },
    delta: {
      revenue: sub(factRevenue, planRevenue),
      cost: sub(factCost, planCost),
      profit: sub(factProfit, planProfit),
      margin: sub(margin(factProfit, factRevenue), margin(planProfit, planRevenue)),
    },
    days: {
      plan: diffDays(order?.planned_start, order?.planned_end),
      fact: diffDays(m.actual_start, m.actual_end),
      delta: sub(diffDays(m.actual_start, m.actual_end), diffDays(order?.planned_start, order?.planned_end)),
    },
    paid,
    due: paid == null || dueBase == null ? null : dueBase - paid,
  };
}

/** Відносне відхилення факт/план у відсотках (null, якщо плану немає). */
export function deltaPercent(fact: number | null, plan: number | null): number | null {
  if (fact == null || plan == null || plan === 0) return null;
  return ((fact - plan) / Math.abs(plan)) * 100;
}

/** Посилання на картку в KeyCRM, якщо є валідний зв'язок. */
export function crmUrl(order: any): string | null {
  const link = order?.crm_link;
  if (typeof link === "string" && /^https?:\/\//i.test(link)) return link;
  const id = order?.external_id;
  const src = order?.external_source;
  if (src === "keycrm" && id) return `https://app.key.crm/pipelines/card/${id}`;
  return null;
}
