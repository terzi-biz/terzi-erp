/**
 * Canonical Finance Core — єдина детермінована математика фактичних грошей.
 *
 * Правила (незмінні):
 *  - `finance_transactions` (Finmap) — єдине джерело фактичного руху грошей;
 *  - `income` = фактичний дохід, `expense` = фактична витрата,
 *    `transfer` = переміщення власних грошей і НЕ впливає на revenue/expense/profit;
 *  - legacy `payments/expenses/invoices` ніколи не додаються до факту Finmap
 *    (інакше подвійний облік) — вони лишаються довідково;
 *  - plan revenue береться з ОДНОГО канонічного кошторису, а не з суми версій;
 *  - округлення — тільки на фінальному кроці.
 *
 * Модуль чистий: без БД, без побічних ефектів, повністю тестований.
 */

export const r2 = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;
const num = (v: unknown): number => Number(v) || 0;

/* ------------------------------ 1. Факт ------------------------------ */

export type TxKind = "income" | "expense" | "transfer";

export type CoreTx = {
  kind?: string | null;
  amount?: unknown;
  amount_uah?: unknown;
  order_id?: string | null;
  client_id?: string | null;
  category_id?: string | null;
  op_date?: string | null;
};

/** Сума операції в гривні: amount_uah має пріоритет над валютною сумою. */
export function txAmount(t: CoreTx): number {
  return num(t.amount_uah ?? t.amount);
}

export type CashAggregate = {
  income: number;
  expense: number;
  transfers: number;
  profit: number;
  margin: number;
  count: number;
};

/** Агрегат фактичних грошей. Перекази свідомо виключені з P&L. */
export function aggregateCash(rows: CoreTx[]): CashAggregate {
  let income = 0, expense = 0, transfers = 0;
  for (const t of rows) {
    const v = txAmount(t);
    if (t.kind === "income") income += v;
    else if (t.kind === "expense") expense += v;
    else if (t.kind === "transfer") transfers += v;
  }
  const profit = income - expense;
  return {
    income: r2(income),
    expense: r2(expense),
    transfers: r2(transfers),
    profit: r2(profit),
    margin: income > 0 ? r2((profit / income) * 100) : 0,
    count: rows.length,
  };
}

/* --------------------- 2. Канонічний кошторис (план) --------------------- */

export type EstimateLike = {
  id?: string;
  status?: string | null;
  total_client?: unknown;
  total_cost?: unknown;
  approved_at?: string | null;
  created_at?: string | null;
};

/**
 * Пріоритет статусів: договір/затверджено > прийнято > надіслано >
 * робочі статуси > попередній > чернетка. Відмова й архів — лише як останній шанс.
 */
export const ESTIMATE_RANK: Record<string, number> = {
  contract: 100,
  approved: 95,
  accepted: 90,
  final: 80,
  inwork: 75,
  done: 70,
  sent: 60,
  aftermeasure: 50,
  preliminary: 40,
  draft: 20,
  archived: -10,
  refused: -20,
  cancelled: -20,
};

const rankOf = (e: EstimateLike): number => ESTIMATE_RANK[String(e.status ?? "").toLowerCase()] ?? 30;
const timeOf = (e: EstimateLike): string => String(e.approved_at ?? e.created_at ?? "");

/** Один канонічний кошторис замовлення. Версії НЕ сумуються. */
export function pickCanonicalEstimate<T extends EstimateLike>(list: T[]): T | null {
  if (!list.length) return null;
  const live = list.filter((e) => rankOf(e) >= 0);
  const pool = live.length ? live : list;
  return [...pool].sort((a, b) => {
    const d = rankOf(b) - rankOf(a);
    if (d !== 0) return d;
    return timeOf(b).localeCompare(timeOf(a));
  })[0] ?? null;
}

export type PlanFigures = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  estimateId: string | null;
  status: string | null;
  versions: number;
};

