/**
 * Payroll/KPI Engine — детерміновані нарахування. Жодних ставок у коді:
 * усе береться зі схеми оплати співробітника (payroll_profiles) та KPI-правил.
 *
 * Правило виплат TERZI:
 *   20-го числа  — аванс = advance_percent (за замовчуванням 50%) від місячної ставки;
 *   до 5-го числа наступного місяця — залишок ставки + підтверджені KPI + бонуси − утримання.
 */

export const PAYROLL_ENGINE_VERSION = "payroll-1.1.0";

export type KpiType =
  | "FIXED_SALARY" | "FIXED_KPI" | "PERCENT_KPI" | "SALES_MARGIN_PERCENT"
  | "OBJECT_PROFIT_PERCENT" | "PER_M2" | "PER_LM" | "PER_OBJECT"
  | "QUALITY_BONUS" | "MANUAL_BONUS" | "DEDUCTION" | "REIMBURSEMENT"
  // Розширення під затверджену матрицю KPI TERZI:
  | "SCALE_ABS"            // шкала за абсолютним значенням (валова маржа компанії → фікс. бонус)
  | "SCALE_PLAN"           // шкала за % виконання плану → фікс. бонус
  | "MARGIN_PERCENT_BY_PLAN" // % від валової маржі, ставка % залежить від % виконання плану
  | "CHECKLIST"            // чек-ліст умов: бонус повністю або пропорційно частці виконаних пунктів
  | "PER_M2_MIN_FIXED";    // ставка за м², але не менше фіксованої суми за об'єкт

/** Поріг шкали. `from` — нижня межа (абсолют або % виконання плану). */
export type KpiTier = { from: number; bonus?: number; percent?: number; label?: string };

export type KpiRule = {
  code: string;
  title: string;
  kpi_type: KpiType;
  /** Ціль (план) для відсоткових/шкальних KPI. */
  target?: number;
  /** Вага у відсотках від максимального бонусу (для FIXED_KPI/PERCENT_KPI). */
  weight?: number;
  /** Максимальний бонус за цим KPI або ставка за одиницю (м², п.м., об'єкт). */
  rate?: number;
  /** Відсоток від бази (маржа, прибуток об'єкта, продажі). */
  percent?: number;
  /** Пороги шкали для SCALE_* та MARGIN_PERCENT_BY_PLAN. */
  tiers?: KpiTier[];
  /** Мінімальна виплата за об'єкт для PER_M2_MIN_FIXED. */
  min_amount?: number;
  /** Кількість пунктів чек-ліста для CHECKLIST (за замовчуванням 1). */
  items?: number;
  /** Пояснення умов — показується у формі підтвердження KPI. */
  note?: string;
};

export type KpiFact = { code: string; actual: number; approved?: boolean; base?: number };

/** Пошук порогу шкали: найвищий поріг, який не перевищує значення. */
export function pickTier(tiers: KpiTier[] | undefined, value: number): KpiTier | undefined {
  if (!tiers?.length) return undefined;
  return [...tiers].sort((a, b) => a.from - b.from).reduce<KpiTier | undefined>(
    (acc, t) => (value >= t.from ? t : acc), undefined,
  );
}


export type PayrollInput = {
  baseSalary: number;
  advancePercent: number;      // 0..100
  kpiRules: KpiRule[];
  facts: KpiFact[];
  manualBonus?: number;
  deductions?: number;
  reimbursements?: number;
  /** Уже виплачений аванс за період (факт із Finmap або ERP). */
  advancePaid?: number;
};

export type KpiLine = {
  code: string; title: string; kpi_type: KpiType;
  target: number; actual: number; weight: number; result: number; bonus: number;
  status: "pending" | "approved";
};

export type PayrollResult = {
  engine_version: string;
  base_amount: number;
  advance_amount: number;
  kpi_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  reimbursement_amount: number;
  /** Усього нараховано за місяць (ставка + KPI + бонуси − утримання + компенсації). */
  total_payable: number;
  /** До виплати 5-го числа = total_payable − уже виплачений аванс. */
  settlement_amount: number;
  kpis: KpiLine[];
};

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

