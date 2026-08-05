import { describe, it, expect } from "vitest";
import { availableQty, documentTotal, deficit, weightedAvgCost, isBelowMin } from "@/lib/warehouse-calc";
import { invoiceTotal, paidSum, debt, orderPnl, accountBalance } from "@/lib/finance-calc";

describe("warehouse-calc", () => {
  it("вільний залишок не буває від'ємним", () => {
    expect(availableQty({ qty: 10, reserved_qty: 4 })).toBe(6);
    expect(availableQty({ qty: 2, reserved_qty: 5 })).toBe(0);
  });
  it("сума документа", () => {
    expect(documentTotal([{ qty: 2, price: 150.5 }, { qty: 3, price: 10 }])).toBe(331);
  });
  it("дефіцит під потребу", () => {
    expect(deficit(100, 40)).toBe(60);
    expect(deficit(10, 40)).toBe(0);
  });
  it("середньозважена собівартість", () => {
    expect(weightedAvgCost(10, 100, 10, 200)).toBe(150);
    expect(weightedAvgCost(0, 0, 5, 80)).toBe(80);
  });
  it("мінімальний запас", () => {
    expect(isBelowMin(3, 5)).toBe(true);
    expect(isBelowMin(3, 0)).toBe(false);
  });
});

describe("finance-calc", () => {
  it("сума рахунку і борг", () => {
    expect(invoiceTotal([{ qty: 2, price: 1000 }])).toBe(2000);
    expect(debt(2000, 500)).toBe(1500);
    expect(debt(2000, 2500)).toBe(0);
  });
  it("оплати враховують лише надходження", () => {
    expect(paidSum([{ amount: 1000, direction: "in" }, { amount: 400, direction: "out" }])).toBe(1000);
  });
  it("P&L план і факт", () => {
    const p = orderPnl({
      estimateTotal: 100000, estimateCost: 70000,
      payments: [{ amount: 60000, direction: "in" }],
      expenses: [{ amount: 45000 }],
    });
    expect(p.profitPlan).toBe(30000);
    expect(p.profitFact).toBe(15000);
    expect(p.marginPlan).toBe(30);
    expect(p.marginFact).toBe(25);
    expect(p.deviation).toBe(-15000);
  });
  it("залишок каси", () => {
    expect(accountBalance(1000, [{ amount: 500, direction: "in" }, { amount: 200, direction: "out" }], [{ amount: 100 }])).toBe(1200);
  });
});
