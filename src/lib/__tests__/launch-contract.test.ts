/**
 * Golden-тести Launch Contract — docs/ERP_LAUNCH_CONTRACT.md.
 * Кожен describe посилається на пункт контракту (C1…C9).
 */
import { describe, it, expect } from "vitest";
import {
  buildCanonicalEstimate,
  toClientEstimateDTO,
  toInternalEstimateDTO,
  containsInternalFields,
  isReleasable,
  equipmentAmortization,
  purchaseByPack,
  purchaseByStep,
  type CanonicalLine,
} from "../core/calc-core";
import { calculateScreed, selfTestControlScenario, PROFILE_NORMS } from "../screed-calc";
import { SCREED_GRADES, calculateScreedProduction, type ProductionInput } from "../screed-grades";
import { calculatePvc, DEFAULT_PVC_PRICES, DEFAULT_PVC_COEFFS, type PvcInput } from "../pvc-calc";
import { buildEstimateSnapshot } from "../estimate-snapshot";

const control: ProductionInput = {
  areaM2: 100, thicknessCm: 7, perimeterM: 40, screedGrade: "M200",
  cementGrade: "m500", hasMesh: false, hasSlope: false, marginPercent: 30,
};

describe("C1 — контрольний сценарій М200 у кошторисі стяжки", () => {
  const st = selfTestControlScenario();
  it("усі контрольні значення сходяться", () => {
    expect(st.report.join("\n")).toBe(st.report.map((s) => s.replace(/^✗/, "✓")).join("\n"));
    expect(st.ok).toBe(true);
  });

  it("пісок: технічна кількість у вартості, закупівля окремо", () => {
    const r = calculateScreed({
      area: 100, thicknessCm: 7, roomsCount: 1, floor: 3, profile: "standard", cementType: "auto",
      withFilm: false, withDamper: false, meshType: "none", withSlope: false, withGrind: false, withCuts: true,
      withComplexPrep: false, withDemolition: false, insulationType: "none",
      cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
      payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
    });
    const sand = r.lines.find((l) => l.key === "m_sand")!;
    expect(sand.qty).toBe(13.4);
    expect(sand.purchaseQty).toBe(14);
    expect(sand.sum).toBeCloseTo(13.4 * sand.pricePerUnit, 6);
  });

  it("норми з 9 та 11 упаковками фібри вилучені з runtime", () => {
    for (const p of ["econom", "standard", "reinforced"] as const) {
      const packs7 = PROFILE_NORMS[p].fiberPacksPerM3 * 7;
      expect(packs7).not.toBe(9);
      expect(packs7).not.toBe(11);
    }
  });

  it("дизель базового сценарію 17 л, поверховість — окремим рядком", () => {
    const high = calculateScreed({
      area: 100, thicknessCm: 7, roomsCount: 1, floor: 12, profile: "standard", cementType: "auto",
      withFilm: false, withDamper: false, meshType: "none", withSlope: false, withGrind: false, withCuts: true,
      withComplexPrep: false, withDemolition: false, insulationType: "none",
      cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
      payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
    });
    expect(high.lines.find((l) => l.key === "m_diesel")!.qty).toBe(17);
    expect(high.lines.find((l) => l.key === "m_diesel_floor")!.qty).toBeGreaterThan(0);
  });
});

describe("C2 — golden М100–М300 (фібра на 7 м³)", () => {
  const expected = { M100: 4, M150: 6, M200: 8, M250: 10, M300: 12 } as const;
  for (const [grade, packs] of Object.entries(expected)) {
    it(`${grade} → ${packs} уп.`, () => {
      expect(SCREED_GRADES[grade as keyof typeof expected].fiberPacksPer7m3).toBe(packs);
      const r = calculateScreedProduction({ ...control, screedGrade: grade as keyof typeof expected });
      expect(r.fiberPacks).toBe(packs);
      expect(r.screedVolumeM3).toBe(7);
    });
  }
});

