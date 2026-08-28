import { describe, it, expect } from "vitest";
import { computeOrderKpi, readManagement, crmUrl, deltaPercent } from "../order-management";

describe("order management KPI", () => {
  it("бере дохід з договору, потім кошторису, потім amount_total", () => {
    expect(computeOrderKpi({ amount_total: 100 }, { contract_total: 300, estimate_total: 200 }).plan.revenue).toBe(300);
    expect(computeOrderKpi({ amount_total: 100 }, { estimate_total: 200 }).plan.revenue).toBe(200);
    expect(computeOrderKpi({ amount_total: 100 }, {}).plan.revenue).toBe(100);
    expect(computeOrderKpi({}, {}).plan.revenue).toBeNull();
  });

  it("рахує прибуток і маржу плану та факту", () => {
    const k = computeOrderKpi({}, { contract_total: 1000, planned_cost: 600, actual_revenue: 1200, actual_cost: 900 });
    expect(k.plan.profit).toBe(400);
    expect(k.plan.margin).toBeCloseTo(0.4);
    expect(k.fact.profit).toBe(300);
    expect(k.fact.margin).toBeCloseTo(0.25);
    expect(k.delta.profit).toBe(-100);
  });

  it("не вигадує нулі, коли даних немає", () => {
    const k = computeOrderKpi({}, {});
    expect(k.plan.cost).toBeNull();
    expect(k.fact.profit).toBeNull();
    expect(k.paid).toBeNull();
    expect(k.due).toBeNull();
  });

  it("оплата не є виручкою, залишок = дохід − оплачено", () => {
    const k = computeOrderKpi({ paid_total: 400 }, { contract_total: 1000 });
    expect(k.fact.revenue).toBeNull();
    expect(k.paid).toBe(400);
    expect(k.due).toBe(600);
  });

  it("рахує дні плану, факту та відхилення", () => {
    const k = computeOrderKpi(
      { planned_start: "2026-08-01", planned_end: "2026-08-11" },
      { actual_start: "2026-08-03", actual_end: "2026-08-17" },
    );
    expect(k.days.plan).toBe(10);
    expect(k.days.fact).toBe(14);
    expect(k.days.delta).toBe(4);
  });

  it("readManagement стійкий до сміття в jsonb", () => {
    expect(readManagement({ management_data: null })).toEqual({});
    expect(readManagement({ management_data: [1, 2] })).toEqual({});
    expect(readManagement({ management_data: { contract_total: 5 } }).contract_total).toBe(5);
  });

  it("crmUrl тільки для валідного посилання або keycrm id", () => {
    expect(crmUrl({ crm_link: "https://app.key.crm/x" })).toBe("https://app.key.crm/x");
    expect(crmUrl({ crm_link: "невалідно" })).toBeNull();
    expect(crmUrl({ external_source: "keycrm", external_id: "42" })).toContain("42");
    expect(crmUrl({})).toBeNull();
  });

  it("deltaPercent", () => {
    expect(deltaPercent(120, 100)).toBeCloseTo(20);
    expect(deltaPercent(120, 0)).toBeNull();
  });
});
