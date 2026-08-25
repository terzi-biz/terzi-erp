/**
 * Затверджені директором бізнес-правила (25.08.2026):
 *  1) Контрольний сценарій М200 і матриця фібри; закупівельна кратність піску окремо.
 *  2) Незмінний знімок кошторису.
 *  3) Sikaplan D-15 — окрема неармована мембрана; профілі 2 м; рулонна закупівля.
 */
import { describe, it, expect } from "vitest";
import {
  calculateScreedProduction, SCREED_GRADES, DEFAULT_SCREED_PRODUCTION_CONFIG,
  type ProductionInput,
} from "../screed-grades";
import { calculatePvc, DEFAULT_PVC_PRICES, DEFAULT_PVC_COEFFS, type PvcInput } from "../pvc-calc";
import { buildEstimateSnapshot, isSnapshotComplete } from "../estimate-snapshot";

const control: ProductionInput = {
  areaM2: 100, thicknessCm: 7, perimeterM: 40,
  screedGrade: "M200", cementGrade: "m500",
  hasMesh: false, hasSlope: false, marginPercent: 30,
};

describe("П1 — контрольний сценарій М200 (100 м² × 7 см = 7 м³)", () => {
  const r = calculateScreedProduction(control);

  it("об'єм 7 м³ і масштаб 1", () => {
    expect(r.screedVolumeM3).toBe(7);
    expect(r.scaleFactor).toBe(1);
  });

  it("цемент М500 — 60 мішків по 25 кг", () => {
    expect(r.cementBags).toBe(60);
    expect(r.cementKg).toBe(1500);
  });

  it("пісок — 13,4 т розрахункової норми", () => {
    expect(r.sandTons).toBe(13.4);
  });

  it("пластифікатор — 10 л, фібра — 8 упаковок", () => {
    expect(r.plasticizerLiters).toBe(10);
    expect(r.fiberPacks).toBe(8);
  });

  it("закупівельна кратність піску показана окремо і не впливає на вартість", () => {
    expect(r.sandTonsPurchase).toBe(14);
    const sandRow = r.materialRows.find((x) => x.key === "sand")!;
    expect(sandRow.qty).toBe(13.4);
    expect(sandRow.sum).toBeCloseTo(13.4 * DEFAULT_SCREED_PRODUCTION_CONFIG.sandPricePerTon, 2);
    expect(sandRow.purchaseQty).toBe(14);
    expect(sandRow.note).toContain("13.4");
  });
});

describe("П1 — матриця фібри на 7 м³", () => {
  it("М100=4, М150=6, М200=8, М250=10, М300=12", () => {
    expect(SCREED_GRADES.M100.fiberPacksPer7m3).toBe(4);
    expect(SCREED_GRADES.M150.fiberPacksPer7m3).toBe(6);
    expect(SCREED_GRADES.M200.fiberPacksPer7m3).toBe(8);
    expect(SCREED_GRADES.M250.fiberPacksPer7m3).toBe(10);
    expect(SCREED_GRADES.M300.fiberPacksPer7m3).toBe(12);
  });

  it("legacy-значення М200 = 11 упаковок більше не використовується", () => {
    expect(calculateScreedProduction(control).fiberPacks).not.toBe(11);
  });
});

