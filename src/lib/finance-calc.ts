/** Детермінована фінансова математика. Округлення — лише на виводі сум. */

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type InvoiceLine = { qty: number; price: number };
export type PaymentRow = { amount: number; direction: "in" | "out" };
export type ExpenseRow = { amount: number };

export function invoiceTotal(lines: InvoiceLine[]): number {
  return round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
}

export function paidSum(payments: PaymentRow[]): number {
  return round2(payments.filter((p) => p.direction === "in").reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

export function debt(total: number, paid: number): number {
  return round2(Math.max(0, (Number(total) || 0) - (Number(paid) || 0)));
}

export type Pnl = {
  revenuePlan: number;
  revenueFact: number;
  costPlan: number;
  costFact: number;
  profitPlan: number;
  profitFact: number;
  marginPlan: number;
  marginFact: number;
  deviation: number;
};

/** План — з кошторисів, факт — з оплат і витрат. Маржа = (ціна − собівартість) / ціна × 100. */
export function orderPnl(input: {
  estimateTotal: number;
  estimateCost: number;
  payments: PaymentRow[];
  expenses: ExpenseRow[];
}): Pnl {
  const revenuePlan = round2(input.estimateTotal);
  const costPlan = round2(input.estimateCost);
  const revenueFact = paidSum(input.payments);
  const costFact = round2(input.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const profitPlan = round2(revenuePlan - costPlan);
  const profitFact = round2(revenueFact - costFact);
  return {
    revenuePlan,
    revenueFact,
    costPlan,
    costFact,
    profitPlan,
    profitFact,
    marginPlan: revenuePlan > 0 ? round2((profitPlan / revenuePlan) * 100) : 0,
    marginFact: revenueFact > 0 ? round2((profitFact / revenueFact) * 100) : 0,
    deviation: round2(profitFact - profitPlan),
  };
}

/** Залишок по рахунку компанії. */
export function accountBalance(opening: number, payments: PaymentRow[], expenses: ExpenseRow[]): number {
  const inflow = payments.filter((p) => p.direction === "in").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const outflow = payments.filter((p) => p.direction === "out").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const spent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return round2((Number(opening) || 0) + inflow - outflow - spent);
}

export const INVOICE_KIND_LABELS: Record<string, string> = {
  advance: "Аванс",
  stage: "Проміжний",
  final: "Фінальний",
  other: "Інший",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  issued: "Виставлено",
  partial: "Часткова оплата",
  paid: "Оплачено",
  overdue: "Прострочено",
  cancelled: "Скасовано",
};

export const EXPENSE_CATEGORIES: { key: string; label: string }[] = [
  { key: "materials", label: "Матеріали / закупівля" },
  { key: "labor", label: "Оплата бригад / ФОП" },
  { key: "logistics", label: "Логістика" },
  { key: "equipment", label: "Обладнання" },
  { key: "overhead", label: "Накладні" },
  { key: "other", label: "Інше" },
];

export const ACCOUNT_KINDS: Record<string, string> = {
  cash: "Готівка",
  bank: "Безготівка",
  fop: "ФОП",
};
