import { describe, expect, it } from "vitest";
import { TERZI_MODULES, findModule, moduleLabel, calculatorModules } from "@/lib/modules";
import { CALC_MODULES } from "@/lib/core/module-registry";
import { MODULE_KEYS, MODULE_LABEL, NAV_SECTIONS } from "@/components/nav-model";

describe("канонічний реєстр модулів", () => {
  it("id унікальні", () => {
    const ids = TERZI_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("модулі з калькулятором збігаються з рушіями Calculation Core", () => {
    expect(calculatorModules().map((m) => m.id).sort()).toEqual([...CALC_MODULES].sort());
  });

  it("навігація використовує той самий набір ключів і підписів", () => {
    expect([...MODULE_KEYS].sort()).toEqual([...CALC_MODULES].sort());
    for (const key of MODULE_KEYS) expect(MODULE_LABEL[key]).toBe(moduleLabel(key));
  });

  it("немає мовчазного fallback на стяжку", () => {
    expect(findModule("unknown_module")).toBeNull();
    expect(moduleLabel("unknown_module")).toBe("unknown_module");
    expect(findModule(null)).toBeNull();
  });

  it("кожен активний модуль з калькулятором має маршрут у навігації", () => {
    const calcSection = NAV_SECTIONS.find((s) => s.key === "calc");
    const routes = new Set(calcSection?.children.map((c) => c.to));
    for (const m of calculatorModules()) expect(routes.has(m.route!)).toBe(true);
  });
});
