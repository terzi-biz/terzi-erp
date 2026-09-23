import { describe, expect, it } from "vitest";
import { createLifecycle, resolveConfig, diffPayload, ConfigValidationError, type ConfigEntry, type ConfigRepo } from "@/lib/config-kernel/lifecycle";
import { validateConfig, findSecretLike } from "@/lib/config-kernel/kinds";
import { buildScopeChain } from "@/lib/config-kernel/scope";
import { capabilities, validateRegistries } from "@/lib/config-kernel/registries";
import { TERZI_MODULES } from "@/lib/modules";

function memRepo() {
  const rows: ConfigEntry[] = [];
  const repo: ConfigRepo = {
    async listVersions(t) {
      return rows.filter((r) => r.kind === t.kind && r.key === t.key && r.scope_type === t.scope.type && r.scope_id === t.scope.id).sort((a, b) => a.version - b.version);
    },
    async insert(e) {
      const r = { ...e, id: `id${rows.length + 1}`, created_at: new Date().toISOString() } as ConfigEntry;
      rows.push(r);
      return r;
    },
    async update(id, patch) {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r, patch);
      return r;
    },
  };
  const audits: string[] = [];
  return { rows, repo, audits, lc: createLifecycle(repo, async (a) => void audits.push(a), "u1") };
}

const T = { kind: "flag", key: "crm.new_card", scope: { type: "company" as const, id: "terzi" } };

