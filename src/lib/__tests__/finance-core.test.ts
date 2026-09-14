import { describe, it, expect } from "vitest";
import {
  aggregateCash, orderFinance, planFromEstimates, pickCanonicalEstimate, computeReceivables,
} from "@/lib/finance/core";

describe("Finance Core — факт із Finmap", () => {
  it("переказ не впливає на P&L", () => {
    const a = aggregateCash([
      { kind: "income", amount: 1000 },
      { kind: "expense", amount: 400 },
      { kind: "transfer", amount: 50_000 },
    ]);
    expect(a.income).toBe(1000);
    expect(a.expense).toBe(400);
    expect(a.transfers).toBe(50_000);
    expect(a.profit).toBe(600);
  });

  it("дохід по замовленню → factRevenue, витрата → factCost", () => {
    const f = orderFinance({
      estimates: [],
      transactions: [
        { kind: "income", amount_uah: 300_000 },
        { kind: "expense", amount_uah: 120_000 },
        { kind: "transfer", amount_uah: 999 },
      ],
    });
    expect(f.fact.revenue).toBe(300_000);
    expect(f.fact.cost).toBe(120_000);
    expect(f.fact.profit).toBe(180_000);
    expect(f.fact.margin).toBe(60);
  });

  it("операція без замовлення не потрапляє у факт замовлення", () => {
    const linked = [{ kind: "expense", amount: 5000, order_id: "o1" }];
    const unlinked = [{ kind: "expense", amount: 90_000, order_id: null }];
    const f = orderFinance({ estimates: [], transactions: linked });
    expect(f.fact.cost).toBe(5000);
    expect(unlinked[0]!.order_id).toBeNull();
  });
});

describe("Finance Core — канонічний кошторис", () => {
  it("дві версії кошторису не подвоюють plan revenue", () => {
    const plan = planFromEstimates([
      { id: "v1", status: "preliminary", total_client: 900_000, total_cost: 600_000, created_at: "2026-01-01" },
      { id: "v2", status: "approved", total_client: 1_000_000, total_cost: 650_000, created_at: "2026-02-01" },
    ]);
    expect(plan.revenue).toBe(1_000_000);
    expect(plan.cost).toBe(650_000);
    expect(plan.estimateId).toBe("v2");
    expect(plan.versions).toBe(2);
  });

  it("пріоритет статусів: approved > sent > preliminary > draft", () => {
    const pick = pickCanonicalEstimate([
      { id: "d", status: "draft" },
      { id: "p", status: "preliminary" },
      { id: "s", status: "sent" },
    ]);
    expect(pick?.id).toBe("s");
  });

  it("серед однакових статусів береться найновіший", () => {
    const pick = pickCanonicalEstimate([
      { id: "old", status: "preliminary", created_at: "2026-01-01" },
      { id: "new", status: "preliminary", created_at: "2026-05-01" },
    ]);
    expect(pick?.id).toBe("new");
  });

  it("відмовлений кошторис не стає канонічним, якщо є живий", () => {
    const pick = pickCanonicalEstimate([
      { id: "r", status: "refused", created_at: "2026-06-01" },
      { id: "p", status: "preliminary", created_at: "2026-01-01" },
    ]);
    expect(pick?.id).toBe("p");
  });
});

describe("Finance Core — договір і дебіторка", () => {
  const today = "2026-06-15";

  it("договір 1 000 000, отримано 200 000 → залишок 800 000", () => {
    const r = computeReceivables({ contractAmount: 1_000_000, receipts: 200_000, today });
    expect(r.contractedRevenue).toBe(1_000_000);
    expect(r.received).toBe(200_000);
    expect(r.remainingContractBalance).toBe(800_000);
    expect(r.overdue).toBe(0);
  });

  it("майбутній етап не є прострочкою", () => {
    const r = computeReceivables({
      contractAmount: 1_000_000,
      receipts: 200_000,
      today,
      stages: [
        { name: "Аванс", amount: 200_000, due_date: "2026-06-01" },
        { name: "Етап 2", amount: 500_000, due_date: "2026-09-01" },
      ],
    });
    expect(r.overdue).toBe(0);
    expect(r.dueNow).toBe(0);
    expect(r.stages[0]!.status).toBe("paid");
    expect(r.nextExpected?.amount).toBe(500_000);
  });

  it("етап 200 000, оплачено 70 000 → залишок 130 000", () => {
    const r = computeReceivables({
      contractAmount: 500_000,
      receipts: 70_000,
      today,
      stages: [{ name: "Аванс", amount: 200_000, due_date: "2026-06-10" }],
    });
    const s = r.stages[0]!;
    expect(s.paid).toBe(70_000);
    expect(s.remaining).toBe(130_000);
    expect(s.status).toBe("overdue");
    expect(r.overdue).toBe(130_000);
    expect(r.remainingContractBalance).toBe(430_000);
  });

  it("аванс не припускається 50%: відсоток береться лише з етапу", () => {
    const r = computeReceivables({
      contractAmount: 800_000,
      approvedExtras: 200_000,
      receipts: 0,
      today,
      stages: [{ name: "Аванс", percent: 30, due_date: "2026-07-01" }],
    });
    expect(r.contractedRevenue).toBe(1_000_000);
    expect(r.stages[0]!.amount).toBe(300_000);
    expect(r.dueNow).toBe(0);
    expect(r.unscheduled).toBe(700_000);
  });

  it("повернення зменшує отримане", () => {
    const r = computeReceivables({ contractAmount: 1_000_000, receipts: 300_000, refunds: 50_000, today });
    expect(r.netReceived).toBe(250_000);
    expect(r.remainingContractBalance).toBe(750_000);
  });

  it("скасований етап не входить у графік і в борг", () => {
    const r = computeReceivables({
      contractAmount: 1_000_000,
      receipts: 0,
      today,
      stages: [{ name: "Скасовано", amount: 400_000, due_date: "2026-01-01", status: "cancelled" }],
    });
    expect(r.overdue).toBe(0);
    expect(r.scheduled).toBe(0);
  });
});
