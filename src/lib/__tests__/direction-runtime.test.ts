import { describe, it, expect } from "vitest";
import {
  evaluateDirectionRuntime, areaCoefFor, purchaseFor,
  type RuntimeDefinition,
} from "../directions/runtime";

const TIERS = [
  { maxArea: 50, coef: 1.25 },
  { maxArea: 100, coef: 1.15 },
  { maxArea: 200, coef: 1.05 },
  { maxArea: 500, coef: 1.0 },
  { maxArea: null, coef: 0.9 },
];

const def: RuntimeDefinition = {
  id: "test",
  name: "Тест",
  category: "other",
  fields: [],
  coefficients: [{ coef_group: "markup", coef_key: "m_std", value: 1.5 }],
  formulas: [{ formula_key: "netArea", expression: "area * 1.05" }],
  materials: [
    {
      code: "roll", name: "Рулон", unit: "м²", cost_price: 100, sale_coef_key: "m_std",
      consumption_formula: "netArea", sort_order: 1, pack_size: 15, pack_unit: "рул.",
    },
  ],
  works: [
    { code: "w1", name: "Робота", unit: "м²", cost_price: 50, sale_coef_key: "2", quantity_formula: "area", sort_order: 1 },
  ],
  logistics: [],
  services: [],
};

describe("area tiers", () => {
  it("picks tier by upper bound", () => {
    expect(areaCoefFor(40, TIERS)).toBe(1.25);
    expect(areaCoefFor(50, TIERS)).toBe(1.25);
    expect(areaCoefFor(100, TIERS)).toBe(1.15);
    expect(areaCoefFor(150, TIERS)).toBe(1.05);
    expect(areaCoefFor(500, TIERS)).toBe(1.0);
    expect(areaCoefFor(900, TIERS)).toBe(0.9);
  });
  it("no tiers → 1", () => expect(areaCoefFor(120)).toBe(1));
});

describe("purchase quantity", () => {
  it("rounds up to packaging without touching calc qty", () => {
    expect(purchaseFor(105, 15)).toEqual({ qty: 105, packs: 7 });
    expect(purchaseFor(106, 15)).toEqual({ qty: 120, packs: 8 });
  });
  it("no packaging → same qty", () => expect(purchaseFor(13.4)).toEqual({ qty: 13.4, packs: null }));
});

describe("direction runtime", () => {
  it("computes derived formulas, lines and margin deterministically", () => {
    const a = evaluateDirectionRuntime(def, { area: 100 }, { areaTiers: TIERS });
    const b = evaluateDirectionRuntime(def, { area: 100 }, { areaTiers: TIERS });
    expect(a.totals).toEqual(b.totals);

    expect(a.derived.netArea).toBe(105);
    expect(a.areaCoef).toBe(1.15);

    const mat = a.lines.find((l) => l.key === "roll")!;
    expect(mat.calcQty).toBe(105);
    expect(mat.purchaseQty).toBe(105);
    expect(mat.packs).toBe(7);
    expect(mat.sum).toBe(105 * 150);

    const work = a.lines.find((l) => l.key === "w1")!;
    // works get the area tier coefficient, materials do not
    expect(work.pricePerUnit).toBe(115);
    expect(a.totals.worksSell).toBe(11500);
    expect(a.totals.marginPercent).toBeGreaterThan(0);
  });

  it("applies discount, surcharge, VAT on materials, fop and commission", () => {
    const r = evaluateDirectionRuntime(def, { area: 100 }, {
      discountPercent: 10, surchargePercent: 5, vatMaterialsPercent: 20,
      fopPercent: 6, partnerCommissionPercent: 10,
    });
    expect(r.totals.subtotalSell).toBe(r.totals.materialsSell + r.totals.worksSell);
    expect(r.totals.discount).toBe(r2(r.totals.subtotalSell * 0.1));
    expect(r.totals.vatMaterials).toBe(r2(r.totals.materialsSell * 0.2));
    expect(r.totals.partnerCommission).toBe(r2(r.totals.totalSell * 0.1));
    expect(r.totals.totalCost).toBeGreaterThan(0);
  });

  it("tops up to minimum order and warns", () => {
    const r = evaluateDirectionRuntime(def, { area: 1 }, { minOrder: 11000 });
    expect(r.totals.totalSell).toBe(11000);
    expect(r.totals.minOrderTopUp).toBeGreaterThan(0);
    expect(r.warnings.join(" ")).toContain("мінімальне замовлення");
  });

  it("blocks on missing price", () => {
    const bad: RuntimeDefinition = {
      ...def,
      materials: [{ ...def.materials[0]!, cost_price: 0 }],
    };
    const r = evaluateDirectionRuntime(bad, { area: 10 });
    expect(r.blocking.length).toBe(1);
    expect(r.blocking[0]).toContain("Немає ціни");
  });

  it("warns when margin is below the allowed minimum", () => {
    const r = evaluateDirectionRuntime(def, { area: 100 }, { minMarginPercent: 90 });
    expect(r.warnings.join(" ")).toContain("нижче мінімально допустимої");
  });
});

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