/** План замовлення з одного канонічного кошторису. */
export function planFromEstimates(list: EstimateLike[]): PlanFigures {
  const canonical = pickCanonicalEstimate(list);
  const revenue = r2(num(canonical?.total_client));
  const cost = r2(num(canonical?.total_cost));
  const profit = r2(revenue - cost);
  return {
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? r2((profit / revenue) * 100) : 0,
    estimateId: canonical?.id ?? null,
    status: canonical?.status ?? null,
    versions: list.length,
  };
}

export type OrderFinanceFigures = {
  plan: { revenue: number; cost: number; profit: number; margin: number };
  fact: { revenue: number; cost: number; profit: number; margin: number };
  variance: { revenue: number; cost: number; profit: number };
  canonicalEstimateId: string | null;
  canonicalEstimateStatus: string | null;
  estimateVersions: number;
  transfers: number;
};

/** План/факт одного замовлення: план — канонічний кошторис, факт — Finmap. */
export function orderFinance(input: { estimates: EstimateLike[]; transactions: CoreTx[] }): OrderFinanceFigures {
  const plan = planFromEstimates(input.estimates);
  const cash = aggregateCash(input.transactions);
  const factRevenue = cash.income;
  const factCost = cash.expense;
  const factProfit = r2(factRevenue - factCost);
  return {
    plan: { revenue: plan.revenue, cost: plan.cost, profit: plan.profit, margin: plan.margin },
    fact: {
      revenue: factRevenue,
      cost: factCost,
      profit: factProfit,
      margin: factRevenue > 0 ? r2((factProfit / factRevenue) * 100) : 0,
    },
    variance: {
      revenue: r2(factRevenue - plan.revenue),
      cost: r2(factCost - plan.cost),
      profit: r2(factProfit - plan.profit),
    },
    canonicalEstimateId: plan.estimateId,
    canonicalEstimateStatus: plan.status,
    estimateVersions: plan.versions,
    transfers: cash.transfers,
  };
}

/* --------------------- 3. Договір, графік, дебіторка --------------------- */

export const STAGE_STATUSES = ["planned", "due", "partially_paid", "paid", "overdue", "cancelled"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  planned: "Заплановано",
  due: "Настав строк",
  partially_paid: "Часткова оплата",
  paid: "Оплачено",
  overdue: "Прострочено",
  cancelled: "Скасовано",
};

export type StageInput = {
  id?: string;
  name: string;
  amount?: unknown;
  percent?: unknown;
  planned_date?: string | null;
  due_date?: string | null;
  trigger?: string | null;
  status?: string | null;
  notes?: string | null;
};

export type ComputedStage = {
  id: string | null;
  name: string;
  amount: number;
  percent: number | null;
  planned_date: string | null;
  due_date: string | null;
  trigger: string | null;
  notes: string | null;
  paid: number;
  remaining: number;
  status: StageStatus;
  dateRef: string | null;
};

/** Сума етапу: фіксована сума або відсоток від суми договору. Аванс 50% не припускаємо. */
export function stageAmount(stage: StageInput, contracted: number): number {
  const fixed = stage.amount == null || stage.amount === "" ? null : num(stage.amount);
  if (fixed != null && fixed > 0) return r2(fixed);
  const pct = stage.percent == null || stage.percent === "" ? null : num(stage.percent);
  if (pct != null && pct > 0) return r2((contracted * pct) / 100);
  return 0;
}

const dateRefOf = (s: StageInput): string | null => s.due_date || s.planned_date || null;

export type ReceivablesInput = {
  contractAmount?: unknown;
  approvedExtras?: unknown;
  receipts?: unknown;
  refunds?: unknown;
  stages?: StageInput[];
  today?: string;
};

export type ReceivablesResult = {
  hasContract: boolean;
  contractedRevenue: number;
  received: number;
  refunds: number;
  netReceived: number;
  remainingContractBalance: number;
  dueNow: number;
  overdue: number;
  scheduled: number;
  unscheduled: number;
  nextExpected: { name: string; date: string | null; amount: number } | null;
  stages: ComputedStage[];
};

