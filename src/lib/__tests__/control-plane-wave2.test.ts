import { describe, it, expect } from "vitest";
import { validateConfig } from "@/lib/config-kernel/kinds";
import { createLifecycle, resolveConfig, type ConfigEntry, type ConfigRepo } from "@/lib/config-kernel/lifecycle";
import { validateCustomFieldKey, validateFieldValue, CORE_COLUMNS, evaluateFormula, formulaSyntaxError, computeFormulaValues } from "@/lib/config-kernel/custom-fields";
import { dictionaryLabel, selectableItems } from "@/lib/config-kernel/dictionaries";
import { moduleViews } from "@/lib/config-kernel/module-overlay";
import { navForRoles, MODULE_KEYS } from "@/components/nav-model";

function memRepo(): ConfigRepo {
  const rows: ConfigEntry[] = []; let n = 0;
  return {
    async listVersions(t) { return rows.filter((r) => r.kind === t.kind && r.key === t.key && r.scope_type === t.scope.type && r.scope_id === t.scope.id); },
    async insert(e) { const r = { ...e, id: String(++n), created_at: "" } as ConfigEntry; rows.push(r); return r; },
    async update(id, p) { const r = rows.find((x) => x.id === id)!; Object.assign(r, p); return r; },
  };
}
const T = (kind: string, key: string) => ({ kind, key, scope: { type: "company" as const, id: "terzi" } });

describe("Wave 2 modules", () => {
  it("no overlays → nav identical to code", () => {
    const views = moduleViews(MODULE_KEYS, {}, { roles: ["admin"] });
    expect(navForRoles(["admin"], views)).toEqual(navForRoles(["admin"]));
  });
  it("overlay relabels, hides on mobile, reorders; routes unchanged", () => {
    const v = moduleViews(MODULE_KEYS, { screed: { label_uk: "Стяжка підлоги", label_ru: "Стяжка пола", order: 999 }, demolition: { mobile: false } }, { roles: [], lang: "ru", mobile: true });
    expect(v.at(-1)).toMatchObject({ id: "screed", label: "Стяжка пола", route: "/screed" });
    expect(v.find((x) => x.id === "demolition")!.visible).toBe(false);
    const calc = navForRoles([], v).find((s) => s.key === "calc")!;
    expect(calc.children.map((c) => c.to)).not.toContain("/demolition");
  });
  it("role visibility and unknown module rejected", () => {
    expect(moduleViews(["screed"], { screed: { roles: ["finance"] } }, { roles: ["manager"] })[0].visible).toBe(false);
    expect(validateConfig("module_overlay", "nope", {}).ok).toBe(false);
  });
});

describe("Wave 2 custom fields", () => {
  it("rejects core column collisions and bad entity", () => {
    expect(validateCustomFieldKey("order.address")).toBe(false);
    expect(validateCustomFieldKey("lead.budget")).toBe(false);
    expect(validateCustomFieldKey("invoice.x1")).toBe(false);
    expect(validateCustomFieldKey("order.object_class")).toBe(true);
    expect(CORE_COLUMNS.order).toContain("management_data");
  });
  it("validates values; null is not 0; formula not writable; archived option kept for history", () => {
    const def = { label_uk: "Клас", type: "single_select" as const, options: [{ code: "a", label_uk: "A" }, { code: "b", label_uk: "B", archived: true }] };
    expect(validateFieldValue(def, "a")).toEqual({ ok: true, value: "a" });
    expect(validateFieldValue(def, "b").ok).toBe(false);
    expect(validateFieldValue(def, "b", "b").ok).toBe(true);
    expect(validateFieldValue({ label_uk: "x", type: "money" }, "")).toEqual({ ok: true, value: null });
    expect(validateFieldValue({ label_uk: "x", type: "money" }, "12,5")).toEqual({ ok: true, value: 12.5 });
    expect(validateFieldValue({ label_uk: "x", type: "formula", formula: "a+b" }, 1).ok).toBe(false);
    expect(validateFieldValue({ label_uk: "x", type: "email" }, "bad").ok).toBe(false);
  });
  it("published field type cannot change; options cannot be removed", async () => {
    const lc = createLifecycle(memRepo(), async () => {}, "u1");
    const t = T("custom_field", "order.object_class");
    await lc.saveDraft(t, { label_uk: "Клас", type: "single_select", options: [{ code: "a", label_uk: "A" }] });
    await lc.publish(t);
    await expect(lc.saveDraft(t, { label_uk: "Клас", type: "text" })).rejects.toThrow(/Тип/);
    await expect(lc.saveDraft(t, { label_uk: "Клас", type: "single_select", options: [{ code: "z", label_uk: "Z" }] })).rejects.toThrow(/архівуються/);
  });
  it("no secrets in field definitions", () => {
    expect(validateConfig("custom_field", "order.x_note", { label_uk: "sk-abc", type: "text" }).ok).toBe(false);
  });
});