const pvcInput: PvcInput = {
  area: 100, perimeter: 40,
  parapetHeightM: 0.5, parapetWidthM: 0.4, parapetOverlapM: 0.1,
  thickness: "1.5",
  withGeotextile: false, withDemount: false, withSlope: false, withPrep: false,
  funnels75: 0, funnels110: 2, funnels160: 0,
  aerators75: 0, aerators110: 0, aerators160: 0,
  opaikaPoints: 3,
  detailMembraneM2: 0,
  pvcAngleMeters: 0, pvcClampMeters: 0, dripEdgeMeters: 0,
  cityDelivery: true, outOfCityKm: 0, withLift: false, haulContainers: 0,
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

describe("П3 — Sikaplan D-15 як окрема неармована мембрана", () => {
  const r = calculatePvc(pvcInput);
  const field = r.lines.find((l) => l.key === "m_pvc")!;
  const detail = r.lines.find((l) => l.key === "m_pvc_d15")!;

  it("польове полотно і деталювальна мембрана — різні рядки BOM", () => {
    expect(field).toBeDefined();
    expect(detail).toBeDefined();
    expect(field.name).toContain("армована");
    expect(detail.name).toContain("D-15");
  });

  it("ціна 655 грн/м² належить саме D-15", () => {
    expect(DEFAULT_PVC_PRICES.pvc_d15_detail!.buy).toBe(655);
    expect(field.costPerUnit).not.toBe(655);
  });

  it("автонорма D-15 рахується від периметру та точок", () => {
    const expected = 40 * DEFAULT_PVC_COEFFS.detailPerMeterM2 + 5 * DEFAULT_PVC_COEFFS.detailPerPointM2;
    expect(detail.qty).toBeCloseTo(expected, 2);
  });

  it("для 1,8 мм без підтвердженої ціни — blocking warning і без підстановки ціни D-15", () => {
    const r18 = calculatePvc({ ...pvcInput, thickness: "1.8" });
    const f18 = r18.lines.find((l) => l.key === "m_pvc")!;
    expect(f18.costPerUnit).toBe(0);
    expect(f18.pricePerUnit).toBe(0);
    expect(r18.warnings.some((w) => w.includes("не підтверджена"))).toBe(true);
  });

  it("рулонна закупівля армованого полотна окремо від розрахункової площі", () => {
    expect(field.unit).toBe("м²");
    expect(field.purchaseQty).toBe(Math.ceil(field.qty / DEFAULT_PVC_COEFFS.fieldRollM2));
    expect(field.purchaseUnit).toContain("рул.");
  });
});

describe("П3 — ПВХ-планки і профілі як 2-метрові елементи", () => {
  const r = calculatePvc({ ...pvcInput, pvcClampMeters: 41, pvcAngleMeters: 10, dripEdgeMeters: 7 });
  for (const key of ["m_clamp", "m_angle", "m_drip"]) {
    it(`${key}: розрахунок у м.п., закупівля ceil(м/2) шт`, () => {
      const line = r.lines.find((l) => l.key === key)!;
      expect(line.unit).toBe("п.м");
      expect(line.purchaseQty).toBe(Math.ceil(line.qty / 2));
      expect(line.purchaseUnit).toContain("шт");
      // Сума рахується по погонажу, а не по штуках.
      expect(line.sum).toBeCloseTo(line.qty * line.pricePerUnit, 2);
    });
  }
});

describe("П2 — незмінний знімок кошторису", () => {
  const prices = { materials: { sand: { buy: 700, sell: 910 } } };
  const snap = buildEstimateSnapshot({
    module: "screed", engineVersion: "screed@test", priceBookVersion: 7,
    inputs: { area: 100 }, result: { totalClient: 1000, lines: [] },
    prices, norms: { coefficients: { filmCoef: 1.2 } }, priceSources: { sand: "catalog" },
  });

  it("зберігає версії, ціни, норми та джерела цін", () => {
    expect(snap.engineVersion).toBe("screed@test");
    expect(snap.priceBookVersion).toBe(7);
    expect(snap.priceSources.sand).toBe("catalog");
    expect(isSnapshotComplete(snap)).toBe(true);
  });

  it("зміна довідника після збереження не змінює знімок", () => {
    (prices.materials.sand as { buy: number }).buy = 999;
    expect((snap.prices.materials as typeof prices.materials).sand.buy).toBe(700);
  });

  it("неповний знімок не вважається придатним для відтворення", () => {
    expect(isSnapshotComplete({ totalClient: 10 })).toBe(false);
  });
});
