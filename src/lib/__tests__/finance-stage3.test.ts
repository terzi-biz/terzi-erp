import { describe, it, expect } from "vitest";
import { dimensionStatus, overallAllocationStatus, allocationStatusByDimension, inPeriod, cashDate, managementPeriod } from "@/lib/finance/allocations";
import { computePayables } from "@/lib/finance/service-economics";

describe("управлінський період vs касова дата", () => {
  const tx = { op_date: "2026-08-20", payment_date: "2026-09-05", period_start: "2026-08-01", period_end: "2026-08-31" };
  it("витрата серпня, оплачена у вересні", () => {
    expect(cashDate(tx)).toBe("2026-09-05");
    expect(managementPeriod(tx)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(inPeriod(tx, "2026-08-01", "2026-08-31", "management")).toBe(true);
    expect(inPeriod(tx, "2026-08-01", "2026-08-31", "cash")).toBe(false);
    expect(inPeriod(tx, "2026-09-01", "2026-09-30", "cash")).toBe(true);
  });
});

describe("незалежні виміри розподілу", () => {
  it("100% проєкт + 100% стаття ≠ 200%", () => {
    const res = allocationStatusByDimension(1000, [
      { dimension: "project", amount: 1000, source: "finmap" },
      { dimension: "category", amount: 1000, source: "finmap" },
    ]);
    expect(res.byDimension.project).toBe("full");
    expect(res.byDimension.category).toBe("full");
    expect(res.byDimension.service).toBe("none");
    expect(res.overall).toBe("full");
  });

  it("ручний розподіл фіксує лише свій вимір", () => {
    expect(dimensionStatus(1000, [{ amount: 1000, source: "manual" }])).toBe("manual");
    expect(dimensionStatus(1000, [{ amount: 400, source: "finmap" }])).toBe("partial");
    expect(overallAllocationStatus({ project: "manual", category: "full" })).toBe("full");
    expect(overallAllocationStatus({ project: "manual" })).toBe("manual");
    expect(overallAllocationStatus({ project: "full", category: "partial" })).toBe("partial");
    expect(overallAllocationStatus({ project: "full", service: "needs_review" })).toBe("needs_review");
  });
});

describe("канонічна кредиторка", () => {
  const today = "2026-09-14";

  it("витрата стороннього постачальника не закриває зобовʼязання", () => {
    const r = computePayables({
      today,
      obligations: [{ id: "o1", counterparty_id: "c1", supplier_name: "A", amount: 50_000, due_date: "2026-09-01", status: "open" }],
      payments: [{ id: "p1", counterparty_id: "c2", amount: 50_000, date: "2026-09-02", state: "actual" }],
    });
    expect(r.totals.remaining).toBe(50_000);
    expect(r.totals.paid).toBe(0);
    expect(r.unmatchedPayments.length).toBe(1);
  });

  it("часткова оплата зменшує залишок відповідного зобовʼязання", () => {
    const r = computePayables({
      today,
      obligations: [{ id: "o1", counterparty_id: "c1", order_id: "ord1", supplier_name: "A", amount: 50_000, due_date: "2026-09-01", status: "open" }],
      payments: [{ id: "p1", obligation_id: "o1", counterparty_id: "c1", amount: 20_000, date: "2026-09-02", state: "actual" }],
    });
    expect(r.totals.paid).toBe(20_000);
    expect(r.totals.remaining).toBe(30_000);
    expect(r.totals.overdue).toBe(30_000);
    expect(r.obligations[0]!.remaining).toBe(30_000);
  });

  it("майбутній строк не прострочений, план не зменшує сплачене", () => {
    const r = computePayables({
      today,
      obligations: [{ id: "o1", counterparty_id: "c1", supplier_name: "A", amount: 10_000, due_date: "2026-10-01", status: "open" }],
      payments: [{ id: "p1", obligation_id: "o1", counterparty_id: "c1", amount: 10_000, date: "2026-10-01", state: "scheduled" }],
    });
    expect(r.totals.paid).toBe(0);
    expect(r.totals.overdue).toBe(0);
    expect(r.totals.remaining).toBe(10_000);
    // «Очікувані платежі» показують непогашений залишок, а не початкову суму
    expect(r.obligations[0]!.remaining).toBe(10_000);
  });
});
