import { describe, it, expect } from "vitest";
import { aggregateByCounterparty } from "@/lib/finance/counterparty.functions";

describe("aggregateByCounterparty", () => {
  it("розділяє доходи/витрати і операції без контрагента", () => {
    const r = aggregateByCounterparty([
      { kind: "income", amount_uah: 1000, op_date: "2026-01-02", counterparty_id: "a", counterparty: { name: "Клієнт А" } },
      { kind: "expense", amount_uah: 400, op_date: "2026-01-03", counterparty_id: "b", counterparty: { name: "Постачальник Б" } },
      { kind: "expense", amount_uah: 100, op_date: "2026-01-04", counterparty_id: null },
    ]);
    expect(r.totals).toEqual({ income: 1000, expense: 500, net: 500, count: 3 });
    expect(r.counterparties).toHaveLength(2);
    expect(r.withoutCounterparty).toEqual({ count: 1, income: 0, expense: 100 });
    expect(r.counterparties[0]!.last_op).toBe("2026-01-02");
  });
  it("transfer не впливає на доходи і витрати", () => {
    const r = aggregateByCounterparty([{ kind: "transfer", amount_uah: 999, op_date: "2026-01-01", counterparty_id: "a", counterparty: { name: "X" } }]);
    expect(r.totals.income).toBe(0);
    expect(r.totals.expense).toBe(0);
  });
});