describe("config kernel", () => {
  it("порожнє сховище → code default (поведінка без змін)", () => {
    expect(resolveConfig("flag", "crm.new_card", [], {}).value).toEqual({ enabled: false });
    expect(resolveConfig("module_overlay", "screed", [], {}).value).toEqual({});
    expect(resolveConfig("flag", "x.y", [], {}).source).toEqual(["code"]);
  });

  it("драфт не бачить runtime; publish робить видимим і інкрементує версії", async () => {
    const { lc, rows, audits } = memRepo();
    await lc.saveDraft(T, { enabled: true });
    expect(resolveConfig("flag", T.key, rows, {}).value.enabled).toBe(false);
    const p1 = await lc.publish(T);
    expect(p1.version).toBe(1);
    expect(resolveConfig("flag", T.key, rows, {}).value.enabled).toBe(true);
    await lc.saveDraft(T, { enabled: false });
    const prev = await lc.preview(T);
    expect(prev?.changes).toEqual([{ path: "$.enabled", before: true, after: false }]);
    const p2 = await lc.publish(T);
    expect(p2.version).toBe(2);
    expect(rows.filter((r) => r.status === "published")).toHaveLength(1);
    expect(audits).toEqual(["config.draft", "config.publish", "config.draft", "config.publish"]);
  });

  it("rollback створює нову версію, історія зберігається", async () => {
    const { lc, rows } = memRepo();
    await lc.saveDraft(T, { enabled: true }); await lc.publish(T);
    await lc.saveDraft(T, { enabled: false }); await lc.publish(T);
    const rb = await lc.rollback(T, 1);
    expect(rb.version).toBe(3);
    expect(rb.based_on_version).toBe(1);
    expect(rows.map((r) => r.status)).toEqual(["superseded", "superseded", "published"]);
    expect(resolveConfig("flag", T.key, rows, {}).value.enabled).toBe(true);
    await expect(lc.rollback(T, 99)).rejects.toThrow();
  });

  it("валідація: схема, ключ, секрети", async () => {
    const { lc } = memRepo();
    await expect(lc.saveDraft(T, { enabled: "yes" })).rejects.toBeInstanceOf(ConfigValidationError);
    expect(validateConfig("module_overlay", "unknown_module", {}).ok).toBe(false);
    expect(validateConfig("module_overlay", "screed", { label: "Стяжка+", extra: 1 }).ok).toBe(false);
    expect(validateConfig("nope", "k", {}).ok).toBe(false);
    expect(findSecretLike({ api_key: "x" })).toEqual(["$.api_key"]);
    expect(findSecretLike({ note: "sb_secret_abc" })).toEqual(["$.note"]);
    expect(validateConfig("flag", "a.b", { enabled: true, note: "sk-live123" }).ok).toBe(false);
  });

  it("scope chain: role перемагає company; неактивні скоупи ігноруються", () => {
    const entries = [
      { kind: "module_overlay", key: "screed", scope_type: "company" as const, scope_id: "terzi", status: "published" as const, payload: { label: "A", order: 1 } },
      { kind: "module_overlay", key: "screed", scope_type: "role" as const, scope_id: "sales", status: "published" as const, payload: { label: "B" } },
      { kind: "module_overlay", key: "screed", scope_type: "user" as const, scope_id: "u1", status: "published" as const, payload: { label: "C" } },
      { kind: "module_overlay", key: "screed", scope_type: "role" as const, scope_id: "sales", status: "draft" as const, payload: { label: "D" } },
    ];
    expect(resolveConfig("module_overlay", "screed", entries, { roleKey: "sales", userId: "u1" }).value).toEqual({ label: "B", order: 1 });
    expect(resolveConfig("module_overlay", "screed", entries, { roleKey: "finance" }).value).toEqual({ label: "A", order: 1 });
    expect(buildScopeChain({ roleKey: "x", userId: "u", branchId: "b" }).map((s) => s.type)).toEqual(["system", "company", "role"]);
  });

  it("невалідний опублікований запис → безпечний fallback", () => {
    const bad = [{ kind: "flag", key: "a.b", scope_type: "company" as const, scope_id: "terzi", status: "published" as const, payload: { enabled: "nope" } }];
    expect(resolveConfig("flag", "a.b", bad, {}).value).toEqual({ enabled: false });
  });

  it("реєстри: capabilities = modules.ts, залежності валідні", () => {
    expect(capabilities().map((c) => c.id)).toEqual(TERZI_MODULES.map((m) => m.id));
    expect(validateRegistries()).toEqual([]);
    expect(diffPayload({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

import { resolveAllByKey, dictionaryRefError, roleTypeConflict } from "@/lib/config-kernel/scoped";

describe("scope-aware control plane", () => {
  const f = (scope_type: "company" | "role", scope_id: string, payload: any, version = 1) =>
    ({ kind: "custom_field", key: "order.object_class", scope_type, scope_id, status: "published", payload, version });
  const base = { label_uk: "Клас", type: "text" };

  it("одне поле на ключ незалежно від кількості скоупів; роль перемагає company", () => {
    const rows = [f("company", "terzi", base, 2), f("role", "sales_manager", { ...base, label_uk: "Клас (продажі)" }, 1)];
    const sales = resolveAllByKey("custom_field", rows, { roleKey: "sales_manager" });
    expect(sales.size).toBe(1);
    expect(sales.get("order.object_class")!.value.label_uk).toBe("Клас (продажі)");
    const fin = resolveAllByKey("custom_field", rows, { roleKey: "finance" });
    expect(fin.get("order.object_class")!.value.label_uk).toBe("Клас");
    expect(fin.get("order.object_class")!.version).toBe(2);
  });
  it("без рольового оверлею — як раніше; лише роль без company не видно іншим", () => {
    expect(resolveAllByKey("custom_field", [f("company", "terzi", base)], { roleKey: null }).get("order.object_class")!.value).toEqual(base);
    expect(resolveAllByKey("custom_field", [f("role", "foreman", base)], { roleKey: "finance" }).size).toBe(0);
  });
  it("посилання на довідник: має бути опублікований generic у скоупі цілі", () => {
    const d = (scope_type: string, scope_id: string) => ({ kind: "dictionary", key: "object_class", scope_type, scope_id, status: "published", payload: { label_uk: "Клас", items: [{ code: "a", label_uk: "A" }] } });
    const company = { type: "company" as const, id: "terzi" };
    const role = { type: "role" as const, id: "sales_manager" };
    expect(dictionaryRefError("object_class", [], company)).toMatch(/не опубліковано/);
    expect(dictionaryRefError("object_class", [d("company", "terzi")], company)).toBeNull();
    expect(dictionaryRefError("object_class", [d("role", "sales_manager")], company)).toMatch(/не опубліковано/);
    expect(dictionaryRefError("object_class", [d("role", "sales_manager")], role)).toBeNull();
    expect(dictionaryRefError("close_reasons", [], company)).toMatch(/не generic/);
    expect(dictionaryRefError(undefined, [], company)).toBeNull();
  });
  it("роль не змінює тип поля компанії", () => {
    expect(roleTypeConflict({ type: "role", id: "x" }, { type: "number" }, { type: "text" })).toMatch(/Тип/);
    expect(roleTypeConflict({ type: "role", id: "x" }, { type: "text" }, { type: "text" })).toBeNull();
    expect(roleTypeConflict({ type: "company", id: "terzi" }, { type: "number" }, { type: "text" })).toBeNull();
  });
});
