import { describe, it, expect } from "vitest";
import { calculateScreedProduction, compareGrades, type ProductionInput } from "../screed-grades";

const base = (o: Partial<ProductionInput> = {}): ProductionInput => ({
  areaM2: 100, thicknessCm: 7, perimeterM: 40,
  screedGrade: "M200", cementGrade: "m500",
  hasMesh: false, hasSlope: false, marginPercent: 30, ...o,
});

describe("Технологічна матриця марок", () => {
  it("Тест 1 — М200, 100 м² × 7 см", () => {
    const r = calculateScreedProduction(base());
    expect(r.screedVolumeM3).toBe(7);
    expect(r.sandTons).toBe(13.4);
    expect(r.cementBags).toBe(60);
    expect(r.fiberPacks).toBe(8);
    expect(r.plasticizerLiters).toBe(10);
    expect(r.filmM2).toBe(120);
    expect(r.dieselLiters).toBe(17);
  });
  it("Тест 2 — М100", () => {
    const r = calculateScreedProduction(base({ screedGrade: "M100" }));
    expect([r.sandTons, r.cementBags, r.fiberPacks, r.plasticizerLiters]).toEqual([13.6, 42, 4, 7]);
  });
  it("Тест 3 — М150", () => {
    const r = calculateScreedProduction(base({ screedGrade: "M150" }));
    expect([r.sandTons, r.cementBags, r.fiberPacks, r.plasticizerLiters]).toEqual([13.5, 50, 6, 8.5]);
  });
  it("Тест 4 — М250", () => {
    const r = calculateScreedProduction(base({ screedGrade: "M250" }));
    expect([r.sandTons, r.cementBags, r.fiberPacks, r.plasticizerLiters]).toEqual([13.2, 70, 10, 12]);
  });
  it("Тест 5 — М300", () => {
    const r = calculateScreedProduction(base({ screedGrade: "M300" }));
    expect([r.sandTons, r.cementBags, r.fiberPacks, r.plasticizerLiters]).toEqual([13.0, 80, 12, 13.5]);
  });
  it("Цемент М400 має власну матрицю", () => {
    const r = calculateScreedProduction(base({ cementGrade: "m400" }));
    expect(r.cementBags).toBe(70);
  });
});

describe("Об'єкт 30 м²", () => {
  it("Тест 6 — 30 м², 7 см, М150, розуклонка", () => {
    const r = calculateScreedProduction(base({ areaM2: 30, perimeterM: 25, screedGrade: "M150", hasSlope: true }));
    expect(r.screedVolumeM3).toBe(2.1);
    expect(r.sandTons).toBe(4.05);
    expect(r.cementBags).toBe(15);
    expect(r.fiberPacksRaw).toBe(1.8);
    expect(r.fiberPacks).toBe(2);
    expect(r.plasticizerLiters).toBe(2.55);
    expect(r.filmM2).toBe(36);
    expect(r.damperM).toBe(25);
    expect(r.dieselLiters).toBe(5.1);
    expect(r.baseLaborCost).toBe(11000);
    expect(r.cementUnloadingCost).toBe(75);
    expect(r.slopeLaborCost).toBe(300);
  });
  it("Тест 7 — шар 8 см перераховує об'єм", () => {
    const r = calculateScreedProduction(base({ areaM2: 30, thicknessCm: 8, screedGrade: "M150" }));
    expect(r.screedVolumeM3).toBe(2.4);
    expect(r.extraThicknessLaborCost).toBe(300);
    expect(r.sandTons).toBeCloseTo(4.63, 2);
  });
  it("товщина 7,5 см — доплата 5 грн/м²", () => {
    const r = calculateScreedProduction(base({ areaM2: 100, thicknessCm: 7.5 }));
    expect(r.extraThicknessLaborCost).toBe(500);
  });
});

describe("Робота бригади", () => {
  it.each([[50, 11000], [100, 11000], [101, 11110], [110, 12100], [150, 16500]])(
    "%i м² → %i грн", (area, expected) => {
      expect(calculateScreedProduction(base({ areaM2: area })).baseLaborCost).toBe(expected);
    });
});

describe("Транспорт піску", () => {
  const trucks = (tons: number) => Math.ceil(tons / 15);
  it.each([[14.9, 1], [15, 1], [15.01, 2], [29.9, 2], [30.01, 3]])("%s т → %i КамАЗ", (t, n) => {
    expect(trucks(t as number)).toBe(n);
  });
});

describe("Маржа та порівняння", () => {
  it("маржа рахується від виручки", () => {
    const r = calculateScreedProduction(base({ marginPercent: 25 }));
    expect(r.sellingPrice).toBeCloseTo(r.productionCost / 0.75, 4);
    expect(r.grossProfit).toBeCloseTo(r.sellingPrice - r.productionCost, 4);
  });
  it("порівняння марок повертає 5 рядків із дельтою", () => {
    const rows = compareGrades({ areaM2: 100, thicknessCm: 7, perimeterM: 40, cementGrade: "m500", hasMesh: false, hasSlope: false, marginPercent: 30 });
    expect(rows).toHaveLength(5);
    expect(rows[0].deltaPerM2).toBe(0);
    expect(rows[4].costPerM2).toBeGreaterThan(rows[0].costPerM2);
  });
});