const pvcInput: PvcInput = {
  area: 100, perimeter: 40, parapetHeightM: 0.5, parapetWidthM: 0.4, parapetOverlapM: 0.1,
  thickness: "1.5", withGeotextile: false, withDemount: false, withSlope: false, withPrep: false,
  funnels75: 0, funnels110: 2, funnels160: 0, aerators75: 0, aerators110: 0, aerators160: 0,
  opaikaPoints: 3, detailMembraneM2: 0, pvcAngleMeters: 0, pvcClampMeters: 0, dripEdgeMeters: 0,
  cityDelivery: true, outOfCityKm: 0, withLift: false, haulContainers: 0,
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

describe("C5/C6 — ПВХ: армовані 1,5 / 1,8 і D-15 роздільно", () => {
  const r15 = calculatePvc(pvcInput);
  const field = r15.lines.find((l) => l.key === "m_pvc")!;
  const detail = r15.lines.find((l) => l.key === "m_pvc_d15")!;

  it("коефіцієнт нахльосту основного полотна 1,15", () => {
    expect(DEFAULT_PVC_COEFFS.overlapCoef).toBe(1.15);
  });

  it("рулон армованої мембрани 2×20 м, закупівля і технічна площа роздільно", () => {
    expect(DEFAULT_PVC_COEFFS.fieldRollM2).toBe(40);
    expect(field.purchaseQty).toBe(Math.ceil(field.qty / 40));
    expect(field.purchaseUnit).toContain("рул.");
  });

  it("D-15 — окрема неармована позиція за 655 грн/м²", () => {
    expect(DEFAULT_PVC_PRICES.pvc_d15_detail!.buy).toBe(655);
    expect(detail.name).toContain("D-15");
    expect(field.costPerUnit).not.toBe(655);
  });

  it("1,8 мм без підтвердженої ціни блокує клієнтський вивід", () => {
    const r18 = calculatePvc({ ...pvcInput, thickness: "1.8" });
    const f18 = r18.lines.find((l) => l.key === "m_pvc")!;
    expect(f18.pricePerUnit).toBe(0);
    expect(r18.warnings.some((w) => w.includes("не підтверджена"))).toBe(true);
  });

  it("профілі рахуються в п.м, закупівля — 2-метровими елементами", () => {
    const r = calculatePvc({ ...pvcInput, pvcClampMeters: 41, pvcAngleMeters: 10, dripEdgeMeters: 7 });
    for (const key of ["m_clamp", "m_angle", "m_drip"]) {
      const l = r.lines.find((x) => x.key === key)!;
      expect(l.unit).toBe("п.м");
      expect(l.purchaseQty).toBe(Math.ceil(l.qty / 2));
    }
  });
});

describe("C6 — закупівельна кратність", () => {
  it("пакування рахується вгору, залишок фіксується", () => {
    expect(purchaseByPack(85, 40)).toEqual({ purchaseQty: 3, remainder: 35 });
    expect(purchaseByStep(13.4, 1)).toEqual({ purchaseQty: 14, remainder: 0.6 });
  });
});

const lines: CanonicalLine[] = [
  { key: "m_x", block: "materials", name: "Матеріал", unit: "м²", qty: 10, pricePerUnit: 100, costPerUnit: 60, sum: 1000, cost: 600, showToClient: true },
  { key: "w_x", block: "works", name: "Робота", unit: "м²", qty: 10, pricePerUnit: 50, costPerUnit: 30, sum: 500, cost: 300, showToClient: true },
  { key: "l_x", block: "logistics", name: "Логістика", unit: "рейс", qty: 1, pricePerUnit: 200, costPerUnit: 150, sum: 200, cost: 150, showToClient: true },
];

describe("C4 — податки", () => {
  const est = buildCanonicalEstimate(lines, { module: "test", engineVersion: "test@1", vatEnabled: true });

  it("ПДВ лише на матеріали, підсумок = роботи+логістика нетто + матеріали брутто", () => {
    expect(est.totals.materialsVat).toBe(200);
    expect(est.totals.materialsGross).toBe(1200);
    expect(est.totals.totalClient).toBe(1900);
  });

  it("подвійного нарахування ПДВ немає", () => {
    const client = toClientEstimateDTO(est);
    const sum = client.lines.reduce((a, l) => a + l.sum, 0);
    expect(sum).toBe(client.totals.total);
    expect(client.lines.find((l) => l.key === "w_x")!.taxNote).toBe("без ПДВ");
    expect(client.lines.find((l) => l.key === "m_x")!.taxNote).toBe("з ПДВ");
  });

  it("маржинальність рахується від нетто-виручки", () => {
    expect(est.totals.marginPercent).toBeCloseTo(((1700 - 1050) / 1700) * 100, 2);
  });
});

describe("C7 — розділення InternalEstimateDTO і ClientEstimateDTO", () => {
  const est = buildCanonicalEstimate(lines, { module: "test", engineVersion: "test@1", vatEnabled: true });

  it("клієнтський DTO не містить закупівлі, собівартості, прибутку і маржі", () => {
    expect(containsInternalFields(toClientEstimateDTO(est))).toEqual([]);
  });

  it("внутрішній DTO зберігає собівартість і маржу", () => {
    const internal = toInternalEstimateDTO(est);
    expect(internal.totals.totalCost).toBe(1050);
    expect(containsInternalFields(internal).length).toBeGreaterThan(0);
  });
});

describe("C8 — блокуючі помилки прайсу", () => {
  it("нульова ціна активної позиції блокує фінальний статус і PDF", () => {
    const bad = buildCanonicalEstimate(
      [{ ...lines[0]!, pricePerUnit: 0, sum: 0 }],
      { module: "test", engineVersion: "test@1" },
    );
    expect(isReleasable(bad)).toBe(false);
    expect(bad.blocking[0]!.reason).toBe("zero_price");
  });

  it("відсутній код позиції — блокуюча помилка без fallback", () => {
    const bad = buildCanonicalEstimate(lines, { module: "test", engineVersion: "test@1", knownCodes: ["w_x", "l_x"] });
    expect(bad.blocking.map((b) => b.key)).toEqual(["m_x"]);
  });
});

describe("C3 — незмінність збереженої смети", () => {
  it("зміна прайсу після збереження не змінює знімок", () => {
    const prices = { materials: { sand: { buy: 700, sell: 910 } } };
    const est = buildCanonicalEstimate(lines, { module: "screed", engineVersion: "screed@1", vatEnabled: true });
    const snap = buildEstimateSnapshot({
      module: "screed", engineVersion: "screed@1", priceBookVersion: 7,
      inputs: { area: 100 }, result: est, prices, norms: { fiberPacksPer7m3: 8 },
      priceSources: { sand: "catalog" },
    });
    prices.materials.sand.buy = 999;
    expect((snap.prices.materials as typeof prices.materials).sand.buy).toBe(700);
    expect((snap as unknown as { totals: { totalClient: number } }).totals.totalClient).toBe(1900);
  });
});

describe("C-обладнання — амортизація і коректна маржа", () => {
  it("маржа ніколи не від'ємна, амортизація детермінована", () => {
    const r = equipmentAmortization({ purchaseCost: 240000, lifetimeMonths: 60, ordersPerMonth: 8, markupPercent: 30 });
    expect(r.monthlyAmort).toBe(4000);
    expect(r.amortPerOrder).toBe(500);
    expect(r.sellPerOrder).toBe(650);
    expect(r.marginPercent).toBeGreaterThan(0);
    expect(r.marginPercent).toBeLessThanOrEqual(100);
  });
});
