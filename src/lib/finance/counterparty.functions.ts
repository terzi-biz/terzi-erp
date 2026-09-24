/**
 * Канонічний модуль «гроші ↔ контрагент».
 *
 * Одна серверна функція віддає доходи/витрати з `finance_transactions`
 * у розрізі контрагента для будь-якої сутності ERP: заявка, лід, клієнт,
 * замір, замовлення, контрагент. Формул тут немає — лише агрегати фактичних
 * операцій Finmap (payment ≠ revenue), тому цифри однакові в усіх модулях.
 *
 * Права: тільки фінансові ролі (`is_finance_user`), бо це internal-дані.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const num = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

export const CASHFLOW_SCOPES = ["client", "order", "lead", "measurement", "request", "counterparty"] as const;
export type CashflowScope = (typeof CASHFLOW_SCOPES)[number];

export type CounterpartyRow = {
  counterparty_id: string | null;
  name: string;
  kind: string | null;
  client_id: string | null;
  income: number;
  expense: number;
  net: number;
  count: number;
  last_op: string | null;
};

export type CashflowTx = {
  id: string;
  kind: string;
  amount: number;
  op_date: string;
  comment: string | null;
  counterparty: string | null;
  counterparty_id: string | null;
  category: string | null;
  account: string | null;
  order_id: string | null;
  match_status: string;
};

export type CashflowResult = {
  scope: CashflowScope;
  resolved: { order_id: string | null; client_id: string | null; counterparty_id: string | null };
  access: boolean;
  totals: { income: number; expense: number; net: number; count: number };
  counterparties: CounterpartyRow[];
  transactions: CashflowTx[];
  /** Операції без контрагента — їх не можна приписати постачальнику/клієнту. */
  withoutCounterparty: { count: number; income: number; expense: number };
  note?: string;
};

const EMPTY = (scope: CashflowScope, note?: string): CashflowResult => ({
  scope,
  resolved: { order_id: null, client_id: null, counterparty_id: null },
  access: true,
  totals: { income: 0, expense: 0, net: 0, count: 0 },
  counterparties: [],
  transactions: [],
  withoutCounterparty: { count: 0, income: 0, expense: 0 },
  ...(note ? { note } : {}),
});

async function isFinance(context: any) {
  const { data } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  return data === true;
}

/** Зводить будь-яку сутність ERP до канонічних фільтрів фінансів. */
async function resolveScope(sb: any, scope: CashflowScope, id: string) {
  if (scope === "client") return { client_id: id, order_id: null, counterparty_id: null };
  if (scope === "order") return { order_id: id, client_id: null, counterparty_id: null };
  if (scope === "counterparty") return { counterparty_id: id, order_id: null, client_id: null };

  if (scope === "lead") {
    const { data } = await sb.from("crm_leads").select("order_id,client_id").eq("id", id).maybeSingle();
    return { order_id: data?.order_id ?? null, client_id: data?.client_id ?? null, counterparty_id: null };
  }
  if (scope === "measurement") {
    const { data } = await sb.from("order_measurements").select("order_id,client_id,lead_id").eq("id", id).maybeSingle();
    if (data?.order_id || data?.client_id) return { order_id: data.order_id ?? null, client_id: data.client_id ?? null, counterparty_id: null };
    if (data?.lead_id) return resolveScope(sb, "lead", data.lead_id);
    return { order_id: null, client_id: null, counterparty_id: null };
  }
  // request → lead → order/client
  const { data } = await sb.from("crm_requests").select("lead_id").eq("id", id).maybeSingle();
  if (data?.lead_id) return resolveScope(sb, "lead", data.lead_id);
  return { order_id: null, client_id: null, counterparty_id: null };
}

/** Агрегація рядків операцій у розріз контрагентів. Чиста функція — покрита тестами. */
export function aggregateByCounterparty(rows: any[]): {
  totals: CashflowResult["totals"];
  counterparties: CounterpartyRow[];
  withoutCounterparty: CashflowResult["withoutCounterparty"];
} {
  const map = new Map<string, CounterpartyRow>();
  let income = 0, expense = 0;
  const noCp = { count: 0, income: 0, expense: 0 };

  for (const t of rows) {
    const money = num(t.amount_uah ?? t.amount);
    const isIncome = t.kind === "income";
    const isExpense = t.kind === "expense";
    if (isIncome) income += money;
    if (isExpense) expense += money;

    const cp = t.counterparty ?? null;
    if (!t.counterparty_id) {
      noCp.count += 1;
      if (isIncome) noCp.income = r2(noCp.income + money);
      if (isExpense) noCp.expense = r2(noCp.expense + money);
      continue;
    }
    const key = t.counterparty_id as string;
    const cur = map.get(key) ?? {
      counterparty_id: key,
      name: cp?.name ?? "Без назви",
      kind: cp?.kind ?? null,
      client_id: cp?.client_id ?? null,
      income: 0, expense: 0, net: 0, count: 0, last_op: null,
    };
    if (isIncome) cur.income = r2(cur.income + money);
    if (isExpense) cur.expense = r2(cur.expense + money);
    cur.count += 1;
    if (!cur.last_op || String(t.op_date) > cur.last_op) cur.last_op = t.op_date;
    cur.net = r2(cur.income - cur.expense);
    map.set(key, cur);
  }

  const counterparties = [...map.values()].sort(
    (a, b) => Math.max(b.income, b.expense) - Math.max(a.income, a.expense),
  );
  return {
    totals: { income: r2(income), expense: r2(expense), net: r2(income - expense), count: rows.length },
    counterparties,
    withoutCounterparty: noCp,
  };
}

