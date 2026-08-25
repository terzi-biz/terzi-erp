import { describe, it, expect } from "vitest";
import {
  makeQty, applyManual, purchaseLabel,
  slopeLength, slopeDegrees, surfaceArea, summarizeGeometry, defaultSurfaces,
  nodeHeight, nodeArea, summarizeNodes,
  quickAreaEstimate, overheadPercent,
  planSurface, planCut, compareLayouts, rollArea,
  calculateLayers,
  calcPrimer, calcGas,
  summarizeWeight, calcLaborHours, summarizeLogistics,
  validateRoofing, hasBlockingIssues,
  migrateLegacyGeometry,
  DEFAULT_ROOFING_NORMS, mergeNorms,
  type RollSpec, type RoofSurface,
} from "@/lib/roofing";

const norms = DEFAULT_ROOFING_NORMS;
const roll: RollSpec = { code: "r1", name: "Акваізол ЕКО-ПЕ-3,0", widthM: 1, lengthM: 15, areaM2: 15, weightKgPerM2: 3 };

describe("qty — три числа не змішуються", () => {
  it("рахує фасовку вгору і залишок", () => {
    const q = makeQty({ net: 100, calc: 120, unit: "м²", pack: 15, packUnit: "рул." });
    expect(q.net).toBe(100);
    expect(q.calc).toBe(120);
    expect(q.packs).toBe(8);
    expect(q.purchase).toBe(120);
    expect(q.remainder).toBe(0);
  });

  it("залишок при некратній витраті", () => {
    const q = makeQty({ net: 100, calc: 121, unit: "м²", pack: 15, packUnit: "рул." });
    expect(q.packs).toBe(9);
    expect(q.purchase).toBe(135);
    expect(q.remainder).toBe(14);
    expect(purchaseLabel(q)).toContain("9 рул. × 15 м²");
  });

  it("кратність закупівлі (палета)", () => {
    const q = makeQty({ net: 100, calc: 120, unit: "м²", pack: 15, packUnit: "рул.", packMultiple: 20 });
    expect(q.packs).toBe(20);
  });

  it("ручна правка зберігає оригінал і причину", () => {
    const q = applyManual(makeQty({ net: 100, calc: 120, unit: "м²", pack: 15, packUnit: "рул." }), 150, "запас на ремонт");
    expect(q.manual?.original).toBe(120);
    expect(q.manual?.reason).toBe("запас на ремонт");
    expect(q.packs).toBe(10);
  });
});

describe("geometry", () => {
  it("довжина схилу = √(проекція² + перепад²)", () => {
    expect(slopeLength(3, 4)).toBe(5);
    expect(slopeDegrees(10, 0)).toBe(0);
    expect(slopeDegrees(10, 10)).toBe(45);
  });

  it("площі прямокутника, трикутника і трапеції", () => {
    const rect: RoofSurface = { id: "a", name: "a", shape: "rect", lengthM: 10, widthM: 3, riseM: 4 };
    expect(surfaceArea(rect)).toBe(50);
    expect(surfaceArea({ ...rect, shape: "triangle" })).toBe(25);
    expect(surfaceArea({ ...rect, shape: "trapezoid", width2M: 6 })).toBe(40);
    expect(surfaceArea({ id: "m", name: "m", shape: "manual", lengthM: 0, widthM: 0, manualAreaM2: 77 })).toBe(77);
  });

  it("сума площ по типу покрівлі", () => {
    const g = summarizeGeometry("gable", defaultSurfaces("gable", 10, 10));
    expect(g.surfaces).toHaveLength(2);
    expect(g.totalAreaM2).toBeGreaterThan(g.projectedAreaM2);
  });
});

describe("nodes", () => {
  it("змінна висота = середня", () => {
    expect(nodeHeight({ id: "n", type: "parapet", name: "p", lengthM: 10, heightStartM: 0.2, heightEndM: 0.6 })).toBe(0.4);
  });

  it("вертикальна площа враховує поличку і шари", () => {
    expect(nodeArea({ id: "n", type: "parapet", name: "p", lengthM: 10, heightM: 0.3, topFoldM: 0.2, layers: 2 })).toBe(10);
  });

  it("підсумок по типах", () => {
    const s = summarizeNodes([
      { id: "1", type: "parapet", name: "П1", lengthM: 20, heightM: 0.3 },
      { id: "2", type: "drip", name: "К1", lengthM: 10 },
    ]);
    expect(s.lengthByType.parapet).toBe(20);
    expect(s.totalLengthM).toBe(30);
    expect(s.verticalAreaM2).toBe(6);
  });
});

