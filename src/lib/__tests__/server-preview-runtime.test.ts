/**
 * Prompt №3 — залишки: серверний live-preview, амортизація, конструктор напрямків.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildModulePreview, CALC_MODULES } from "../core/module-registry";
import { toClientDTO, toInternalDTO } from "../core/dto";
import { DEFAULT_AMORT_SETTINGS } from "../core/amortization";
import { evaluateDirectionRuntime, type RuntimeDefinition } from "../directions/runtime";

const ROUTES = ["screed", "roofing_pvc", "roofing_rub", "insulation", "demolition"] as const;
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("живий розрахунок виконує лише серверний Core", () => {
  it("усі п'ять калькуляторів підключені до useCanonicalPreview", () => {
    for (const r of ROUTES) {
      const code = src(`src/routes/${r}.tsx`);
      expect(code, r).toContain("useCanonicalPreview");
      expect(code, r).toContain("preview.result");
    }
  });

  it("у маршрутах немає локального розрахунку підсумків", () => {
    const engines = ["calculateScreed(", "calculatePvc(", "calculateRoofing(", "calculateInsulation(", "calculateDemolition(", "applyTargetMargin("];
    for (const r of ROUTES) {
      const code = src(`src/routes/${r}.tsx`);
      for (const e of engines) expect(code, `${r} → ${e}`).not.toContain(e);
    }
  });

  it("серверна функція prev'ю захищена авторизацією і перевіркою прав", () => {
    const code = src("src/lib/core/preview.functions.ts");
    expect(code).toContain("requireSupabaseAuth");
    expect(code).toContain("canViewInternalPrices");
  });
});

function preview(overrides: Parameters<typeof buildModulePreview>[0]["amort"]) {
  return buildModulePreview({
    module: "screed",
    input: {
      area: 120, thicknessCm: 7, perimeter: 0, roomsCount: 1, floor: 3,
      profile: "standard", screedGrade: "M200", cementType: "m500",
      withFilm: true, withDamper: true, meshType: "none", withSlope: false,
      withGrind: true, withCuts: true, sandType: "standard",
      withComplexPrep: false, withCementUnload: false, withDemolition: false,
      insulationType: "none", cityDelivery: true, distanceKm: 0,
      discountPercent: 0, partnerCommission: 0, urgent: false,
    },
    amort: { ...DEFAULT_AMORT_SETTINGS, ...(overrides ?? {}) },
  });
}

describe("перемикачі амортизації змінюють канонічний результат", () => {
  it("вимкнення «враховувати амортизацію» зменшує собівартість", () => {
    const on = preview({ includeInCost: true });
    const off = preview({ includeInCost: false });
    expect(off.canonical.totalCost).toBeLessThan(on.canonical.totalCost);
  });

  it("увімкнення в клієнтську ціну окремим рядком додає рядок і суму", () => {
    const base = preview({ includeInClientPrice: false });
    const shown = preview({ includeInClientPrice: true, clientMode: "separate_line" });
    expect(shown.canonical.totalClient).toBeGreaterThan(base.canonical.totalClient);
    expect(shown.canonical.amort.includeInClientPrice).toBe(true);
  });

  it("налаштування амортизації потрапляють у канонічний результат (для знімка)", () => {
    const r = preview({ includeInClientPrice: true, clientMode: "per_m2", clientValue: 15 });
    expect(r.canonical.amort.clientMode).toBe("per_m2");
    expect(r.canonical.amort.clientValue).toBe(15);
  });

  it("реєстр покриває всі п'ять модулів", () => {
    expect([...CALC_MODULES].sort()).toEqual([...ROUTES].sort());
  });
});

describe("DTO: без прав користувач не бачить внутрішні поля", () => {
  it("клієнтський DTO не містить собівартості, маржі й амортизації", () => {
    const { canonical } = preview({ includeInCost: true });
    const client = JSON.stringify(toClientDTO(canonical));
    for (const k of ["buyPerUnit", "cost", "margin", "grossProfit", "amort", "totalCost"]) {
      expect(client.toLowerCase()).not.toContain(k.toLowerCase());
    }
    expect(JSON.stringify(toInternalDTO(canonical))).toContain("totalCost");
  });
});

const draft: RuntimeDefinition = {
  id: "d1", name: "Чернетка", category: "other",
  fields: [], coefficients: [{ coef_group: "markup", coef_key: "m", value: 1.5 }],
  formulas: [{ formula_key: "net", expression: "area * 1.1" }],
  materials: [{ code: "m1", name: "Матеріал", unit: "м²", cost_price: 100, sale_coef_key: "m", consumption_formula: "net", sort_order: 1 }],
  works: [], logistics: [], services: [],
};

describe("конструктор напрямків: draft-прев'ю і незмінність версії", () => {
  it("напрямок з draft-маніфесту рахується в прев'ю", () => {
    const r = evaluateDirectionRuntime(draft, { area: 100 });
    expect(r.derived['net']).toBeCloseTo(110, 6);
    expect(r.totals.totalSell).toBeCloseTo(110 * 150, 2);
  });

  it("опублікована версія не змінюється після редагування чернетки", () => {
    const published: RuntimeDefinition = structuredClone(draft);
    const before = evaluateDirectionRuntime(published, { area: 100 }).totals.totalSell;

    draft.materials[0]!.cost_price = 999;
    draft.formulas![0]!.expression = "area * 2";

    const after = evaluateDirectionRuntime(published, { area: 100 }).totals.totalSell;
    expect(after).toBe(before);
    expect(evaluateDirectionRuntime(draft, { area: 100 }).totals.totalSell).not.toBe(before);
  });

  it("generic endpoints напрямків авторизовані й підтримують draft/published", () => {
    const code = src("src/lib/directions/calc.functions.ts");
    expect(code).toContain("requireSupabaseAuth");
    expect(code).toContain("getDirectionSchema");
    expect(code).toContain("calculateDirection");
    expect(code).toContain("loadPublishedDefinition");
  });

  it("аналіз дублів напрямків — тільки read-only dry-run", () => {
    const code = src("src/lib/directions/cleanup.functions.ts");
    expect(code).toContain("dryRunDirections");
    expect(code).not.toMatch(/\.delete\(|\.update\(|\.upsert\(|\.insert\(/);
  });
});
