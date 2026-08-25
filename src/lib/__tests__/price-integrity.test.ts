import { describe, expect, it } from "vitest";
import { buildPriceSources, findPriceIssues, priceBlockReason } from "@/lib/price-integrity";

describe("price-integrity", () => {
  const sources = buildPriceSources(["sand"], ["cement"]);

  it("класифікує джерела цін", () => {
    expect(sources["sand"]).toBe("catalog");
    expect(sources["cement"]).toBe("default");
    expect(sources["unknown"]).toBeUndefined();
  });

  it("не блокує коректні позиції", () => {
    const issues = findPriceIssues(
      [{ key: "sand", block: "materials", name: "Пісок", qty: 2, pricePerUnit: 100, sum: 200 }],
      sources,
    );
    expect(issues).toHaveLength(0);
    expect(priceBlockReason(issues)).toBeNull();
  });

  it("знаходить нульову ціну при ненульовій кількості", () => {
    const issues = findPriceIssues(
      [{ key: "sand", block: "materials", name: "Пісок", qty: 2, pricePerUnit: 0, sum: 0 }],
      sources,
    );
    expect(issues).toHaveLength(1);
    expect(priceBlockReason(issues)).toContain("Пісок");
  });

  it("ігнорує позиції з нульовою кількістю", () => {
    const issues = findPriceIssues(
      [{ key: "sand", block: "materials", name: "Пісок", qty: 0, pricePerUnit: 0, sum: 0 }],
      sources,
    );
    expect(issues).toHaveLength(0);
  });

  it("позначає позиції, яких немає в прайсі", () => {
    const issues = findPriceIssues(
      [{ key: "ghost", block: "materials", name: "Невідома", qty: 1, pricePerUnit: 0, sum: 0 }],
      sources,
    );
    expect(issues[0]?.source).toBe("missing");
  });
});