describe("режими", () => {
  it("швидкий режим = площа × 1,20", () => {
    const q = quickAreaEstimate(100, norms);
    expect(q.calcAreaM2).toBe(120);
    expect(overheadPercent(q.netAreaM2, q.calcAreaM2)).toBe(20);
  });
});

describe("розкрій", () => {
  it("смуги: N = 1 + ceil((фронт − ширина)/корисна)", () => {
    const s: RoofSurface = { id: "s1", name: "Скат", shape: "rect", lengthM: 10, widthM: 5, riseM: 0, layDirection: "along" };
    const p = planSurface(s, roll, norms, 50);
    // фронт = 5 м, корисна = 0.9 → 1 + ceil(4/0.9)=1+5=6 смуг по 10 м
    expect(p.strips).toBe(6);
    expect(p.totalRunM).toBe(60);
    expect(p.materialAreaM2).toBe(60);
  });

  it("нахлист ≥ ширини рулону → попередження і нульовий розкрій", () => {
    const p = planSurface(
      { id: "s1", name: "s", shape: "rect", lengthM: 10, widthM: 5 },
      { ...roll, widthM: 0.1 },
      norms, 50,
    );
    expect(p.strips).toBe(0);
    expect(p.warnings[0]).toContain("розкрій неможливий");
  });

  it("повний план рахує рулони, залишки і відсоток відходу", () => {
    const plan = planCut({
      surfaces: [{ id: "s1", name: "Скат", shape: "rect", lengthM: 10, widthM: 5, layDirection: "along" }],
      surfaceNetAreas: { s1: 50 },
      roll, norms, nodeAreaM2: 6,
    });
    expect(plan.rolls).toBe(Math.ceil(66 / 15));
    expect(plan.materialAreaM2).toBe(66);
    expect(plan.wastePercent).toBeGreaterThan(0);
    expect(plan.offcuts.some((o) => o.status === "used")).toBe(true);
  });

  it("порівняння варіантів сортує за рейтингом", () => {
    const base = planCut({
      surfaces: [{ id: "s1", name: "s", shape: "rect", lengthM: 10, widthM: 5, layDirection: "along" }],
      surfaceNetAreas: { s1: 50 }, roll, norms,
    });
    const across = planCut({
      surfaces: [{ id: "s1", name: "s", shape: "rect", lengthM: 10, widthM: 5, layDirection: "across" }],
      surfaceNetAreas: { s1: 50 }, roll, norms,
    });
    const rows = compareLayouts([
      { id: "a", label: "Вздовж", plan: base, laborHours: 10 },
      { id: "b", label: "Впоперек", plan: across, laborHours: 11 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.score).toBeGreaterThanOrEqual(rows[1]!.score);
  });

  it("площа рулону береться з розмірів, якщо не задана", () => {
    expect(rollArea({ code: "x", name: "x", widthM: 1, lengthM: 10 })).toBe(10);
  });
});

describe("шари", () => {
  it("нижній і верхній рахуються незалежно", () => {
    const res = calculateLayers({
      mode: "quick", norms,
      surfaces: [{ id: "s1", name: "s", shape: "manual", lengthM: 0, widthM: 0, manualAreaM2: 100 }],
      surfaceNetAreas: { s1: 100 },
      nodeAreaM2: 0,
      layers: [
        { role: "bottom", count: 1, roll },
        { role: "top", count: 1, roll: { ...roll, code: "r2", name: "Верхній", areaM2: 10, lengthM: 10 } },
      ],
    });
    expect(res).toHaveLength(2);
    expect(res[0]!.calcAreaM2).toBe(120);
    expect(res[0]!.qty.packs).toBe(8);
    expect(res[1]!.qty.packs).toBe(12);
  });

  it("точний режим не множиться на коефіцієнт", () => {
    const res = calculateLayers({
      mode: "precise", norms,
      surfaces: [{ id: "s1", name: "s", shape: "rect", lengthM: 10, widthM: 5, layDirection: "along" }],
      surfaceNetAreas: { s1: 50 },
      nodeAreaM2: 0,
      layers: [{ role: "top", count: 1, roll }],
    });
    expect(res[0]!.calcAreaM2).toBe(60);
    expect(res[0]!.calcAreaM2).toBeLessThan(50 * 1.2 * 1.2);
  });
});

describe("витратні", () => {
  it("праймер тільки по ґрунтованій площі, відра вгору", () => {
    const q = calcPrimer({ primedAreaM2: 100, norms });
    expect(q.calc).toBe(50);
    expect(q.packs).toBe(3);
  });

  it("газ рахується окремими нормами", () => {
    const g = calcGas({
      norms, bottomAreaM2: 100, topAreaM2: 100, verticalAreaM2: 10,
      dryingAreaM2: 0, repairAreaM2: 0, nodePoints: 4,
    });
    expect(g.bottomKg).toBe(40);
    expect(g.verticalKg).toBe(5);
    expect(g.nodesKg).toBe(1.2);
    expect(g.totalKg).toBe(86.2);
    expect(g.qty.packs).toBe(Math.ceil(86.2 / 21));
  });
});

describe("вага і логістика", () => {
  it("маса рулонів і палети", () => {
    const w = summarizeWeight([{ roll, packs: 25 }], [], norms);
    expect(w.totalKg).toBe(1125);
    expect(w.pallets).toBe(2);
  });

  it("трудомісткість і рейси", () => {
    expect(calcLaborHours({ norms, areaM2: 100, nodeLengthM: 40, points: 2 })).toBe(19);
    const w = summarizeWeight([{ roll, packs: 25 }], [], norms);
    const l = summarizeLogistics({ weight: w, heightM: 12, withCrane: false });
    expect(l.trips).toBe(1);
    expect(l.manualLift).toBe(true);
    expect(l.notes.length).toBe(1);
  });
});

describe("валідація", () => {
  const geometry = summarizeGeometry("flat", [{ id: "s1", name: "s", shape: "manual", lengthM: 0, widthM: 0, manualAreaM2: 100 }]);

  it("блокує подвійний запас", () => {
    const issues = validateRoofing({
      geometry, nodes: summarizeNodes([]), norms, mode: "precise", rolls: [roll], quickCoefOnPrecise: true,
    });
    expect(hasBlockingIssues(issues)).toBe(true);
    expect(issues.some((i) => i.code === "mode.double_reserve")).toBe(true);
  });

  it("блокує задвоєні позиції і однакові ділянки", () => {
    const issues = validateRoofing({
      geometry,
      nodes: summarizeNodes([
        { id: "1", type: "parapet", name: "Схід", lengthM: 10, heightM: 0.3 },
        { id: "2", type: "abutment", name: "Схід", lengthM: 10, heightM: 0.3 },
      ]),
      norms, mode: "quick", rolls: [roll], duplicateKeys: ["m_roll_top"],
    });
    expect(issues.some((i) => i.code === "node.overlap")).toBe(true);
    expect(issues.some((i) => i.code === "lines.duplicate")).toBe(true);
  });

  it("чистий вхід не має помилок", () => {
    const issues = validateRoofing({ geometry, nodes: summarizeNodes([]), norms, mode: "quick", rolls: [roll] });
    expect(hasBlockingIssues(issues)).toBe(false);
  });
});

describe("міграція старих кошторисів", () => {
  it("area/perimeter → плоска покрівля + парапет", () => {
    const m = migrateLegacyGeometry({ area: 250, perimeter: 64, parapetHeightCm: 30, parapetTopFoldM: 0.2 });
    expect(m.kind).toBe("flat");
    expect(m.mode).toBe("quick");
    expect(m.surfaces[0]!.manualAreaM2).toBe(250);
    expect(m.nodes[0]!.type).toBe("parapet");
    expect(m.nodes[0]!.lengthM).toBe(64);
  });
});

describe("нормативи", () => {
  it("злиття зберігає дефолти", () => {
    expect(mergeNorms({ quickCoef: 1.15 }).quickCoef).toBe(1.15);
    expect(mergeNorms(null).primerLPerM2).toBe(0.5);
  });
});