/**
 * Дебіторка по договору. Received / Remaining / Due Now / Overdue / Next —
 * різні величини: увесь залишок договору НЕ є прострочкою.
 */
export function computeReceivables(input: ReceivablesInput): ReceivablesResult {
  const contract = num(input.contractAmount);
  const extras = num(input.approvedExtras);
  const contracted = r2(contract + extras);
  const hasContract = input.contractAmount != null && input.contractAmount !== "" && contract > 0;

  const received = r2(num(input.receipts));
  const refunds = r2(num(input.refunds));
  const netReceived = r2(received - refunds);
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  const raw = (input.stages ?? []).filter(Boolean);
  const prepared = raw.map((s) => ({
    src: s,
    amount: stageAmount(s, contracted),
    dateRef: dateRefOf(s),
    cancelled: String(s.status ?? "") === "cancelled",
  }));

  // Розподіл фактичних надходжень по етапах — за черговістю строків (FIFO).
  const order = prepared
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = a.p.dateRef ?? "9999-12-31";
      const db = b.p.dateRef ?? "9999-12-31";
      return da === db ? a.i - b.i : da.localeCompare(db);
    });

  let pool = Math.max(netReceived, 0);
  const paidByIndex = new Map<number, number>();
  for (const { p, i } of order) {
    if (p.cancelled || p.amount <= 0) { paidByIndex.set(i, 0); continue; }
    const take = Math.min(pool, p.amount);
    paidByIndex.set(i, r2(take));
    pool = r2(pool - take);
  }

  const stages: ComputedStage[] = prepared.map((p, i) => {
    const paid = paidByIndex.get(i) ?? 0;
    const remaining = r2(Math.max(p.amount - paid, 0));
    let status: StageStatus;
    if (p.cancelled) status = "cancelled";
    else if (p.amount > 0 && remaining <= 0) status = "paid";
    else if (p.dateRef && p.src.due_date && p.src.due_date < today) status = "overdue";
    else if (paid > 0) status = "partially_paid";
    else if (p.dateRef && p.dateRef <= today) status = "due";
    else status = "planned";
    return {
      id: p.src.id ?? null,
      name: p.src.name,
      amount: p.amount,
      percent: p.src.percent == null || p.src.percent === "" ? null : num(p.src.percent),
      planned_date: p.src.planned_date ?? null,
      due_date: p.src.due_date ?? null,
      trigger: p.src.trigger ?? null,
      notes: p.src.notes ?? null,
      paid,
      remaining,
      status,
      dateRef: p.dateRef,
    };
  });

  const active = stages.filter((s) => s.status !== "cancelled");
  const overdue = r2(active.filter((s) => s.status === "overdue").reduce((s, x) => s + x.remaining, 0));
  const dueNow = r2(
    active
      .filter((s) => s.status !== "overdue" && s.remaining > 0 && s.dateRef != null && s.dateRef <= today)
      .reduce((s, x) => s + x.remaining, 0),
  );
  const next = active
    .filter((s) => s.remaining > 0 && (s.dateRef == null || s.dateRef > today))
    .sort((a, b) => (a.dateRef ?? "9999-12-31").localeCompare(b.dateRef ?? "9999-12-31"))[0] ?? null;

  const scheduled = r2(active.reduce((s, x) => s + x.amount, 0));

  return {
    hasContract,
    contractedRevenue: contracted,
    received,
    refunds,
    netReceived,
    remainingContractBalance: r2(Math.max(contracted - netReceived, 0)),
    dueNow,
    overdue,
    scheduled,
    unscheduled: r2(contracted - scheduled),
    nextExpected: next ? { name: next.name, date: next.dateRef, amount: next.remaining } : null,
    stages,
  };
}
