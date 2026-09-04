/**
 * Чистий шар проміжного імпорту складу (schema_version 1.0.0).
 * Без звернень до БД: розбір файлу, нормалізація рядка, перелік зауважень.
 * Використовується і на клієнті (попередній перегляд), і на сервері (повторна перевірка).
 */

export const STAGING_SCHEMA_VERSION = "1.0.0";
export const STAGING_MAX_BYTES = 16 * 1024 * 1024;

export type SourceKind = "requirement" | "supplier_product" | "legacy_row";

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  requirement: "Вимоги TERZI",
  supplier_product: "Каталог постачальника",
  legacy_row: "Архівні рядки",
};

export const DECISION_LABELS: Record<string, string> = {
  needs_review: "На перевірці",
  verified: "Перевірено",
  linked: "Звʼязано",
  created: "Створено SKU",
  excluded: "Виключено",
};

/** Довідник базових одиниць: ключ джерела → одиниця ERP. */
export const BASE_UNIT_MAP: Record<string, string> = {
  kg: "кг",
  t: "т",
  m: "м",
  m2: "м²",
  m3: "м³",
  l: "л",
  pcs: "шт",
  pack: "уп",
  roll: "рул",
  bag: "мішок",
  set: "компл",
};

export type AttributeValue = {
  source_text: string | null;
  unit: string | null;
  value: number | null;
  min_value: number | null;
  max_value: number | null;
  verification_status: string | null;
};

