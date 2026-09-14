import { describe, it, expect } from "vitest";
import {
  splitAmount, normalizeFinmapParts, resolveAllocations, allocationStatus,
  cashDate, managementPeriod, inPeriod,
} from "@/lib/finance/allocations";
import { reconcileScheduled, actualOnly, upcomingBuckets, isScheduled } from "@/lib/finance/scheduled";
import { serviceEconomics, isDirectCost, computePayable } from "@/lib/finance/service-economics";
import { aggregateCash } from "@/lib/finance/core";

describe("розподіли Finmap", () => {
  it("розподіляє суму за частками без втрат", () => {
    const { parts, unallocated } = splitAmount(100_000, [
      { id: "A", share: 60 },
      { id: "B", share: 40 },
    ]);
    expect(parts.map((p) => p.amount)).toEqual([60_000, 40_000]);
    expect(unallocated).toBe(0);
  });

  it("абсолютні суми мають пріоритет, залишок видно окремо", () => {
    const { parts, unallocated } = splitAmount(100, [{ id: "A", sum: 70 }]);
    expect(parts[0]!.amount).toBe(70);
    expect(unallocated).toBe(30);
  });

  it("розподіл по статтях не губиться при нерівних частках", () => {
    const { parts, unallocated } = splitAmount(1000, [
      { id: "c1", share: 33 },
      { id: "c2", share: 33 },
      { id: "c3", share: 34 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1000);
    expect(unallocated).toBe(0);
  });

  it("нормалізує обʼєкти Finmap із різними назвами полів", () => {
    expect(normalizeFinmapParts([{ projectId: "p1", stake: 50 }, "p2"])).toEqual([
      { id: "p1", name: null, share: 50, sum: null },
      { id: "p2" },
    ]);
  });

  it("пріоритет: Finmap > ручний > детермінований", () => {
    const base = { total: 1000, dimension: "project" as const };
    const fin = resolveAllocations({ ...base, finmap: [{ id: "p1", share: 100 }], manual: [{ ref: "m1", amount: 1000 }], deterministic: { ref: "d1" } });
    expect(fin.allocations[0]!.source).toBe("finmap");
    const man = resolveAllocations({ ...base, manual: [{ ref: "m1", amount: 1000 }], deterministic: { ref: "d1" } });
    expect(man.allocations[0]!.source).toBe("manual");
    const det = resolveAllocations({ ...base, deterministic: { ref: "d1" } });
    expect(det.allocations[0]!.source).toBe("deterministic");
    const none = resolveAllocations(base);
    expect(none.allocations).toHaveLength(0);
    expect(none.unallocated).toBe(1000);
  });

  it("стан розподілу", () => {
    expect(allocationStatus(100, [])).toBe("none");
    expect(allocationStatus(100, [{ amount: 60 }])).toBe("partial");
    expect(allocationStatus(100, [{ amount: 60 }, { amount: 40 }])).toBe("full");
  });
});

describe("касова дата vs управлінський період", () => {
  const salary = { op_date: "2026-08-31", payment_date: "2026-09-05", period_start: "2026-08-01", period_end: "2026-08-31" };

  it("оплата вересня, період серпня", () => {
    expect(cashDate(salary)).toBe("2026-09-05");
    expect(managementPeriod(salary)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(inPeriod(salary, "2026-09-01", "2026-09-30", "cash")).toBe(true);
    expect(inPeriod(salary, "2026-09-01", "2026-09-30", "management")).toBe(false);
    expect(inPeriod(salary, "2026-08-01", "2026-08-31", "management")).toBe(true);
  });
});

describe("планові й фактичні операції", () => {
  const scheduled = [
    { id: "s1", state: "scheduled", finmap_id: "F1", kind: "expense", amount: 5000, op_date: "2026-09-20" },
    { id: "s2", state: "scheduled", finmap_id: "F2", kind: "income", amount: 20_000, op_date: "2026-09-25" },
  ];
  const actual = [{ id: "a1", state: "actual", finmap_id: "F1", kind: "expense", amount: 5000, op_date: "2026-09-20" }];

  it("планові не потрапляють у факт", () => {
    const all = [...scheduled, ...actual];
    const cash = aggregateCash(actualOnly(all));
    expect(cash.expense).toBe(5000);
    expect(cash.income).toBe(0);
    expect(all.filter(isScheduled)).toHaveLength(2);
  });

  it("scheduled → actual без подвійного обліку", () => {
    const res = reconcileScheduled(scheduled, actual);
    expect(res.superseded).toHaveLength(1);
    expect(res.open.map((r) => r.id)).toEqual(["s2"]);
  });

  it("періоди очікуваних платежів", () => {
    const rows = [
      { id: "1", date: "2026-09-18", kind: "income", amount: 10_000, counterparty: null, category: null, order_id: null, status: "scheduled", source: "finmap" as const },
      { id: "2", date: "2026-10-05", kind: "income", amount: 5000, counterparty: null, category: null, order_id: null, status: "scheduled", source: "finmap" as const },
      { id: "3", date: "2026-09-30", kind: "expense", amount: 3000, counterparty: null, category: null, order_id: null, status: "scheduled", source: "finmap" as const },
    ];
    const b = upcomingBuckets(rows, "2026-09-14");
    expect(b.receipts.d7).toBe(10_000);
    expect(b.receipts.d30).toBe(15_000);
    expect(b.receipts.month).toBe(10_000);
    expect(b.payments.d30).toBe(3000);
  });
});

describe("економіка робіт", () => {
  it("зважена собівартість одиниці, а не середнє по обʼєктах", () => {
    const { rows } = serviceEconomics({
      lines: [
        { service: "screed", orderId: "o1", kind: "income", amount: 100_000 },
        { service: "screed", orderId: "o1", kind: "expense", amount: 60_000, costClass: "materials" },
        { service: "screed", orderId: "o2", kind: "income", amount: 20_000 },
        { service: "screed", orderId: "o2", kind: "expense", amount: 15_000, costClass: "materials" },
      ],
      quantities: [
        { service: "screed", orderId: "o1", qty: 1000, unit: "м²" },
        { service: "screed", orderId: "o2", qty: 100, unit: "м²" },
      ],
    });
    const r = rows[0]!;
    // 75 000 / 1100 = 68.18, а не (60 + 150) / 2
    expect(r.costPerUnit).toBe(68.18);
    expect(r.objects).toBe(2);
    expect(r.grossProfit).toBe(45_000);
  });

  it("нульова кількість не дає NaN", () => {
    const { rows } = serviceEconomics({
      lines: [{ service: "pvc", kind: "expense", amount: 5000, costClass: "materials" }],
      quantities: [{ service: "pvc", qty: 0, unit: "м²" }],
    });
    expect(rows[0]!.costPerUnit).toBeNull();
    expect(rows[0]!.note).toContain("Недостатньо даних");
  });

  it("змішане замовлення не приписується одній послузі", () => {
    const { rows, unallocated } = serviceEconomics({
      lines: [
        { service: "screed", orderId: "o1", kind: "expense", amount: 60_000, costClass: "materials" },
        { service: "insulation", orderId: "o1", kind: "expense", amount: 40_000, costClass: "materials" },
        { service: null, orderId: "o1", kind: "expense", amount: 10_000, costClass: "materials" },
      ],
      quantities: [],
    });
    expect(rows.find((r) => r.service === "screed")!.directCost).toBe(60_000);
    expect(rows.find((r) => r.service === "insulation")!.directCost).toBe(40_000);
    expect(unallocated.cost).toBe(10_000);
  });

  it("виробничий ФОТ — пряма витрата, офісний — ні", () => {
    expect(isDirectCost({ service: "screed", kind: "expense", amount: 1, payrollGroup: "production" })).toBe(true);
    expect(isDirectCost({ service: "screed", kind: "expense", amount: 1, payrollGroup: "administrative" })).toBe(false);
    expect(isDirectCost({ service: "screed", kind: "expense", amount: 1, costClass: "marketing" })).toBe(false);
    const { rows } = serviceEconomics({
      lines: [
        { service: "screed", kind: "expense", amount: 30_000, payrollGroup: "production" },
        { service: "screed", kind: "expense", amount: 20_000, payrollGroup: "administrative" },
      ],
      quantities: [{ service: "screed", qty: 100, unit: "м²" }],
    });
    expect(rows[0]!.directCost).toBe(30_000);
    expect(rows[0]!.fullCost).toBe(50_000);
    expect(rows[0]!.costPerUnit).toBe(300);
    expect(rows[0]!.fullCostPerUnit).toBe(500);
  });
});

describe("кредиторка", () => {
  it("витрата без зобовʼязання не створює борг", () => {
    const r = computePayable({ obligations: [], actualPaid: [{ amount: 12_000, date: "2026-09-01" }], scheduledPayments: [], today: "2026-09-14" });
    expect(r.remaining).toBe(0);
    expect(r.overdue).toBe(0);
    expect(r.paid).toBe(12_000);
  });

  it("часткова оплата постачальника", () => {
    const r = computePayable({
      obligations: [{ amount: 50_000, due_date: "2026-09-01" }],
      actualPaid: [{ amount: 20_000, date: "2026-09-02" }],
      scheduledPayments: [{ amount: 30_000 }],
      today: "2026-09-14",
    });
    expect(r.remaining).toBe(30_000);
    expect(r.overdue).toBe(30_000);
    expect(r.scheduled).toBe(30_000);
    expect(r.lastPayment).toBe("2026-09-02");
  });

  it("майбутній строк не є простроченням", () => {
    const r = computePayable({
      obligations: [{ amount: 10_000, due_date: "2026-10-01" }],
      actualPaid: [], scheduledPayments: [], today: "2026-09-14",
    });
    expect(r.remaining).toBe(10_000);
    expect(r.overdue).toBe(0);
  });
});
