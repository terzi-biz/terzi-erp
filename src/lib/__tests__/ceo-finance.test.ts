import { describe, it, expect } from "vitest";
import { buildCeoFinance, directionOf } from "../finance/ceo-finance";

describe("ceo finance", () => {
  it("maps services to directions", () => {
    expect(directionOf(["screed"]).key).toBe("screed");
    expect(directionOf(["polybeton"]).key).toBe("insulation");
    expect(directionOf(["screed", "demolition"])).toMatchObject({ key: "other", mixed: true });
    expect(directionOf([])).toMatchObject({ key: "other", unknown: true });
  });

  it("builds waterfall and allocates indirect costs exactly", () => {
    const r = buildCeoFinance({
      period: "2026-09",
      orders: [
        { orderId: "a", direction: "screed", planRevenue: 100, planCost: 50, factRevenue: 100, factCost: 60, active: true },
        { orderId: "b", direction: "roofing_pvc", planRevenue: 300, planCost: 200, factRevenue: 300, factCost: 150, active: false },
      ],
      commercial: 20, overhead: 20, taxes: 0,
    });
    expect(r.company.grossProfit).toBe(190);
    expect(r.company.operatingProfit).toBe(150);
    const s = r.directions.find((d) => d.key === "screed")!;
    const p = r.directions.find((d) => d.key === "roofing_pvc")!;
    expect(s.indirectShare + p.indirectShare).toBe(40);
    expect(s.operatingProfit! + p.operatingProfit!).toBe(150);
    expect(r.directions.find((d) => d.key === "plaster")!.operatingProfit).toBeNull();
    expect(r.production).toMatchObject({ activeObjects: 1, overrun: 10, overrunObjects: 1 });
  });
});
