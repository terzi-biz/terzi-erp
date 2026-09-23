import { describe, it, expect } from "vitest";
import { computeEconomics, amountByRate, pct, mapEstimateWorks, payrollWorkItems, rateFor, type VolumeRow } from "@/lib/brigade-economics";
import { buildPayrollOrder } from "@/lib/payroll-bridge";

const v = (p: Partial<VolumeRow>): VolumeRow => ({ id: Math.random().toString(), brigade_key: "screed_lesha", service_code: "screed_base", kind: "plan", quantity: 100, unit: "м²", source: "estimate", period: "2026-09", confirmed: false, voided: false, ...p });
const rate = { brigade_key: "screed_lesha", service_code: "screed_base", unit: "м²", rate: 50, effective_from: "2026-01-01", effective_to: null, active: true };
const lines = [{ block: "materials", code: "M1", cost: 30000 }, { block: "works", code: "W001", qty: 100, cost: 8000 }];

describe("brigade economics", () => {
  it("unknown rate → null, not 0", () => {
    const e = computeEconomics({ estimate: null, volumes: [v({})], rates: [], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.plan.lines[0].amount).toBeNull();
    expect(e.plan.brigadeTotal).toBeNull();
    expect(e.plan.gross).toBeNull();
    expect(e.plan.marginPct).toBeNull();
  });
  it("known composition: revenue − non-labor − brigade plan; estimate labor not subtracted twice", () => {
    const e = computeEconomics({ estimate: { total_client: 60000, total_cost: 38000, internal_lines: lines }, volumes: [v({})], rates: [rate], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.estimate.estimateLabor).toBe(8000);
    expect(e.plan.brigadeTotal).toBe(5000);
    expect(e.plan.gross).toBe(25000);
    expect(e.plan.marginPct).toBe(41.67);
  });
  it("unknown composition: revenue − total_cost, brigade not subtracted", () => {
    const e = computeEconomics({ estimate: { total_client: 60000, total_cost: 38000, internal_lines: null }, volumes: [v({})], rates: [rate], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.plan.gross).toBe(22000);
    expect(e.plan.marginPct).toBe(36.67);
  });
  it("fact uses only confirmed rows and payouts; plan never counted as fact", () => {
    const e = computeEconomics({ estimate: null, volumes: [v({}), v({ kind: "fact", quantity: 40 }), v({ kind: "fact", quantity: 60, confirmed: true }), v({ kind: "fact", quantity: 5, confirmed: true, voided: true })], rates: [rate],
      payouts: [{ brigade_key: "screed_lesha", amount: 1000, period: "2026-09", confirmed: false, voided: false }], factRevenue: null, factNonLabor: null });
    expect(e.fact.lines).toHaveLength(1);
    expect(e.fact.accruedByRate).toBe(3000);
    expect(e.fact.settlement.paid).toBeNull();
    expect(e.fact.settlement.unconfirmedPayouts).toBe(1000);
    expect(e.fact.gross).toBeNull();
    expect(e.diff[0]).toMatchObject({ plan: 100, fact: 60, delta: -40 });
  });
  it("screed_base: до 100 м² фікс 12 000 ₴, понад 100 м² — 110 ₴/м²", () => {
    const sb = { ...rate, rate: 110, pricing: "fixed_until_threshold", minimum_amount: 12000, threshold_qty: 100 };
    expect(amountByRate(sb, 40)).toBe(12000);
    expect(amountByRate(sb, 100)).toBe(12000);
    expect(amountByRate(sb, 101)).toBe(11110);
    expect(amountByRate(sb, 150)).toBe(16500);
    expect(amountByRate({ ...sb, minimum_amount: null }, 50)).toBeNull();
    expect(amountByRate({ ...rate, pricing: "minimum", minimum_amount: 3000 }, 10)).toBe(3000);
    expect(amountByRate({ ...rate, pricing: "mystery" }, 10)).toBeNull();
    // фікс на сумарний обсяг, а не на кожен рядок
    const e = computeEconomics({ estimate: null, volumes: [v({ quantity: 30 }), v({ quantity: 50 })], rates: [sb], payouts: [], factRevenue: null, factNonLabor: null });
    expect(e.plan.brigadeTotal).toBe(12000);
    expect(e.plan.lines.map((l) => l.amount)).toEqual([4500, 7500]);
  });
  it("fact gross uses accrued, not payouts; payout date does not change gross", () => {
    const base = { estimate: null, volumes: [v({ kind: "fact", quantity: 60, confirmed: true })], rates: [rate], factRevenue: 10000, factNonLabor: 4000 };
    const a = computeEconomics({ ...base, payouts: [] });
    const b = computeEconomics({ ...base, payouts: [{ brigade_key: "screed_lesha", amount: 2500, period: "2026-09", confirmed: true, voided: false }] });
    expect(a.fact.gross).toBe(3000);
    expect(b.fact.gross).toBe(3000);
    expect(b.fact.marginPct).toBe(30);
    expect(b.fact.settlement).toMatchObject({ accrued: 3000, paid: 2500, due: 500 });
    expect(pct(100, 0)).toBeNull();
    expect(pct(100, null)).toBeNull();
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
    const full = parseSiteSummary({ revision: 3, updatedAt: "2026-09-23T10:00:00Z", order: { orderId: "x", planCrew: null, crewFact: 1200, act: true, paid: "true", planLines: [{ brigadeId: "crew-alex", serviceCode: "screed", quantity: 100, unit: "m2", amount: null }] } });
    expect(full).toMatchObject({ revision: "3", planCrew: null, crewFact: 1200, act: true, paid: false });
    expect(full?.planLines[0]).toMatchObject({ quantity: 100, amount: null });
  });
  it("site catalog: parsing, alias crew-alex, no fuzzy match", async () => {
    const { parseSiteCatalog, matchSiteId, erpKeyForSiteId } = await import("@/lib/payroll-bridge");
    const c = parseSiteCatalog({ revision: 1, brigades: [{ id: "crew-alex", name: "Льоша", active: true, rates: [{ code: "screed", rate: "x" }] }, { id: "bad id!" }, { id: "crew-new", name: "Нова", active: true }] });
    expect(c?.brigades.map((b) => b.id)).toEqual(["crew-alex", "crew-new"]);
    expect(c?.brigades[0].rates[0].rate).toBeNull();
    const ids = new Set(["crew-alex", "crew-new"]);
    expect(matchSiteId({ key: "screed_lesha", payroll_id: null }, ids)).toBe("crew-alex");
    expect(matchSiteId({ key: "crew_new", payroll_id: null }, ids)).toBeNull();
    expect(erpKeyForSiteId("crew-alex")).toBe("screed_lesha");
    expect(erpKeyForSiteId("crew-new")).toBe("p_crew_new");
    expect(parseSiteCatalog({ foo: 1 })).toBeNull();
  });
  it("site month overview parsing: null not zero", async () => {
    const { parseSiteOverview } = await import("@/lib/payroll-bridge");
    expect(parseSiteOverview({ overview: { month: "2026-09", crewDue: 500, crewPaid: "x" } })).toMatchObject({ month: "2026-09", crewDue: 500, crewPaid: null, staffCount: null });
    expect(parseSiteOverview({ overview: {} })).toBeNull();
  });
});
