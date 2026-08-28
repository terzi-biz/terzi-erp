/**
 * Тести Launch Contract v1.0 (docs/ERP_LAUNCH_CONTRACT.md).
 * Перевіряють, що runtime відповідає затвердженим контрольним сценаріям
 * і що заборонені легасі-норми не можуть повернутись.
 */
import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  FIBER_MATRIX_PER_7M3,
  FORBIDDEN_M200_FIBER_PACKS,
  PVC_CONTRACT,
  SCREED_CONTROL,
} from "@/lib/core/contract";
import { buildEstimateSnapshot } from "@/lib/estimate-snapshot";
import { calculatePvc, DEFAULT_PVC_PRICES } from "@/lib/pvc-calc";
import { calculateScreed, selfTestControlScenario } from "@/lib/screed-calc";
import { SCREED_GRADES } from "@/lib/screed-grades";

describe("Контрольний сценарій стяжки М200", () => {
  const r = calculateScreed({
    area: SCREED_CONTROL.areaM2, thicknessCm: SCREED_CONTROL.thicknessCm, roomsCount: 1, floor: 3,
    profile: "standard", cementType: "auto",
    withFilm: false, withDamper: false, meshType: "none", withSlope: false, withGrind: false, withCuts: true,
    withComplexPrep: false, withDemolition: false, insulationType: "none",
    cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
    payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
  });
  const line = (k: string) => r.lines.find((l) => l.key === k);

  it("самоперевірка рушія проходить", () => {
    const t = selfTestControlScenario();
    expect(t.report.join("\n")).not.toContain("✗");
    expect(t.ok).toBe(true);
  });

  it("об'єм і цемент відповідають контракту", () => {
    expect(r.volumeM3).toBe(SCREED_CONTROL.volumeM3);
    expect(line("m_cement500")?.qty).toBe(SCREED_CONTROL.cementM500Bags);
  });

  it("пісок: технічна потреба окремо від закупівлі", () => {
    const sand = line("m_sand");
    expect(sand?.qty).toBe(SCREED_CONTROL.sandTonsTechnical);
    expect(sand?.purchaseQty).toBe(14);
    // гроші рахуються по технічній потребі, а не по закупівлі
    expect(sand?.sum).toBeCloseTo(SCREED_CONTROL.sandTonsTechnical * (sand?.pricePerUnit ?? 0), 2);
  });

  it("пластифікатор і фібра за матрицею марок", () => {
    expect(line("m_plast")?.qty).toBe(SCREED_CONTROL.plasticizerLiters);
    expect(line("m_fiber")?.qty).toBe(SCREED_CONTROL.fiberPacks);
    expect(FORBIDDEN_M200_FIBER_PACKS).not.toContain(line("m_fiber")?.qty as never);
  });

  it("дизель: базові літри окремо від надбавки за поверховість", () => {
    expect(line("m_diesel")?.qty).toBe(SCREED_CONTROL.dieselLitersBase);
    const floorLine = line("m_diesel_floor");
    if (floorLine) expect(floorLine.qty).toBeGreaterThan(0);
  });

  it("матриця фібри збігається з контрактом", () => {
    for (const g of ["M100", "M150", "M200", "M250", "M300"] as const) {
      expect(SCREED_GRADES[g].fiberPacksPer7m3).toBe(FIBER_MATRIX_PER_7M3[g]);
    }
  });
});

describe("Контрольні правила ПВХ", () => {
  const r = calculatePvc({
    area: 100, perimeter: 40, thickness: "1.8",
    parapetHeightM: 0.5, parapetWidthM: 0.3, parapetOverlapM: 0.1,
    opaikaPoints: 0, funnels75: 0, funnels110: 1, funnels160: 0,
    aerators75: 0, aerators110: 0, aerators160: 0,
    withGeotextile: true, detailMembraneM2: 0,
  } as Parameters<typeof calculatePvc>[0]);
  const line = (k: string) => r.lines.find((l) => l.key === k);

  it("польове полотно армоване і рахує залишок рулонів", () => {
    const field = line("m_pvc");
    expect(field?.name).toContain("армована");
    expect(field?.purchaseUnit).toContain(String(PVC_CONTRACT.fieldRollM2));
    expect(field?.note).toContain("залишок");
  });

  it("D-15 — окремий код деталювальної мембрани", () => {
    expect(DEFAULT_PVC_PRICES[PVC_CONTRACT.d15Code]?.buy).toBe(PVC_CONTRACT.d15BuyPrice);
    const detail = line("m_pvc_d15");
    if (detail) expect(detail.name).toContain("неармована");
    expect(line("m_pvc")?.pricePerUnit).not.toBe(DEFAULT_PVC_PRICES[PVC_CONTRACT.d15Code]?.sell);
  });
});

describe("Знімок кошторису", () => {
  it("фіксує версію контракту і не посилається на живі об'єкти", () => {
    const prices = { m_sand: { buy: 1, sell: 2 } };
    const snap = buildEstimateSnapshot({
      module: "screed", engineVersion: "screed@1", priceBookVersion: 3,
      inputs: { area: 100 }, result: { total: 1 }, prices, norms: { fiber: 8 },
    });
    expect(snap.contractVersion).toBe(CONTRACT_VERSION);
    (prices.m_sand as { buy: number }).buy = 999;
    expect((snap.prices as typeof prices).m_sand.buy).toBe(1);
  });
});
