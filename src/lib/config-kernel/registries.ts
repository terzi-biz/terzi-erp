/**
 * Control Plane — канонічні інтерфейси реєстрів (Wave 1: лише контракти й seed).
 * Адмін-сторінки не будуються тут. Capabilities похідні від src/lib/modules.ts —
 * другого реєстру модулів немає.
 */
import { TERZI_MODULES, type ModuleId } from "@/lib/modules";
import { ACCESS_ACTIONS, ACCESS_MODULES } from "@/lib/access-constants";

export interface CapabilityDef {
  id: ModuleId;
  label: string;
  route: string | null;
  active: boolean;
  source: "modules.ts";
}
export const capabilities = (): CapabilityDef[] =>
  TERZI_MODULES.map((m) => ({ id: m.id, label: m.label, route: m.route, active: m.active, source: "modules.ts" }));

export interface EntityDef {
  key: string;
  table: string;
  label: string;
  /** canonical — джерело правди; projection — похідне подання. */
  role: "canonical" | "projection";
}
export const ENTITIES: readonly EntityDef[] = [
  { key: "order", table: "orders", label: "Замовлення / Об'єкт", role: "canonical" },
  { key: "client", table: "clients", label: "Клієнт", role: "canonical" },
  { key: "lead", table: "crm_leads", label: "Лід", role: "canonical" },
  { key: "contact", table: "crm_contacts", label: "Контакт", role: "canonical" },
  { key: "measurement", table: "order_measurements", label: "Замір", role: "canonical" },
  { key: "estimate", table: "estimates", label: "Кошторис", role: "canonical" },
  { key: "calendar_event", table: "calendar_events", label: "Подія календаря", role: "projection" },
  { key: "task", table: "crm_tasks", label: "Задача", role: "canonical" },
];

export interface EventDef { key: string; entity: string; label: string }
export const EVENTS: readonly EventDef[] = [
  { key: "lead.created", entity: "lead", label: "Створено лід" },
  { key: "order.status_changed", entity: "order", label: "Змінено статус замовлення" },
  { key: "measurement.completed", entity: "measurement", label: "Замір виконано" },
  { key: "estimate.approved", entity: "estimate", label: "Кошторис затверджено" },
];

export interface ActionDef { key: string; label: string; permission: { module: string; action: string } }
export const ACTIONS: readonly ActionDef[] = [
  { key: "task.create", label: "Створити задачу", permission: { module: "tasks", action: "create" } },
  { key: "record.assign", label: "Призначити відповідального", permission: { module: "orders", action: "assign" } },
];

export interface MetricDef { key: string; label: string; unit: "count" | "uah" | "pct"; sensitive: boolean }
export const METRICS: readonly MetricDef[] = [
  { key: "leads.count", label: "Ліди", unit: "count", sensitive: false },
  { key: "orders.sold_value", label: "Продано (договір)", unit: "uah", sensitive: false },
  { key: "cash.received", label: "Надходження (Finmap)", unit: "uah", sensitive: true },
  { key: "gross_profit", label: "Валовий прибуток", unit: "uah", sensitive: true },
];

export interface DependencyIssue { ref: string; problem: string }

/** Базова перевірка залежностей реєстрів (Wave 6 розширить). */
export function validateRegistries(): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  const modules = new Set(ACCESS_MODULES.map((m) => m.key));
  const actions = new Set(ACCESS_ACTIONS.map((a) => a.key));
  const entities = new Set(ENTITIES.map((e) => e.key));
  for (const a of ACTIONS) {
    if (!modules.has(a.permission.module)) issues.push({ ref: a.key, problem: `невідомий модуль прав ${a.permission.module}` });
    if (!actions.has(a.permission.action)) issues.push({ ref: a.key, problem: `невідома дія прав ${a.permission.action}` });
  }
  for (const e of EVENTS) if (!entities.has(e.entity)) issues.push({ ref: e.key, problem: `невідома сутність ${e.entity}` });
  return issues;
}
