/**
 * Finance Core v3 — версіоновані фінансові правила.
 *
 * Жодної ставки, відсотка чи порога в UI: усі змінні величини живуть у
 * `finance_rules` і читаються за датою періоду (`effective_from`/`effective_to`).
 * Модуль чистий: без БД і побічних ефектів, повністю тестований.
 */

export const FINANCE_CORE_VERSION = "finance-core-3.0.0";

export const RULE_SCOPES = ["compensation", "overhead", "reserve", "tax", "amortization"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export type FinanceRule = {
  scope: string;
  code: string;
  label?: string | null;
  value_num?: number | string | null;
  value_text?: string | null;
  value_json?: unknown;
  unit?: string | null;
  effective_from: string;
  effective_to?: string | null;
  archived_at?: string | null;
};

const day = (v: string | Date): string =>
  typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);

/** Чи діяло правило на вказану дату. */
export function isEffectiveOn(rule: FinanceRule, on: string | Date): boolean {
  if (rule.archived_at) return false;
  const d = day(on);
  if (day(rule.effective_from) > d) return false;
  if (rule.effective_to && day(rule.effective_to) < d) return false;
  return true;
}

/**
 * Правило, чинне на дату. Якщо кілька версій перекриваються —
 * перемагає найпізніше `effective_from` (детерміновано, без випадковості).
 */
export function resolveRule(
  rules: FinanceRule[],
  scope: string,
  code: string,
  on: string | Date,
): FinanceRule | null {
  const matches = rules
    .filter((r) => r.scope === scope && r.code === code && isEffectiveOn(r, on))
    .sort((a, b) => day(b.effective_from).localeCompare(day(a.effective_from)));
  return matches[0] ?? null;
}

/**
 * Числове значення правила на дату. Повертає `null`, коли правило не задане —
 * відсутнє значення НІКОЛИ не підмінюється нулем чи вигаданою ставкою.
 */
export function ruleNumber(
  rules: FinanceRule[],
  scope: string,
  code: string,
  on: string | Date,
): number | null {
  const r = resolveRule(rules, scope, code, on);
  if (!r || r.value_num === null || r.value_num === undefined) return null;
  const n = Number(r.value_num);
  return Number.isFinite(n) ? n : null;
}

/** Частка з відсоткового правила: 8 → 0.08. `null`, якщо правило не задане. */
export function rulePercent(
  rules: FinanceRule[],
  scope: string,
  code: string,
  on: string | Date,
): number | null {
  const n = ruleNumber(rules, scope, code, on);
  return n === null ? null : n / 100;
}

/** Коди правил, без яких розрахунок неможливий. */
export function missingRules(
  rules: FinanceRule[],
  required: { scope: string; code: string }[],
  on: string | Date,
): string[] {
  return required
    .filter(({ scope, code }) => ruleNumber(rules, scope, code, on) === null)
    .map(({ code }) => code);
}
