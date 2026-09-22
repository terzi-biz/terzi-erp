import { describe, expect, it } from "vitest";
import {
  FINANCE_CORE_VERSION, isEffectiveOn, missingRules, resolveRule, rulePercent, ruleNumber,
  type FinanceRule,
} from "@/lib/finance/rules";
import {
  allocateProductionOverhead, companyWaterfall, fnzTarget, normalizedMonthlyBurn,
  objectEconomy, reserveState,
} from "@/lib/finance/waterfall";
import { computeRoleCompensation, eligibleGp, totalRoleVariable } from "@/lib/finance/compensation";

const rules: FinanceRule[] = [
  { scope: "compensation", code: "sales_base", value_num: 50000, effective_from: "2025-01-01", effective_to: "2026-08-31" },
  { scope: "compensation", code: "sales_base", value_num: 25000, effective_from: "2026-09-01" },
  { scope: "compensation", code: "foreman_gp_percent", value_num: 8, effective_from: "2026-09-01" },
  { scope: "compensation", code: "foreman_base", value_num: 0, effective_from: "2026-09-01" },
  { scope: "reserve", code: "fnz_target_months", value_num: 2, effective_from: "2026-09-01" },
];

describe("finance rules (versioning)", () => {
  it("бере версію, чинну на дату періоду", () => {
    expect(ruleNumber(rules, "compensation", "sales_base", "2026-08-15")).toBe(50000);
    expect(ruleNumber(rules, "compensation", "sales_base", "2026-09-15")).toBe(25000);
  });

  it("не підмінює відсутнє правило нулем", () => {
    expect(ruleNumber(rules, "compensation", "estimator_gp_percent", "2026-09-01")).toBeNull();
    expect(missingRules(rules, [{ scope: "compensation", code: "estimator_gp_percent" }], "2026-09-01"))
      .toEqual(["estimator_gp_percent"]);
  });

  it("ігнорує архівоване правило і рахує відсоток як частку", () => {
    expect(isEffectiveOn({ ...rules[1], archived_at: "2026-09-02" } as FinanceRule, "2026-09-05")).toBe(false);
    expect(rulePercent(rules, "compensation", "foreman_gp_percent", "2026-09-01")).toBeCloseTo(0.08, 10);
    expect(resolveRule(rules, "compensation", "sales_base", "2026-09-05")?.value_num).toBe(25000);
  });
});

describe("object economy та водоспад", () => {
  it("рахує GP і маржу об'єкта", () => {
    const o = objectEconomy({ orderId: "a", accrualRevenue: 1000, directCost: 700, allocatedOverhead: 100 });
    expect(o.grossProfit).toBe(300);
    expect(o.grossMargin).toBe(30);
    expect(o.contribution).toBe(200);
  });

  it("розподіл накладних зберігає суму до копійки", () => {
    const objs = [
      { orderId: "a", revenue: 333.33 },
      { orderId: "b", revenue: 333.33 },
      { orderId: "c", revenue: 333.34 },
    ];
    const map = allocateProductionOverhead(objs, 100);
    const sum = [...map.values()].reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it("серпневий backtest сходиться з контрольними точками", () => {
    const revenue = 5_727_177.2;
    const gp = 1_837_852.2;
    const o = objectEconomy({ orderId: "aug", accrualRevenue: revenue, directCost: revenue - gp });
    expect(o.grossProfit).toBe(1_837_852.2);
    expect(o.grossMargin).toBeCloseTo(32.09, 1);

    const w = companyWaterfall({
      period: "2026-08",
      objects: [o],
      unallocatedProductionOverhead: 471_865.75,
      roleVariable: 0,
      fixedOpex: 125_079,
      mediaSpend: 109_127,
      taxes: 0,
    });
    expect(w.contribution).toBe(1_365_986.45);
    expect(w.operatingProfit).toBe(1_131_780.45);
    expect(w.engineVersion).toBe(FINANCE_CORE_VERSION);
  });

  it("transfer не входить у водоспад (жодного поля для нього немає)", () => {
    const w = companyWaterfall({
      period: "2026-08", objects: [], roleVariable: 0, fixedOpex: 0, mediaSpend: 0, taxes: 0,
    });
    expect(w.revenue).toBe(0);
    expect(w.grossMargin).toBeNull();
  });
});

describe("рушій винагород ролей", () => {
  const roof = objectEconomy({ orderId: "roof", accrualRevenue: 781_398 / 0.3246, directCost: 0 });
  it("прораб рахується від attributed GP напрямку, не від company GP", () => {
    const res = computeRoleCompensation(
      { role: "foreman", period: "2026-08", attributedObjects: [objectEconomy({ orderId: "roof", accrualRevenue: 781_398, directCost: 0 })] },
      rules,
      "2026-09-01",
    );
    expect(res.eligibleGp).toBe(781_398);
    expect(res.variable).toBeCloseTo(62_511.84, 2);
    expect(res.needsRule).toEqual([]);
  });

  it("два напрямки серпня дають сумарну виплату 8% від GP", () => {
    const screed = computeRoleCompensation(
      { role: "foreman", period: "2026-08", attributedObjects: [objectEconomy({ orderId: "screed", accrualRevenue: 1_056_454, directCost: 0 })] },
      rules, "2026-09-01",
    );
    const roofRes = computeRoleCompensation(
      { role: "foreman", period: "2026-08", attributedObjects: [objectEconomy({ orderId: "roof", accrualRevenue: 781_398, directCost: 0 })] },
      rules, "2026-09-01",
    );
    expect(totalRoleVariable([screed, roofRes])).toBeCloseTo((1_056_454 + 781_398) * 0.08, 1);
    expect(roof.revenue).toBeGreaterThan(0);
  });

  it("без правила змінної частини нарахування не вигадується", () => {
    const res = computeRoleCompensation({ role: "estimator", period: "2026-09" }, rules, "2026-09-01");
    expect(res.accrued).toBeNull();
    expect(res.needsRule).toContain("estimator_gp_percent");
  });

  it("sales отримує базу 25 000 у вересні", () => {
    const res = computeRoleCompensation({ role: "sales", period: "2026-09" }, rules, "2026-09-01");
    expect(res.base).toBe(25000);
    expect(eligibleGp(undefined)).toBe(0);
  });
});

describe("ФНЗ і гейт дивідендів", () => {
  it("ціль = 2 місяці нормалізованого burn", () => {
    const burn = normalizedMonthlyBurn([
      { period: "2026-06", fixedCost: 125_000 },
      { period: "2026-07", fixedCost: 125_079 },
      { period: "2026-08", fixedCost: 125_158 },
    ]);
    expect(burn).toBeCloseTo(125_079, 0);
    const target = fnzTarget(burn ?? 0, 2);
    expect(target).toBeCloseTo(250_158, 0);
  });

  it("дивіденди заблоковані, поки резерв менший за ціль", () => {
    expect(reserveState(100_000, 250_158).dividendsUnlocked).toBe(false);
    expect(reserveState(300_000, 250_158).dividendsUnlocked).toBe(true);
    expect(normalizedMonthlyBurn([])).toBeNull();
    expect(fnzTarget(100, null)).toBeNull();
  });
});
