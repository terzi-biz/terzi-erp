import { describe, expect, it } from "vitest";
import { calculate, DEFAULT_INPUTS, safeDiv, applyScenario, DEFAULT_SCENARIOS, monthPace, controlRows, recommendations } from "../marketing/calculator";

const base = {
  ...DEFAULT_INPUTS,
  revenueMonths: [5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000],
  avgContractValue: 100_000,
  leadToMeasPct: 50,
  measToEstPct: 80,
  estToContractPct: 50,
  targetContracts: 20,
  measurementCapacity: 200,
  contractCapacity: 100,
  opsActualCost: 50_000,
};

describe("marketing calculator", () => {
  it("safeDiv guards zero/NaN/Infinity", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(NaN, 1)).toBeNull();
    expect(safeDiv(null, 1)).toBeNull();
    expect(safeDiv(4, 2)).toBe(2);
  });

  it("core formulas", () => {
    const o = calculate(base);
    expect(o.revenueAvg5).toBe(5_000_000);
    expect(o.marketingFundCap).toBe(750_000);
    expect(o.performanceMediaCap).toBe(450_000);
    expect(o.testBudget).toBe(75_000);
    expect(o.operationsCap).toBe(225_000);
    expect(o.gpPerContract).toBeCloseTo(25_500);
    expect(o.maxFullCac).toBeCloseTo(6_375);
    expect(o.leadToContract).toBeCloseTo(0.2);
    expect(o.breakEvenCpl).toBeCloseTo(1_275);
    expect(o.targetCpl).toBeCloseTo(1_020);
    expect(o.requiredEstimates).toBeCloseTo(40);
    expect(o.requiredMeasurements).toBeCloseTo(50);
    expect(o.requiredLeads).toBeCloseTo(100);
    expect(o.requiredMedia).toBeCloseTo(102_000);
    expect(o.recommendedMedia).toBeCloseTo(102_000);
    expect(o.limitingFactor).toBe("target");
    expect(o.forecastContracts).toBeCloseTo(20);
    expect(o.forecastRevenue).toBeCloseTo(2_000_000);
  });

  it("limits by production capacity", () => {
    const o = calculate({ ...base, contractCapacity: 10 });
    expect(o.limitingFactor).toBe("production_capacity");
    expect(o.forecastContracts).toBeCloseTo(10);
  });

  it("revenue plan mode", () => {
    const o = calculate({ ...base, planMode: "revenue", targetRevenue: 3_000_000 });
    expect(o.requiredContracts).toBeCloseTo(30);
  });

  it("show-up stage adds booked measurements", () => {
    const o = calculate({ ...base, showUpEnabled: true, showUpPct: 50 });
    expect(o.requiredBooked).toBeCloseTo(100);
    expect(o.requiredLeads).toBeCloseTo(200);
  });

  it("all zero inputs never produce NaN/Infinity", () => {
    const o = calculate(DEFAULT_INPUTS);
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number") expect(Number.isFinite(v), k).toBe(true);
    }
    expect(o.recommendedMedia).toBeNull();
    expect(o.limitingFactor).toBe("funnel_efficiency");
    expect(controlRows(o, DEFAULT_INPUTS).length).toBeGreaterThan(5);
    expect(recommendations(o, DEFAULT_INPUTS)[0].status).toBe("na");
  });

  it("scenarios are visible multipliers", () => {
    const g = applyScenario(base, DEFAULT_SCENARIOS[2]);
    expect(g.targetContracts).toBeCloseTo(25);
  });

  it("safe daily spend", () => {
    const p = monthPace({ planMedia: 100_000, spendFact: 40_000, dayOfMonth: 10, daysInMonth: 30 });
    expect(p.forecast).toBeCloseTo(120_000);
    expect(p.safeDaily).toBeCloseTo(3_000);
    expect(monthPace({ planMedia: 10_000, spendFact: 40_000, dayOfMonth: 10, daysInMonth: 30 }).safeDaily).toBe(0);
  });
});
