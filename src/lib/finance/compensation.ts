/**
 * Finance Core v3 — рушій винагород ролей (To-Be).
 *
 * Головне правило: Sales, Estimator і Foreman рахуються ВИКЛЮЧНО від
 * attributed Eligible GP своєї ролі (об'єкти / напрямки, за які роль
 * відповідає) і ніколи від company GP.
 *
 * Ставки й відсотки не хардкодяться: усе читається з `finance_rules`
 * на дату періоду. Якщо правило не задане — повертаємо `needsRule`,
 * а не вигадане значення.
 */

import { FINANCE_CORE_VERSION, rulePercent, ruleNumber, type FinanceRule } from "./rules";
import type { ObjectEconomy } from "./waterfall";

const r2 = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;
const num = (v: unknown): number => Number(v) || 0;

export const COMP_ROLES = [
  "ceo", "sales", "estimator", "foreman", "office", "finance", "marketing", "driver",
] as const;
export type CompRole = (typeof COMP_ROLES)[number];

export const COMP_ROLE_LABELS: Record<CompRole, string> = {
  ceo: "Керівник",
  sales: "Продажі",
  estimator: "Кошторисник",
  foreman: "Прораб",
  office: "Офіс",
  finance: "Фінанси",
  marketing: "Маркетинг",
  driver: "Водій",
};

/** Ролі, що рахуються від attributed GP і НІКОЛИ від company GP. */
export const GP_ATTRIBUTED_ROLES: CompRole[] = ["sales", "estimator", "foreman"];

/** Правила бази й змінної частини для кожної ролі. */
const BASE_RULE: Record<CompRole, string | null> = {
  ceo: null,
  sales: "sales_base",
  estimator: "estimator_base",
  foreman: "foreman_base",
  office: "office_base",
  finance: "finance_base",
  marketing: "marketing_base",
  driver: "driver_base",
};

const VARIABLE_RULE: Record<CompRole, string | null> = {
  ceo: "ceo_operating_profit_percent",
  sales: "sales_gp_percent",
  estimator: "estimator_gp_percent",
  foreman: "foreman_gp_percent",
  office: null,
  finance: null,
  marketing: null,
  driver: null,
};

export type RoleCompInput = {
  role: CompRole;
  employeeId?: string | null;
  period: string;
  /** Об'єкти, привʼязані саме до цієї ролі (її зона відповідальності). */
  attributedObjects?: ObjectEconomy[];
  /** Для CEO: операційний прибуток компанії за період. */
  operatingProfit?: number;
  /** Затверджені KPI-надбавки та інші додавання. */
  additions?: number;
  deductions?: number;
};

export type RoleCompResult = {
  role: CompRole;
  employeeId: string | null;
  period: string;
  engineVersion: string;
  base: number | null;
  /** Attributed Eligible GP: сума GP лише по об'єктах ролі. */
  eligibleGp: number;
  variablePercent: number | null;
  variable: number | null;
  additions: number;
  deductions: number;
  accrued: number | null;
  /** Коди правил, яких бракує для повного розрахунку. */
  needsRule: string[];
  objects: { orderId: string; grossProfit: number }[];
};

/** Attributed Eligible GP ролі: валовий прибуток її об'єктів, без накладних компанії. */
export function eligibleGp(objects: ObjectEconomy[] | undefined): number {
  return r2((objects ?? []).reduce((s, o) => s + num(o.grossProfit), 0));
}

export function computeRoleCompensation(
  input: RoleCompInput,
  rules: FinanceRule[],
  on: string | Date = `${input.period}-01`,
): RoleCompResult {
  const needsRule: string[] = [];
  const baseCode = BASE_RULE[input.role];
  const varCode = VARIABLE_RULE[input.role];

  const base = baseCode ? ruleNumber(rules, "compensation", baseCode, on) : null;
  if (baseCode && base === null) needsRule.push(baseCode);

  const gp = eligibleGp(input.attributedObjects);
  const pct = varCode ? rulePercent(rules, "compensation", varCode, on) : null;
  if (varCode && pct === null) needsRule.push(varCode);

  let variable: number | null = null;
  if (pct !== null) {
    const basis = input.role === "ceo" ? num(input.operatingProfit) : gp;
    variable = r2(Math.max(0, basis) * pct);
  }

  const additions = r2(num(input.additions));
  const deductions = r2(num(input.deductions));
  const accrued =
    needsRule.length > 0 ? null : r2(num(base) + num(variable) + additions - deductions);

  return {
    role: input.role,
    employeeId: input.employeeId ?? null,
    period: input.period,
    engineVersion: FINANCE_CORE_VERSION,
    base,
    eligibleGp: gp,
    variablePercent: pct === null ? null : r2(pct * 100),
    variable,
    additions,
    deductions,
    accrued,
    needsRule,
    objects: (input.attributedObjects ?? []).map((o) => ({
      orderId: o.orderId,
      grossProfit: o.grossProfit,
    })),
  };
}

/** Сумарна змінна частина ролей для рядка `roleVariable` у водоспаді. */
export function totalRoleVariable(results: RoleCompResult[]): number {
  return r2(results.reduce((s, r) => s + num(r.variable), 0));
}
