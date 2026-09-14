/**
 * Розподіли операцій Finmap по проєктах / статтях / послугах.
 *
 * Пріоритет (без здогадок):
 *  1. явний розподіл Finmap (projectObjects / categoryObjects);
 *  2. ручний розподіл TERZI (finance_allocations.source = 'manual');
 *  3. детермінований мапінг TERZI (проєкт Finmap → замовлення);
 *  4. нерозподілено (unallocated) — ніколи не «вішаємо» всю суму навмання.
 *
 * Модуль чистий: без БД і побічних ефектів.
 */

import { r2 } from "./core";

const num = (v: unknown): number => Number(v) || 0;

export type RawPart = {
  id?: unknown;
  name?: unknown;
  /** частка у відсотках (Finmap stake / share / percent) */
  share?: unknown;
  /** абсолютна сума (Finmap sum / amount) */
  sum?: unknown;
};

export type SplitPart = {
  ref: string | null;
  name: string | null;
  amount: number;
  share: number | null;
};

/**
 * Детермінований поділ суми між частинами.
 * Абсолютні суми мають пріоритет над частками; залишок округлення — на останню частину.
 * Нерозподілений залишок повертається окремо (ref = null не створюється автоматично).
 */
export function splitAmount(total: unknown, parts: RawPart[]): { parts: SplitPart[]; unallocated: number } {
  const sum = r2(num(total));
  const list = (parts ?? []).filter(Boolean);
  if (!list.length || sum === 0) return { parts: [], unallocated: sum };

  const hasSums = list.some((p) => num(p.sum) > 0);
  const out: SplitPart[] = [];

  if (hasSums) {
    for (const p of list) {
      const amount = r2(num(p.sum));
      if (amount === 0) continue;
      out.push({
        ref: p.id == null ? null : String(p.id),
        name: p.name == null ? null : String(p.name),
        amount,
        share: sum !== 0 ? r2((amount / sum) * 100) : null,
      });
    }
  } else {
    const shares = list.map((p) => num(p.share));
    const totalShare = shares.reduce((s, v) => s + v, 0);
    if (totalShare <= 0) return { parts: [], unallocated: sum };
    let acc = 0;
    list.forEach((p, i) => {
      const share = shares[i] ?? 0;
      if (share <= 0) return;
      const last = i === list.length - 1;
      const amount = last ? r2(sum - acc) : r2((sum * share) / totalShare);
      acc = r2(acc + amount);
      out.push({
        ref: p.id == null ? null : String(p.id),
        name: p.name == null ? null : String(p.name),
        amount,
        share: r2((share / totalShare) * 100),
      });
    });
  }

  const allocated = r2(out.reduce((s, p) => s + p.amount, 0));
  return { parts: out, unallocated: r2(sum - allocated) };
}

/** Нормалізує масив об'єктів Finmap (різні назви полів у різних сутностях). */
export function normalizeFinmapParts(raw: unknown): RawPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => {
      if (r == null) return null;
      if (typeof r === "string") return { id: r } as RawPart;
      return {
        id: r.id ?? r.projectId ?? r.categoryId ?? r.tagId ?? null,
        name: r.name ?? r.label ?? r.title ?? null,
        share: r.stake ?? r.share ?? r.percent ?? null,
        sum: r.sum ?? r.amount ?? null,
      } as RawPart;
    })
    .filter(Boolean) as RawPart[];
}

export type ResolvedAllocation = {
  dimension: "project" | "category" | "service";
  ref: string | null;
  name: string | null;
  amount: number;
  share: number | null;
  source: "finmap" | "manual" | "deterministic";
  status: "ok" | "needs_review";
};

export type ResolveInput = {
  total: unknown;
  /** розподіл з Finmap (projectObjects / categoryObjects) */
  finmap?: RawPart[];
  /** ручний розподіл TERZI (має пріоритет над детермінованим мапінгом) */
  manual?: { ref: string | null; name?: string | null; amount?: unknown; share?: unknown }[];
  /** детермінований fallback: один ref на всю суму (наприклад, проєкт Finmap → замовлення) */
  deterministic?: { ref: string | null; name?: string | null } | null;
  dimension: "project" | "category" | "service";
};

/** Повертає розподіл суми з дотриманням пріоритету джерел. Нічого не вигадує. */
export function resolveAllocations(input: ResolveInput): { allocations: ResolvedAllocation[]; unallocated: number } {
  const total = r2(num(input.total));
  const mk = (p: SplitPart, source: ResolvedAllocation["source"]): ResolvedAllocation => ({
    dimension: input.dimension,
    ref: p.ref,
    name: p.name,
    amount: p.amount,
    share: p.share,
    source,
    status: "ok",
  });

  const fin = splitAmount(total, input.finmap ?? []);
  if (fin.parts.length) return { allocations: fin.parts.map((p) => mk(p, "finmap")), unallocated: fin.unallocated };

  const man = splitAmount(
    total,
    (input.manual ?? []).map((m) => ({ id: m.ref, name: m.name, sum: m.amount, share: m.share })),
  );
  if (man.parts.length) return { allocations: man.parts.map((p) => mk(p, "manual")), unallocated: man.unallocated };

  if (input.deterministic?.ref) {
    return {
      allocations: [
        {
          dimension: input.dimension,
          ref: input.deterministic.ref,
          name: input.deterministic.name ?? null,
          amount: total,
          share: 100,
          source: "deterministic",
          status: "ok",
        },
      ],
      unallocated: 0,
    };
  }

  return { allocations: [], unallocated: total };
}

/** Стан розподілу операції для звірки. */
export function allocationStatus(total: unknown, allocations: { amount: number }[]): "none" | "partial" | "full" {
  const sum = r2(num(total));
  const alloc = r2(allocations.reduce((s, a) => s + a.amount, 0));
  if (alloc <= 0) return "none";
  if (Math.abs(sum - alloc) <= 0.01) return "full";
  return "partial";
}

/* ---------------- Касова дата vs управлінський період ---------------- */

export type PeriodTx = {
  op_date?: string | null;
  payment_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

/** Дата руху грошей (Cash Flow). */
export function cashDate(t: PeriodTx): string | null {
  return (t.payment_date ?? t.op_date ?? null) as string | null;
}

/** Економічний період операції (Management P&L). Зарплата за серпень, оплачена у вересні, лишається серпневою. */
export function managementPeriod(t: PeriodTx): { start: string | null; end: string | null } {
  const start = t.period_start ?? t.op_date ?? t.payment_date ?? null;
  const end = t.period_end ?? t.period_start ?? t.op_date ?? t.payment_date ?? null;
  return { start: start as string | null, end: end as string | null };
}

/** Чи потрапляє операція в період за обраною базою. */
export function inPeriod(t: PeriodTx, from: string, to: string, basis: "cash" | "management" = "cash"): boolean {
  if (basis === "cash") {
    const d = cashDate(t);
    return !!d && d >= from && d <= to;
  }
  const { start, end } = managementPeriod(t);
  if (!start) return false;
  return start <= to && (end ?? start) >= from;
}
