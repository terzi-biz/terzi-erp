import { describe, expect, it } from "vitest";
import { mergeCalcSettings, diffFromDefaults, CALC_SETTINGS_DEFAULTS } from "@/lib/config-kernel/calc-settings";
import { validateConfig, CONFIG_KINDS } from "@/lib/config-kernel/kinds";
import { resolveConfig } from "@/lib/config-kernel/lifecycle";
import { DEFAULT_SETTINGS } from "@/lib/screed-calc";
import { DEFAULT_DEMOLITION_COEFFS } from "@/lib/demolition-calc";

describe("calc_settings config kind", () => {
  it("порожня конфігурація = дефолти рушія точно", () => {
    const r = resolveConfig("calc_settings", "screed", [], {});
    expect(r.value).toEqual({});
    expect(mergeCalcSettings("screed", { ...DEFAULT_SETTINGS }, r.value)).toEqual(DEFAULT_SETTINGS);
    expect(mergeCalcSettings("demolition", { ...DEFAULT_DEMOLITION_COEFFS }, undefined)).toEqual(DEFAULT_DEMOLITION_COEFFS);
  });
  it("опублікований company-запис перевизначає лише задані поля", () => {
    const rows = [{ kind: "calc_settings", key: "screed", scope_type: "company" as const, scope_id: "terzi", status: "published" as const, payload: { brigadeMin: 12000 } }];
    const v = mergeCalcSettings("screed", { ...DEFAULT_SETTINGS }, resolveConfig("calc_settings", "screed", rows, {}).value);
    expect(v.brigadeMin).toBe(12000);
    expect(v.brigadePerM2).toBe(DEFAULT_SETTINGS.brigadePerM2);
  });
  it("валідація: невідомий калькулятор/поле/не-число відхиляються", () => {
    expect(validateConfig("calc_settings", "screed", { brigadeMin: 1 }).ok).toBe(true);
    expect(validateConfig("calc_settings", "paint", {}).ok).toBe(false);
    expect(validateConfig("calc_settings", "screed", { hacker: 1 }).ok).toBe(false);
    expect(validateConfig("calc_settings", "screed", { brigadeMin: "1" }).ok).toBe(false);
    expect(CONFIG_KINDS.calc_settings.sensitive).toBe(false);
  });
  it("зберігаються лише відмінності від дефолтів", () => {
    const d = CALC_SETTINGS_DEFAULTS.screed as Record<string, number>;
    expect(diffFromDefaults("screed", { ...d })).toEqual({});
    expect(diffFromDefaults("screed", { ...d, minCheck: 1 })).toEqual({ minCheck: 1 });
  });
});
