import { describe, it, expect } from "vitest";
import { applyTargetMargin, priceForMargin, type MarginResult } from "../target-margin";

function base(): MarginResult {
  const lines = [
    { block: "materials", qty: 100, sum: 10000, cost: 8000, pricePerUnit: 100 },
    { block: "works", qty: 100, sum: 10000, cost: 5000, pricePerUnit: 100 },
  ];
  const subtotal = 20000;
  const totalCost = 13000;
  return {
    lines,
    materialsSell: 10000,
    worksSell: 10000,
    logisticsSell: 0,
    subtotalSell: subtotal,
    totalClient: subtotal,
    pricePerM2: 200,
    totalCost,
    grossProfit: subtotal - totalCost,
    marginPercent: ((subtotal - totalCost) / subtotal) * 100,
    warnings: [],
  };
}

describe("target margin", () => {
  it("price for margin uses revenue-based formula", () => {
    expect(priceForMargin(10000, 30)).toBe(14285.71);
  });

  it("hits the target margin and loads works more than materials", () => {
    const r = applyTargetMargin(base(), 40);
    expect(r.totalClient).toBeCloseTo(priceForMargin(13000, 40), 0);
    expect(r.marginPercent).toBeCloseTo(40, 1);
    expect(r.worksSell - 10000).toBeGreaterThan(r.materialsSell - 10000);
    expect(r.lines[0]!.pricePerUnit).toBeCloseTo(r.lines[0]!.sum / 100, 2);
  });

  it("is deterministic and a no-op for 0 / invalid margin", () => {
    expect(applyTargetMargin(base(), 0)).toEqual(base());
    expect(applyTargetMargin(base(), 35)).toEqual(applyTargetMargin(base(), 35));
  });

  it("recalculates VAT on materials and keeps it out of gross profit", () => {
    const b = { ...base(), vatAdjustment: 2000, totalClient: 22000 };
    const r = applyTargetMargin(b, 40) as typeof b;
    const expectedVat = 2000 * (r.materialsSell / 10000);
    expect(r.vatAdjustment).toBeCloseTo(expectedVat, 1);
    expect(r.totalClient).toBeCloseTo(r.subtotalSell + expectedVat, 1);
    expect(r.grossProfit).toBeCloseTo(r.totalClient - expectedVat - r.totalCost, 1);
    expect(r.marginPercent).toBeCloseTo(40, 1);
  });

  it("never sells a line below its cost", () => {
    const r = applyTargetMargin(base(), 1);
    for (const l of r.lines) expect(l.sum).toBeGreaterThanOrEqual(l.cost);
  });
});