export const getCounterpartyCashflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      scope: z.enum(CASHFLOW_SCOPES),
      id: z.string().uuid(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashflowResult> => {
    if (!(await isFinance(context))) return { ...EMPTY(data.scope), access: false };

    const sb = context.supabase;
    const resolved = await resolveScope(sb, data.scope, data.id);
    if (!resolved.order_id && !resolved.client_id && !resolved.counterparty_id) {
      return { ...EMPTY(data.scope, "Немає звʼязку із замовленням, клієнтом або контрагентом"), resolved };
    }

    let q = sb
      .from("finance_transactions")
      .select(
        "id,kind,amount,amount_uah,op_date,comment,order_id,match_status,counterparty_id," +
          "counterparty:counterparty_id(id,name,kind,client_id),category:category_id(name),account:account_id(name)",
      )
      .order("op_date", { ascending: false })
      .limit(data.limit ?? 300);

    if (resolved.order_id) q = q.eq("order_id", resolved.order_id);
    else if (resolved.client_id) q = q.eq("client_id", resolved.client_id);
    else q = q.eq("counterparty_id", resolved.counterparty_id!);

    const { data: rows, error } = await q;
    if (error) throw new Error(`Операції: ${error.message}`);
    const list = (rows ?? []) as any[];
    const agg = aggregateByCounterparty(list);

    return {
      scope: data.scope,
      resolved,
      access: true,
      ...agg,
      transactions: list.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: r2(num(t.amount_uah ?? t.amount)),
        op_date: t.op_date,
        comment: t.comment ?? null,
        counterparty: t.counterparty?.name ?? null,
        counterparty_id: t.counterparty_id ?? null,
        category: t.category?.name ?? null,
        account: t.account?.name ?? null,
        order_id: t.order_id ?? null,
        match_status: t.match_status,
      })),
    };
  });

export type CounterpartyLedgerRow = CounterpartyRow & {
  client_name: string | null;
  orders: number;
  match_source: string | null;
};

/** Реєстр контрагентів за період: доходи, витрати, привʼязка до клієнта й обʼєктів. */
export const listCounterpartyLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string(), to: z.string(), search: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isFinance(context))) {
      return { access: false, rows: [] as CounterpartyLedgerRow[], totals: { income: 0, expense: 0, net: 0, count: 0 }, unlinked: { count: 0, income: 0, expense: 0 } };
    }
    const sb = context.supabase;
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("finance_transactions")
        .select("id,kind,amount,amount_uah,op_date,order_id,counterparty_id,client_id,counterparty:counterparty_id(id,name,kind,client_id,match_source,client:client_id(name))")
        .gte("op_date", data.from)
        .lte("op_date", data.to)
        .range(from, from + 999);
      if (error) throw new Error(`Операції: ${error.message}`);
      const list = (page ?? []) as any[];
      rows.push(...list);
      if (list.length < 1000) break;
    }

    const agg = aggregateByCounterparty(rows);
    const orders = new Map<string, Set<string>>();
    const extra = new Map<string, any>();
    for (const t of rows) {
      if (!t.counterparty_id) continue;
      extra.set(t.counterparty_id, t.counterparty);
      if (t.order_id) {
        const set = orders.get(t.counterparty_id) ?? new Set<string>();
        set.add(t.order_id);
        orders.set(t.counterparty_id, set);
      }
    }

    const q = (data.search ?? "").trim().toLowerCase();
    const ledger: CounterpartyLedgerRow[] = agg.counterparties
      .map((c) => ({
        ...c,
        client_name: extra.get(c.counterparty_id!)?.client?.name ?? null,
        match_source: extra.get(c.counterparty_id!)?.match_source ?? null,
        orders: orders.get(c.counterparty_id!)?.size ?? 0,
      }))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) || (c.client_name ?? "").toLowerCase().includes(q) : true));

    return { access: true, rows: ledger, totals: agg.totals, unlinked: agg.withoutCounterparty };
  });