export const ATTRIBUTE_KEYS = [
  "thickness",
  "density",
  "thermal_conductivity",
  "compressive_stress_cs10",
  "surface_mass",
  "width",
  "length",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_LABELS: Record<string, string> = {
  thickness: "Товщина",
  density: "Щільність",
  thermal_conductivity: "Теплопровідність λ",
  compressive_stress_cs10: "Міцність на стиск CS(10)",
  surface_mass: "Поверхнева маса",
  width: "Ширина",
  length: "Довжина",
};

export type StagingHeader = {
  schema_version: string;
  bundle_id: string;
  created_on: string | null;
  production_import_allowed: boolean;
  source_commit: string | null;
  counts: Record<string, number>;
};

export type StagingRow = {
  source_kind: SourceKind;
  external_key: string;
  source_hash: string;
  raw: Record<string, unknown>;
};

export type ParsedStagingFile = {
  header: StagingHeader;
  rows: StagingRow[];
  fileBytes: number;
  actualCounts: Record<SourceKind, number>;
};

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function rowHash(raw: Record<string, unknown>): string {
  const src = asRecord(raw.source);
  return str(src.row_sha256) ?? "";
}

/** Розбір вмісту JSON у заголовок + плоский список рядків трьох масивів. */
export function parseStagingJson(text: string): ParsedStagingFile {
  const doc = asRecord(JSON.parse(text));
  const counts = asRecord(doc.counts) as Record<string, number>;
  const header: StagingHeader = {
    schema_version: String(doc.schema_version ?? ""),
    bundle_id: String(doc.bundle_id ?? ""),
    created_on: str(doc.created_on),
    production_import_allowed: doc.production_import_allowed === true,
    source_commit: str(asRecord(doc.target).source_commit),
    counts,
  };

  const rows: StagingRow[] = [];
  const push = (kind: SourceKind, list: unknown[]) => {
    for (const entry of list) {
      const raw = asRecord(entry);
      const key = str(raw.external_key);
      if (!key) continue;
      rows.push({ source_kind: kind, external_key: key, source_hash: rowHash(raw), raw });
    }
  };
  push("requirement", asArray(doc.requirements));
  push("supplier_product", asArray(doc.supplier_products));
  push("legacy_row", asArray(doc.legacy_rows));

  const actualCounts = {
    requirement: asArray(doc.requirements).length,
    supplier_product: asArray(doc.supplier_products).length,
    legacy_row: asArray(doc.legacy_rows).length,
  };

  return { header, rows, fileBytes: new TextEncoder().encode(text).length, actualCounts };
}

/** Структурна перевірка заголовка та лічильників. Повертає перелік проблем. */
export function validateStagingFile(parsed: ParsedStagingFile): string[] {
  const p: string[] = [];
  const { header, actualCounts, fileBytes } = parsed;
  if (header.schema_version !== STAGING_SCHEMA_VERSION) {
    p.push(`Непідтримувана версія схеми: ${header.schema_version || "—"} (очікується ${STAGING_SCHEMA_VERSION})`);
  }
  if (!header.bundle_id) p.push("Відсутній bundle_id");
  if (fileBytes > STAGING_MAX_BYTES) p.push(`Файл завеликий: ${(fileBytes / 1048576).toFixed(1)} MiB`);
  const expect: [SourceKind, string][] = [
    ["requirement", "requirements"],
    ["supplier_product", "supplier_products"],
    ["legacy_row", "legacy_rows"],
  ];
  for (const [kind, countKey] of expect) {
    const declared = Number(header.counts?.[countKey]);
    if (Number.isFinite(declared) && declared !== actualCounts[kind]) {
      p.push(`Розбіжність лічильника ${countKey}: заявлено ${declared}, у файлі ${actualCounts[kind]}`);
    }
  }
  if (parsed.rows.length === 0) p.push("У файлі немає рядків із external_key");
  const keys = new Set<string>();
  for (const r of parsed.rows) {
    if (keys.has(r.external_key)) { p.push(`Дубль external_key у файлі: ${r.external_key}`); break; }
    keys.add(r.external_key);
  }
  return p;
}

export type NormalizedRow = {
  name: string | null;
  sku: string | null;
  category: string | null;
  unit_source: string | null;
  unit_candidate: string | null;
  unit_erp: string | null;
  module_candidates: string[];
  module_resolved: string | null;
  attributes: Record<string, AttributeValue>;
  pack_label: string | null;
  pack_factor: number | null;
  pack_status: string | null;
  price_known: boolean;
  price_value: number | null;
  activation_allowed: boolean;
  storage_conditions: string | null;
  brand_source: string | null;
  spec_note: string | null;
  origin_note: string | null;
};

const KNOWN_MODULES = new Set(["screed", "roofing_pvc", "roofing_rub", "roofing", "insulation", "demolition", "common"]);

/** Нормалізація сирого рядка джерела. Нічого не вигадує: невідоме лишається null. */
export function normalizeRow(kind: SourceKind, raw: Record<string, unknown>): NormalizedRow {
  const attributes: Record<string, AttributeValue> = {};
  const rawAttrs = asRecord(raw.attributes);
  for (const key of ATTRIBUTE_KEYS) {
    const a = asRecord(rawAttrs[key]);
    if (!Object.keys(a).length) continue;
    attributes[key] = {
      source_text: str(a.source_text),
      unit: str(a.unit),
      value: num(a.value),
      min_value: num(a.min_value),
      max_value: num(a.max_value),
      verification_status: str(a.verification_status) ?? "unknown",
    };
  }

  const unit = asRecord(raw.unit);
  const packaging = asRecord(raw.packaging);
  const packQty = asRecord(packaging.base_units_per_pack);
  const unitCandidate = kind === "requirement" ? str(unit.base_unit_candidate) : str(raw.unit_source);
  const moduleCandidates = asArray(raw.module_candidates).map((m) => String(m)).filter(Boolean);

  const price =
    kind === "requirement" ? num(raw.confirmed_buy_price)
    : kind === "supplier_product" ? num(raw.confirmed_quote_price)
    : null;

  return {
    name: str(raw.name) ?? str(raw.name_source),
    sku: kind === "requirement" ? str(raw.source_code) : null,
    category: str(raw.group_label),
    unit_source: str(unit.source_label) ?? str(raw.requested_unit_source) ?? str(raw.unit_source),
    unit_candidate: unitCandidate,
    unit_erp: unitCandidate ? (BASE_UNIT_MAP[unitCandidate] ?? null) : null,
    module_candidates: moduleCandidates,
    module_resolved: moduleCandidates.length === 1 && KNOWN_MODULES.has(moduleCandidates[0]) ? moduleCandidates[0] : null,
    attributes,
    pack_label: str(packaging.source_label),
    pack_factor: num(packQty.value),
    pack_status: str(packaging.verification_status),
    price_known: price != null,
    price_value: price,
    activation_allowed: raw.activation_allowed === true,
    storage_conditions: str(raw.storage_conditions_source),
    brand_source: str(raw.brand_series_source),
    spec_note: str(raw.specification_required) ?? str(raw.classification_note),
    origin_note: kind === "legacy_row"
      ? `Архів: залишок «${str(raw.historical_balance_source) ?? "—"}», ціна «${str(raw.historical_price_source) ?? "—"}» на ${str(raw.balance_as_of_source) ?? "—"}`
      : kind === "supplier_product"
        ? `Постачальник: ${str(raw.supplier_registry_key) ?? "—"}, картка ${str(raw.supplier_product_id) ?? "—"}`
        : null,
  };
}

export type RowIssue = { code: string; message: string; blocking: boolean };

/** Зауваження рядка. blocking = позиція не може бути активована без ручного рішення. */
export function rowIssues(kind: SourceKind, n: NormalizedRow): RowIssue[] {
  const out: RowIssue[] = [];
  if (!n.name) out.push({ code: "name_missing", message: "Немає назви позиції", blocking: true });
  if (kind === "requirement") {
    if (!n.unit_candidate) out.push({ code: "unit_missing", message: "Не визначена базова одиниця", blocking: true });
    else if (!n.unit_erp) out.push({ code: "unit_unmapped", message: `Одиниця «${n.unit_candidate}» не зіставлена з одиницею ERP`, blocking: true });
    if (!n.module_resolved) {
      out.push({
        code: "module_unmapped",
        message: n.module_candidates.length ? `Напрямок потребує явного зіставлення: ${n.module_candidates.join(", ")}` : "Напрямок не вказаний",
        blocking: true,
      });
    }
    if (n.pack_factor == null || n.pack_factor <= 0) out.push({ code: "pack_unknown", message: "Коефіцієнт упаковки невідомий", blocking: false });
    else if (n.pack_status !== "verified") out.push({ code: "pack_unverified", message: "Упаковка не підтверджена", blocking: false });
    const incomplete = Object.entries(n.attributes).filter(([, a]) => a.value == null && a.min_value == null && a.max_value == null);
    if (incomplete.length) out.push({ code: "attributes_incomplete", message: `Характеристики без значення: ${incomplete.length}`, blocking: false });
  }
  if (kind === "supplier_product") {
    out.push({ code: "supplier_only", message: "Картка постачальника: потребує зіставлення з SKU вручну", blocking: true });
  }
  if (kind === "legacy_row") {
    out.push({ code: "legacy_only", message: "Архівний рядок: історичні залишок і ціна не переносяться в облік", blocking: true });
  }
  if (!n.price_known) out.push({ code: "price_unknown", message: "Ціна невідома (не нуль)", blocking: false });
  if (!n.activation_allowed) out.push({ code: "activation_blocked", message: "Джерело забороняє автоматичну активацію", blocking: true });
  return out;
}

/** SHA-256 у hex; працює і в браузері, і у воркері. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Сума резервів окремо за одиницями виміру — кг/м²/шт не змішуються. */
export function reservedByUnit(rows: { qty?: number | null; unit?: string | null }[]): { unit: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const unit = (r.unit ?? "—").trim() || "—";
    map.set(unit, (map.get(unit) ?? 0) + (Number(r.qty) || 0));
  }
  return [...map.entries()]
    .map(([unit, qty]) => ({ unit, qty: Math.round(qty * 1000) / 1000 }))
    .sort((a, b) => b.qty - a.qty);
}
