import { describe, expect, it } from "vitest";
import { buildEconomyRow, romiOf, totalEconomy, type EconomySlice } from "@/lib/marketing/economics";

const slice = (p: Partial<EconomySlice> = {}): EconomySlice => ({
  key: "google_ads", label: "Google Ads",
  spend: 10000, clicks: 500, impressions: 10000,
  leads: 20, qualified: 10, measurements: 8, contracts: 4,
  ordersWithMoney: 4, revenue: 200000, directCost: 140000,
  ...p,
});

describe("ROMI", () => {
  it("рахує від виручки та від валового прибутку окремо", () => {
    const r = buildEconomyRow(slice());
    expect(r.revenueFact).toBe(200000);
    expect(r.grossProfit).toBe(60000);
    expect(r.romiRevenue).toBe(1900);
    expect(r.romiGross).toBe(500);
  });

  it("без витрат ROMI не рахується", () => {
    expect(romiOf(50000, 0)).toBeNull();
    const r = buildEconomyRow(slice({ spend: 0 }));
    expect(r.romiGross).toBeNull();
    expect(r.cpl).toBeNull();
  });

  it("без підтверджених грошей повертає «немає даних», а не нуль", () => {
    const r = buildEconomyRow(slice({ ordersWithMoney: 0, revenue: 0, directCost: 0 }));
    expect(r.revenueFact).toBeNull();
    expect(r.grossProfit).toBeNull();
    expect(r.romiRevenue).toBeNull();
    expect(r.romiGross).toBeNull();
  });

  it("від'ємний ROMI при збитковому об'єкті", () => {
    const r = buildEconomyRow(slice({ revenue: 100000, directCost: 95000 }));
    expect(r.grossProfit).toBe(5000);
    expect(r.romiGross).toBe(-50);
  });
});

describe("Підсумок", () => {
  it("складає сирі значення, а не похідні", () => {
    const t = totalEconomy([slice(), slice({ key: "meta", spend: 5000, leads: 5, qualified: 2, contracts: 1, revenue: 50000, directCost: 30000, ordersWithMoney: 1 })]);
    expect(t.spend).toBe(15000);
    expect(t.leads).toBe(25);
    expect(t.cpl).toBe(600);
    expect(t.grossProfit).toBe(80000);
  });
});
