import { describe, it, expect } from "vitest";
import { computeEconomics, mapEstimateWorks, payrollWorkItems, rateFor, type VolumeRow } from "@/lib/brigade-economics";
import { buildPayrollOrder } from "@/lib/payroll-bridge";

const v = (p: Partial<VolumeRow>): VolumeRow => ({ id: Math.random().toString(), brigade_key: "screed_lesha", service_code: "screed_base", kind: "plan", quantity: 100, unit: "м²", source: "estimate", period: "2026-09", confirmed: false, voided: false, ...p });
const rate = { brigade_key: "screed_lesha", service_code: "screed_base", unit: "м²", rate: 50, effective_from: "2026-01-01", effective_to: null, active: true };
const lines = [{ block: "materials", code: "M1", cost: 30000 }, { block: "works", code: "W001", qty: 100, cost: 8000 }];

describe("brigade economics", () => {
  it("unknown rate → null, not 0", () => {
    const e = computeEconomics({ estimate: null, volumes: [v({})], rates: [], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.plan.lines[0].amount).toBeNull();
    expect(e.plan.brigadeTotal).toBeNull();
    expect(e.plan.margin).toBeNull();
  });
  it("known composition: revenue − non-labor − brigade plan; estimate labor not subtracted twice", () => {
    const e = computeEconomics({ estimate: { total_client: 60000, total_cost: 38000, internal_lines: lines }, volumes: [v({})], rates: [rate], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.estimate.estimateLabor).toBe(8000);
    expect(e.plan.brigadeTotal).toBe(5000);
    expect(e.plan.margin).toBe(60000 - 30000 - 5000);
  });
  it("unknown composition: revenue − total_cost, brigade not subtracted", () => {
    const e = computeEconomics({ estimate: { total_client: 60000, total_cost: 38000, internal_lines: null }, volumes: [v({})], rates: [rate], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.plan.margin).toBe(22000);
  });
  it("fact uses only confirmed rows and payouts; plan never counted as fact", () => {
    const e = computeEconomics({ estimate: null, volumes: [v({}), v({ kind: "fact", quantity: 40 }), v({ kind: "fact", quantity: 60, confirmed: true }), v({ kind: "fact", quantity: 5, confirmed: true, voided: true })], rates: [rate],
      payouts: [{ brigade_key: "screed_lesha", amount: 1000, period: "2026-09", confirmed: false, voided: false }], factRevenue: null, factNonLabor: null });
    expect(e.fact.lines).toHaveLength(1);
    expect(e.fact.accruedByRate).toBe(3000);
    expect(e.fact.payouts).toBeNull();
    expect(e.fact.unconfirmedPayouts).toBe(1000);
    expect(e.fact.margin).toBeNull();
    expect(e.diff[0]).toMatchObject({ plan: 100, fact: 60, delta: -40 });
  });
  it("rate by effective period", () => {
    const rs = [rate, { ...rate, rate: 60, effective_from: "2026-09-01" }];
    expect(rateFor(rs, "screed_lesha", "screed_base", "2026-08")?.rate).toBe(50);
    expect(rateFor(rs, "screed_lesha", "screed_base", "2026-09")?.rate).toBe(60);
  });
  it("estimate works mapped via configurable mapping only", () => {
    const r = mapEstimateWorks("screed", lines, [{ estimate_module: "screed", line_code: "W001", service_code: "screed_base", unit: "м²", active: true }]);
    expect(r.mapped).toEqual([{ code: "W001", name: "W001", service_code: "screed_base", quantity: 100, unit: "м²" }]);
    expect(mapEstimateWorks("screed", lines, []).unmapped).toHaveLength(1);
  });
  it("payroll: plan → planWorkItems, confirmed fact → workItems, unmapped brigade skipped", () => {
    const vols = [v({}), v({ kind: "fact", quantity: 60, confirmed: true }), v({ kind: "fact", quantity: 10 }), v({ brigade_key: "general_1" })];
    const ids = { screed_lesha: "crew-alex", general_1: null };
    expect(payrollWorkItems(vols, ids)).toEqual({ plan: [{ brigadeId: "crew-alex", serviceCode: "screed_base", quantity: 100 }], fact: [{ brigadeId: "crew-alex", serviceCode: "screed_base", quantity: 60 }], skipped: 1 });
    const order = { id: "o", name: "O", planned_start: "2026-09-10T08:00:00Z", ordered_at: null, production_status: null, financial_status: null };
    const r = buildPayrollOrder({ order, volumes: [v({})], payrollIds: ids });
    expect("dto" in r && r.dto.workItems).toBeUndefined();
    expect("dto" in r && r.dto.planWorkItems).toHaveLength(1);
    expect("dto" in r && r.dto.workVerified).toBeUndefined();
    const f = buildPayrollOrder({ order, volumes: [v({ kind: "fact", confirmed: true })], payrollIds: ids });
    expect("dto" in f && f.dto.workVerified).toBe(true);
    expect("dto" in f && f.dto.planOtherDirectCosts).toBeUndefined();
  });
  it("site summary parsing: unknown → null, flags only explicit true", async () => {
    const { parseSiteSummary } = await import("@/lib/payroll-bridge");
    expect(parseSiteSummary({ planCrew: 5000, crewFact: "x", verified: "yes" })).toMatchObject({ planCrew: 5000, crewFact: null, verified: false, paid: false });
    expect(parseSiteSummary({ foo: 1 })).toBeNull();
  });
});
