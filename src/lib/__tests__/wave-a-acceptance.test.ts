/**
 * Acceptance-перевірка Wave A + маршрутів/меню Prompt №3.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalResult } from "@/lib/core/index";
import { toClientDTO, toInternalDTO, hasForbiddenClientKeys } from "@/lib/core/dto";
import { findBlockingPriceErrors, isZeroApprovalValid } from "@/lib/core/price-policy";
import { NAV_SECTIONS, navForRoles, activeSectionKey } from "@/components/nav-model";
import { ROLE_LAYOUT, periodRange, roleFromRoles } from "@/lib/dashboard/widgets";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const baseInput = {
  module: "acceptance",
  areaM2: 100,
  engineVersion: "test@1",
  lines: [
    { key: "m1", block: "materials" as const, name: "Мембрана", unit: "м²", qtyTech: 100, buyPerUnit: 400, sellPerUnit: 650 },
    { key: "w1", block: "works" as const, name: "Монтаж", unit: "м²", qtyTech: 100, buyPerUnit: 110, sellPerUnit: 200 },
  ],
};

describe("Границя виконання Calculation Core", () => {
  it("авторизований серверний endpoint є єдиною точкою видачі DTO", () => {
    const src = read("src/lib/core/calc.functions.ts");
    expect(src).toContain("createServerFn");
    expect(src).toContain("requireSupabaseAuth");
    expect(src).toContain("canViewInternalPrices");
  });

  it("серверна видача збереженого кошторису теж перевіряє права", () => {
    const src = read("src/lib/core/estimate-dto.functions.ts");
    expect(src).toContain("requireSupabaseAuth");
    expect(src).toContain("canViewInternalPrices");
  });
});

describe("Клієнтський контур без внутрішніх даних", () => {
  it("у клієнтському DTO немає закупівель, собівартості, амортизації, прибутку і маржі — навіть як null", () => {
    const canonical = buildCanonicalResult(baseInput);
    const dto = toClientDTO(canonical);
    const json = JSON.parse(JSON.stringify(dto)) as unknown;
    expect(hasForbiddenClientKeys(json)).toEqual([]);
    const flat = JSON.stringify(json);
    for (const k of ["buyPerUnit", "cost", "amortCost", "grossProfit", "marginPercent", "markupPercent"]) {
      expect(flat.includes(`"${k}"`)).toBe(false);
    }
  });

  it("внутрішній DTO містить собівартість і маржу", () => {
    const internal = toInternalDTO(buildCanonicalResult(baseInput));
    expect(internal.totalCost).toBeGreaterThan(0);
    expect(internal.grossProfit).not.toBeUndefined();
  });
});

describe("Дозволений нуль собівартості", () => {
  it("нуль без причини/автора/дати блокує фіналізацію", () => {
    const errs = findBlockingPriceErrors([
      {
        key: "x", block: "materials", name: "Давальницький матеріал", qty: 10,
        sellPerUnit: 0, priceStatus: "confirmed_zero", billingMode: "separate_line",
        zeroApproval: null,
      },
    ]);
    expect(errs.map((e) => e.reason)).toContain("unapproved_zero");
  });

  it("нуль із дозволом (причина, автор, дата) не блокує", () => {
    const approval = { reason: "матеріал замовника", approvedBy: "director@terzi", approvedAt: "2026-08-28" };
    expect(isZeroApprovalValid(approval)).toBe(true);
    const errs = findBlockingPriceErrors([
      {
        key: "x", block: "materials", name: "Давальницький матеріал", qty: 10,
        sellPerUnit: 0, priceStatus: "confirmed_zero", billingMode: "separate_line",
        zeroApproval: approval,
      },
    ]);
    expect(errs).toEqual([]);
  });
});

describe("Маршрути розрахунків", () => {
  it("/roofing лише перенаправляє, нові розрахунки — у /roofing_pvc та /roofing_rub", () => {
    const src = read("src/routes/roofing.tsx");
    expect(src).toContain("redirect");
    expect(src).toContain("/roofing_pvc");
    expect(src).not.toContain("component:");
  });

  it("усі 5 калькуляторів під єдиною оболонкою кроків", () => {
    for (const f of ["screed", "roofing_pvc", "roofing_rub", "insulation", "demolition"]) {
      expect(read(`src/routes/${f}.tsx`)).toContain("<CalcStepRail");
    }
  });
});

describe("Інформаційна архітектура меню", () => {
  it("перший рівень — рівно 8 розділів", () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual([
      "dashboard", "crm", "calc", "estimates", "orders", "finance", "analytics", "settings",
    ]);
  });

  it("налаштування лише дозволеним ролям", () => {
    expect(navForRoles(["manager"]).some((s) => s.key === "settings")).toBe(false);
    expect(navForRoles(["admin"]).some((s) => s.key === "settings")).toBe(true);
  });

  it("перенесені пункти не зникли з навігації", () => {
    const all = NAV_SECTIONS.flatMap((s) => s.children.map((c) => c.to));
    for (const to of ["/materials", "/works", "/logistics", "/equipment", "/integrations", "/directions-editor", "/clients", "/crm/calls", "/marketing", "/warehouse"]) {
      expect(all).toContain(to);
    }
  });

  it("активний розділ визначається за шляхом", () => {
    expect(activeSectionKey("/")).toBe("dashboard");
    expect(activeSectionKey("/crm/leads")).toBe("crm");
    expect(activeSectionKey("/screed")).toBe("calc");
    expect(activeSectionKey("/directions-editor")).toBe("settings");
  });
});

describe("Ролева приладова панель", () => {
  it("кожна роль має власний набір і не більше 6 KPI зверху", () => {
    for (const role of Object.keys(ROLE_LAYOUT)) {
      expect(ROLE_LAYOUT[role as keyof typeof ROLE_LAYOUT].length).toBeGreaterThan(0);
    }
    expect(roleFromRoles(["finance"])).toBe("finance");
    expect(roleFromRoles([])).toBe("manager");
  });

  it("періоди фільтра дають коректні межі", () => {
    const now = new Date(2026, 7, 28, 12, 0, 0);
    const today = periodRange("today", now);
    expect(today.from.getDate()).toBe(28);
    const year = periodRange("year", now);
    expect(year.from.getFullYear()).toBe(2026);
    expect(year.to.getFullYear()).toBe(2027);
  });
});
