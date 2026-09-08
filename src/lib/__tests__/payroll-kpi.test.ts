import { describe, it, expect } from "vitest";
import { computePayroll, pickTier } from "@/lib/finance/payroll-engine";
import { KPI_TEMPLATE_BY_KEY } from "@/lib/finance/kpi-templates";

describe("KPI-шкали TERZI", () => {
  it("обирає найвищий досягнутий поріг", () => {
    const tiers = [{ from: 0, bonus: 0 }, { from: 90, bonus: 10000 }, { from: 100, bonus: 15000 }];
    expect(pickTier(tiers, 95)?.bonus).toBe(10000);
    expect(pickTier(tiers, 100)?.bonus).toBe(15000);
    expect(pickTier(tiers, 10)?.bonus).toBe(0);
  });

  it("виконавчий директор: маржа 750 тис + план 100% + конверсія 100%", () => {
    const t = KPI_TEMPLATE_BY_KEY["executive_director"]!;
    const res = computePayroll({
      baseSalary: t.base_salary,
      advancePercent: t.advance_percent,
      kpiRules: t.kpi_scheme,
      facts: [
        { code: "GROSS_MARGIN_COMPANY", actual: 750000, approved: true },
        { code: "SALES_PLAN", actual: 2500000, approved: true },
        { code: "SALES_CONVERSION", actual: 100, approved: true },
      ],
    });
    expect(res.kpi_amount).toBe(35000); // 15000 + 15000 + 5000
    expect(res.advance_amount).toBe(30000);
    expect(res.total_payable).toBe(95000);
  });

  it("менеджер: 4% від маржі при 100% плану", () => {
    const t = KPI_TEMPLATE_BY_KEY["sales_manager"]!;
    const res = computePayroll({
      baseSalary: t.base_salary,
      advancePercent: 50,
      kpiRules: t.kpi_scheme,
      facts: [{ code: "GROSS_MARGIN_PERSONAL", actual: 0, base: 1200000, approved: true }],
    });
    expect(res.kpi_amount).toBe(48000);
  });

  it("бригадир: покрівля 60 м² оплачується мінімумом 2000 грн", () => {
    const t = KPI_TEMPLATE_BY_KEY["brigadier"]!;
    const res = computePayroll({
      baseSalary: 0, advancePercent: 50, kpiRules: t.kpi_scheme,
      facts: [{ code: "ROOFING_M2", actual: 60, approved: true }],
    });
    expect(res.kpi_amount).toBe(2000);
  });

  it("непідтверджений KPI не потрапляє в нарахування", () => {
    const t = KPI_TEMPLATE_BY_KEY["surveyor"]!;
    const res = computePayroll({
      baseSalary: t.base_salary, advancePercent: t.advance_percent, kpiRules: t.kpi_scheme,
      facts: [{ code: "MEASUREMENTS_DONE", actual: 20, approved: false }],
    });
    expect(res.kpi_amount).toBe(0);
    expect(res.total_payable).toBe(35000);
  });
});