function kpiBonus(rule: KpiRule, fact: KpiFact | undefined): { result: number; bonus: number } {
  const actual = fact?.actual ?? 0;
  const target = rule.target ?? 0;
  switch (rule.kpi_type) {
    case "FIXED_KPI":
      // Виплачується повністю при досягненні цілі.
      return { result: target > 0 ? actual / target : actual > 0 ? 1 : 0, bonus: target > 0 && actual >= target ? rule.rate ?? 0 : 0 };
    case "PERCENT_KPI": {
      // Пропорційно виконанню, але не більше 100%.
      const ratio = target > 0 ? Math.min(actual / target, 1) : 0;
      return { result: ratio, bonus: (rule.rate ?? 0) * ratio };
    }
    case "SALES_MARGIN_PERCENT":
    case "OBJECT_PROFIT_PERCENT": {
      const base = fact?.base ?? actual;
      return { result: base, bonus: (base * (rule.percent ?? 0)) / 100 };
    }
    case "PER_M2":
    case "PER_LM":
    case "PER_OBJECT":
      return { result: actual, bonus: actual * (rule.rate ?? 0) };
    case "PER_M2_MIN_FIXED": {
      // Ставка за м², але не менше фіксованої суми за об'єкт (актуально для малих об'єктів).
      const byArea = actual * (rule.rate ?? 0);
      const min = rule.min_amount ?? 0;
      return { result: actual, bonus: actual > 0 ? Math.max(byArea, min) : 0 };
    }
    case "SCALE_ABS": {
      // Шкала за абсолютним фактом (напр. валова маржа компанії за місяць).
      const tier = pickTier(rule.tiers, actual);
      return { result: actual, bonus: tier?.bonus ?? 0 };
    }
    case "SCALE_PLAN": {
      // Шкала за відсотком виконання плану.
      const pct = target > 0 ? (actual / target) * 100 : 0;
      const tier = pickTier(rule.tiers, pct);
      return { result: r2(pct), bonus: tier?.bonus ?? 0 };
    }
    case "MARGIN_PERCENT_BY_PLAN": {
      // Відсоток від валової маржі; ставка % залежить від виконання плану.
      const base = fact?.base ?? actual;
      const pct = target > 0 ? (base / target) * 100 : 0;
      const tier = pickTier(rule.tiers, pct);
      const percent = tier?.percent ?? rule.percent ?? 0;
      return { result: r2(pct), bonus: (base * percent) / 100 };
    }
    case "CHECKLIST": {
      // actual = кількість виконаних пунктів чек-ліста.
      const items = rule.items && rule.items > 0 ? rule.items : 1;
      const ratio = Math.min(Math.max(actual, 0) / items, 1);
      return { result: r2(ratio), bonus: (rule.rate ?? 0) * ratio };
    }

    case "QUALITY_BONUS":
    case "MANUAL_BONUS":
      return { result: actual, bonus: actual || rule.rate || 0 };
    case "DEDUCTION":
      return { result: actual, bonus: -(actual || rule.rate || 0) };
    case "REIMBURSEMENT":
      return { result: actual, bonus: actual || rule.rate || 0 };
    case "FIXED_SALARY":
    default:
      return { result: actual, bonus: 0 };
  }
}

export function computePayroll(input: PayrollInput): PayrollResult {
  const base = Number(input.baseSalary) || 0;
  const advancePercent = Number.isFinite(input.advancePercent) ? input.advancePercent : 50;
  const advance = r2((base * advancePercent) / 100);

  const kpis: KpiLine[] = [];
  let kpiAmount = 0;
  let deductions = Number(input.deductions) || 0;
  let reimbursements = Number(input.reimbursements) || 0;

  for (const rule of input.kpiRules ?? []) {
    if (rule.kpi_type === "FIXED_SALARY") continue;
    const fact = (input.facts ?? []).find((f) => f.code === rule.code);
    const { result, bonus } = kpiBonus(rule, fact);
    const approved = fact?.approved === true;
    kpis.push({
      code: rule.code, title: rule.title, kpi_type: rule.kpi_type,
      target: rule.target ?? 0, actual: fact?.actual ?? 0, weight: rule.weight ?? 0,
      result: r2(result), bonus: r2(bonus), status: approved ? "approved" : "pending",
    });
    if (!approved) continue; // до підтвердження KPI не потрапляє в нарахування
    if (rule.kpi_type === "DEDUCTION") deductions += Math.abs(bonus);
    else if (rule.kpi_type === "REIMBURSEMENT") reimbursements += bonus;
    else kpiAmount += bonus;
  }

  const manualBonus = Number(input.manualBonus) || 0;
  const total = base + kpiAmount + manualBonus + reimbursements - deductions;
  const advancePaid = Number(input.advancePaid) || 0;

  return {
    engine_version: PAYROLL_ENGINE_VERSION,
    base_amount: r2(base),
    advance_amount: advance,
    kpi_amount: r2(kpiAmount),
    bonus_amount: r2(manualBonus),
    deduction_amount: r2(deductions),
    reimbursement_amount: r2(reimbursements),
    total_payable: r2(total),
    settlement_amount: r2(total - advancePaid),
    kpis,
  };
}

/** Дати виплат за правилом TERZI для періоду YYYY-MM. */
export function payrollScheduleFor(period: string): { advanceDate: string; settlementDate: string } {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { advanceDate: `${y}-${pad(m)}-20`, settlementDate: `${next.y}-${pad(next.m)}-05` };
}
