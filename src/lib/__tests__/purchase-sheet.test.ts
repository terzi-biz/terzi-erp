import { describe, expect, it } from "vitest";
import type { EstimateLineLike } from "@/lib/estimate-line";
import { buildPurchaseSheet, purchaseSheetMatrix, purchaseSheetText } from "@/lib/purchase-sheet";

const lines: EstimateLineLike[] = [
  {
    key: "m1", block: "materials", name: "Мембрана Sikaplan 15G", unit: "м²",
    qty: 120, pricePerUnit: 300, costPerUnit: 210, sum: 36000, cost: 25200,
    purchaseQty: 6, purchaseUnit: "рулон",
  },
  {
    key: "m2", block: "materials", name: "Праймер", unit: "л",
    qty: 50, pricePerUnit: 100, costPerUnit: 70, sum: 5000, cost: 3500,
  },
  {
    key: "w1", block: "works", name: "Монтаж", unit: "м²",
    qty: 120, pricePerUnit: 150, costPerUnit: 90, sum: 18000, cost: 10800,
  },
];

describe("purchase sheet", () => {
  it("бере лише матеріали", () => {
    const d = buildPurchaseSheet(lines, { isInternal: true });
    expect(d.rows.map((r) => r.name)).toEqual(["Мембрана Sikaplan 15G", "Праймер"]);
  });

  it("сума закупівлі дорівнює сумі рядків", () => {
    const d = buildPurchaseSheet(lines, { isInternal: true, estimateNumber: "TRZ-1" });
    expect(d.total).toBe(28700);
  });

  it("клієнтський режим не показує собівартість", () => {
    const d = buildPurchaseSheet(lines, { isInternal: false });
    expect(d.total).toBeNull();
    expect(d.rows.every((r) => r.cost === null && r.costPerUnit === null)).toBe(true);
    expect(purchaseSheetMatrix(d)[0]).not.toContain("Сума, грн");
  });

  it("фасовка показується окремо від розрахунку", () => {
    const d = buildPurchaseSheet(lines, { isInternal: true });
    expect(d.rows[0]).toMatchObject({ qty: 120, unit: "м²", purchaseQty: 6, purchaseUnit: "рулон" });
    expect(d.rows[1]?.purchaseQty).toBeNull();
  });

  it("текст для постачальника містить позиції й підсумок", () => {
    const txt = purchaseSheetText(buildPurchaseSheet(lines, { isInternal: true, estimateNumber: "TRZ-7" }));
    expect(txt).toContain("TRZ-7");
    expect(txt).toContain("1. Мембрана Sikaplan 15G: 6,00 рулон");
    expect(txt).toContain("Разом");
  });
});
