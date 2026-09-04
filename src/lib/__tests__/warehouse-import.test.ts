import { describe, expect, it } from "vitest";
import {
  normalizeRow,
  parseStagingJson,
  reservedByUnit,
  rowIssues,
  validateStagingFile,
} from "@/lib/warehouse-import";

const file = JSON.stringify({
  schema_version: "1.0.0",
  bundle_id: "terzi-warehouse-test",
  production_import_allowed: false,
  counts: { requirements: 1, supplier_products: 1, legacy_rows: 1 },
  requirements: [
    {
      external_key: "req-1",
      name: "XPS 50 мм",
      source_code: "XPS-50",
      group_label: "Утеплювач",
      module_candidates: ["insulation"],
      unit: { source_label: "м2", base_unit_candidate: "m2" },
      packaging: { source_label: "упаковка", base_units_per_pack: { value: 5.76 }, verification_status: "verified" },
      attributes: { thickness: { value: 50, unit: "мм", verification_status: "verified" }, density: { min_value: 30, max_value: 35, unit: "кг/м³" } },
      activation_allowed: true,
      source: { row_sha256: "a".repeat(64) },
    },
  ],
  supplier_products: [{ external_key: "sup-1", name_source: "Плита XPS", source: { row_sha256: "b".repeat(64) } }],
  legacy_rows: [{ external_key: "leg-1", name_source: "Стара позиція", historical_price_source: "120", source: { row_sha256: "c".repeat(64) } }],
});

describe("проміжний імпорт складу", () => {
  it("розбирає файл і бачить усі три джерела", () => {
    const p = parseStagingJson(file);
    expect(p.rows).toHaveLength(3);
    expect(validateStagingFile(p)).toEqual([]);
  });

  it("ловить розбіжність лічильників", () => {
    const bad = JSON.parse(file);
    bad.counts.requirements = 5;
    expect(validateStagingFile(parseStagingJson(JSON.stringify(bad))).join()).toContain("Розбіжність");
  });

  it("нормалізує вимогу без вигаданих значень", () => {
    const n = normalizeRow("requirement", JSON.parse(file).requirements[0]);
    expect(n.unit_erp).toBe("м²");
    expect(n.module_resolved).toBe("insulation");
    expect(n.pack_factor).toBe(5.76);
    expect(n.price_known).toBe(false);
    expect(n.price_value).toBeNull();
    expect(n.attributes.density.min_value).toBe(30);
    expect(n.attributes.density.value).toBeNull();
  });

  it("блокує активацію рядків постачальника та архіву", () => {
    const sup = rowIssues("supplier_product", normalizeRow("supplier_product", JSON.parse(file).supplier_products[0]));
    const leg = rowIssues("legacy_row", normalizeRow("legacy_row", JSON.parse(file).legacy_rows[0]));
    expect(sup.some((i) => i.code === "supplier_only" && i.blocking)).toBe(true);
    expect(leg.some((i) => i.code === "legacy_only" && i.blocking)).toBe(true);
  });

  it("вимагає явного зіставлення одиниці та напрямку", () => {
    const raw = { external_key: "x", name: "Позиція", module_candidates: ["screed", "insulation"], unit: { base_unit_candidate: "kanister" } };
    const issues = rowIssues("requirement", normalizeRow("requirement", raw));
    expect(issues.some((i) => i.code === "unit_unmapped")).toBe(true);
    expect(issues.some((i) => i.code === "module_unmapped")).toBe(true);
  });

  it("рахує резерв окремо за одиницями", () => {
    const out = reservedByUnit([
      { qty: 10, unit: "кг" },
      { qty: 5, unit: "м²" },
      { qty: 2.5, unit: "кг" },
      { qty: 1, unit: null },
    ]);
    expect(out.find((r) => r.unit === "кг")?.qty).toBe(12.5);
    expect(out.find((r) => r.unit === "м²")?.qty).toBe(5);
    expect(out.find((r) => r.unit === "—")?.qty).toBe(1);
  });
});
