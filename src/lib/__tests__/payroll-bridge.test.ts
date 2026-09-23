import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { buildPayrollOrder, signPayrollToken, mapBrigade } from "../payroll-bridge";

describe("payroll bridge", () => {
  it("signs base64url payload with HMAC-SHA256, no padding", async () => {
    const { token, exp } = await signPayrollToken("x".repeat(32), "u1", ["payroll:sync"], 1000, 600);
    const [p, sig] = token.split(".");
    expect(p).not.toMatch(/[=+/]/);
    const expected = createHmac("sha256", "x".repeat(32)).update(p).digest("base64url");
    expect(sig).toBe(expected);
    const json = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    expect(json).toEqual({ aud: "terzi-payroll-kpi", iss: "TERZI_ERP", sub: "u1", exp: 1600, scopes: ["payroll:sync"] });
    expect(exp).toBe(1600);
  });
  it("clamps TTL to 5–15 minutes", async () => {
    expect((await signPayrollToken("s".repeat(32), "u", [], 0, 99999)).exp).toBe(900);
  });
  it("maps brigades and drops unknown", () => {
    expect(mapBrigade("screed_lesha")).toBe("crew-alex");
    expect(mapBrigade("roofing_3")).toBe("roofing_3");
    expect(mapBrigade("other")).toBeUndefined();
  });
  const order = { id: "o1", name: "Об'єкт", planned_start: null, ordered_at: null, production_status: null, financial_status: null };
  it("skips when month unknown, never invents zeros", () => {
    expect("skip" in buildPayrollOrder({ order })).toBe(true);
    const r = buildPayrollOrder({ order, booking: { date: "2026-09-30", brigade_key: "unknown" }, approvedEstimate: { id: "e", total_client: 0, total_cost: null, area: null } });
    expect("dto" in r && r.dto).toEqual({ orderId: "o1", month: "2026-09", name: "Об'єкт", estimateId: "e", workDate: "2026-09-30" });
  });
});

describe("payroll workItems & secret", () => {
  const order = { id: "o1", name: "O", planned_start: "2026-09-10T08:00:00Z", ordered_at: null, production_status: null, financial_status: null };
  it("secret needs >=32 bytes", async () => {
    const { isValidBridgeSecret } = await import("../payroll-bridge");
    expect(isValidBridgeSecret("a".repeat(31))).toBe(false);
    expect(isValidBridgeSecret("a".repeat(32))).toBe(true);
    expect(isValidBridgeSecret(null)).toBe(false);
  });
  it("sends screed_base only with mapped brigade + completed measurement area", () => {
    const r = buildPayrollOrder({ order, booking: { date: "2026-09-12", brigade_key: "screed_lesha" }, measurement: { id: "m", lead_id: null, area: 120, status: "done" } });
    expect("dto" in r && r.dto.workItems).toEqual([{ brigadeId: "crew-alex", serviceCode: "screed_base", quantity: 120 }]);
  });
  it("omits workItems with note when data unverified", () => {
    const planned = buildPayrollOrder({ order, booking: { date: "2026-09-12", brigade_key: "screed_vitya" }, measurement: { id: "m", lead_id: null, area: 120, status: "planned" } });
    expect("dto" in planned && planned.dto.workItems).toBeUndefined();
    expect("dto" in planned && planned.workNote).toMatch(/Обсяг роботи не передано/);
    const roof = buildPayrollOrder({ order, booking: { date: "2026-09-12", brigade_key: "roofing_1" }, measurement: { id: "m", lead_id: null, area: 50, status: "done" } });
    expect("dto" in roof && roof.dto.workItems).toBeUndefined();
    const noBrig = buildPayrollOrder({ order, measurement: { id: "m", lead_id: null, area: 50, status: "done" } });
    expect("dto" in noBrig && noBrig.dto.workItems).toBeUndefined();
  });
});