describe("Wave 2 dictionaries", () => {
  const d = { label_uk: "Клас", items: [{ code: "a", label_uk: "A", order: 2 }, { code: "b", label_uk: "B", order: 1, archived: true }, { code: "c", label_uk: "C", label_ru: "Ц", order: 0 }] };
  it("archived hidden from selection but readable historically", () => {
    expect(selectableItems(d).map((i) => i.code)).toEqual(["c", "a"]);
    expect(dictionaryLabel(d, "b")).toBe("B (архів)");
    expect(dictionaryLabel(d, "c", "ru")).toBe("Ц");
  });
  it("external authoritative codes cannot be shadowed; items cannot be deleted after publish", async () => {
    expect(validateConfig("dictionary", "close_reasons", d).ok).toBe(false);
    const lc = createLifecycle(memRepo(), async () => {}, "u1");
    const t = T("dictionary", "object_class");
    await lc.saveDraft(t, d); await lc.publish(t);
    await expect(lc.saveDraft(t, { ...d, items: d.items.slice(1) })).rejects.toThrow(/архівуються/);
    const archived = await lc.saveDraft(t, { ...d, items: d.items.map((i) => ({ ...i, archived: true })) });
    expect(archived.status).toBe("draft");
  });
  it("resolver returns null (no config) when store is empty", () => {
    expect(resolveConfig("dictionary", "object_class", [], {}).value).toBeNull();
    expect(resolveConfig("module_overlay", "screed", [], {}).value).toEqual({});
  });
});

describe("Wave 2 — формули кастомних полів", () => {
  it("рахує детерміновано з пріоритетом операцій і дужками", () => {
    const vals = { area: 10, price: 25, disc: 2 };
    expect(evaluateFormula("area * price - disc", vals)).toBe(248);
    expect(evaluateFormula("(area + disc) * price", vals)).toBe(300);
    expect(evaluateFormula("area / disc", vals)).toBe(5);
  });
  it("повертає null (немає даних) замість нуля за відсутнього значення", () => {
    expect(evaluateFormula("area * price", { area: null, price: 25 })).toBeNull();
    expect(evaluateFormula("area / zero", { area: 10, zero: 0 })).toBeNull();
  });
  it("не виконує довільний код і невідомі ключі", () => {
    expect(evaluateFormula("process.exit(1)", {})).toBeNull();
    expect(evaluateFormula("area ** 2", { area: 3 })).toBeNull();
    expect(formulaSyntaxError("area * ", ["area"])).not.toBeNull();
    expect(formulaSyntaxError("area * 2", ["area"])).toBeNull();
    expect(formulaSyntaxError("unknown * 2", ["area"])).not.toBeNull();
  });
  it("обчислює formula-поля запису лише з числових полів", () => {
    const fields = [
      { key: "area", def: { label_uk: "S", type: "number" } as any },
      { key: "rate", def: { label_uk: "R", type: "money" } as any },
      { key: "total", def: { label_uk: "T", type: "formula", formula: "area * rate" } as any },
      { key: "other", def: { label_uk: "O", type: "formula", formula: "area * missing" } as any },
    ];
    const out = computeFormulaValues(fields, { area: 12, rate: 300 });
    expect(out.total).toBe(3600);
    expect(out.other).toBeNull();
  });
});
