/** Серверні операції універсального імпорту/експорту (лише сервер). */
import { admin, loadActor, requirePermission, writeAudit, type Actor } from "../access.server";
import { EXCHANGE_ENTITIES, getEntity, type ExchangeEntity, type ExchangeField } from "./registry";

export type ImportIssue = { row: number; message: string };
export type ImportReport = {
  ok: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  issues: ImportIssue[];
  preview: Record<string, unknown>[];
};

async function ensure(userId: string, entity: ExchangeEntity, action: "export" | "create"): Promise<Actor> {
  const actor = await loadActor(userId);
  if (actor.canManage) return actor;
  return requirePermission(userId, entity.module, action);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s|\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function toBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "так", "да", "yes", "y", "+"].includes(s)) return true;
  if (["0", "false", "ні", "нет", "no", "n", "-"].includes(s)) return false;
  return null;
}

function toDate(v: unknown, withTime: boolean): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return withTime ? v.toISOString() : v.toISOString().slice(0, 10);
  const raw = String(v).trim();
  // Excel serial
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const ms = (Number(raw) - 25569) * 86400 * 1000;
    const dd = new Date(ms);
    return withTime ? dd.toISOString() : dd.toISOString().slice(0, 10);
  }
  const dmy = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let iso = raw;
  if (dmy) {
    const [, D, M, Y, h = "00", m = "00", s = "00"] = dmy;
    iso = `${Y}-${M.padStart(2, "0")}-${D.padStart(2, "0")}T${h.padStart(2, "0")}:${m}:${s}`;
  } else if (/^\d{4}-\d{2}-\d{2} /.test(raw)) {
    iso = raw.replace(" ", "T");
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return withTime ? parsed.toISOString() : parsed.toISOString().slice(0, 10);
}

function coerce(field: ExchangeField, value: unknown): { value: unknown; error?: string } {
  if (value === null || value === undefined || String(value).trim() === "") return { value: null };
  switch (field.type) {
    case "number": {
      const num = toNumber(value);
      return num === null ? { value: null, error: `«${field.label}»: не число (${String(value)})` } : { value: num };
    }
    case "boolean": {
      const bool = toBoolean(value);
      return bool === null ? { value: null, error: `«${field.label}»: очікується так/ні` } : { value: bool };
    }
    case "date":
    case "datetime": {
      const dv = toDate(value, field.type === "datetime");
      return dv === null ? { value: null, error: `«${field.label}»: некоректна дата (${String(value)})` } : { value: dv };
    }
    default: {
      const s = String(value).trim();
      if (field.values && field.values.length && !field.values.includes(s)) {
        return { value: null, error: `«${field.label}»: допустимі значення ${field.values.join(", ")}` };
      }
      return { value: s };
    }
  }
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/* ------------------------------ Експорт ------------------------------ */

export async function exportEntityOp(userId: string, input: { entityKey: string; limit?: number }) {
  const entity = getEntity(input.entityKey);
  if (!entity) throw new Error("Невідомий розділ для вивантаження");
  const actor = await ensure(userId, entity, "export");
  const db = await admin();

  const cols = [...entity.fields.map((f) => f.key), ...(entity.lookups ?? []).map((l) => l.column)];
  const limit = Math.min(Math.max(input.limit ?? 5000, 1), 20000);
  let query = db.from(entity.table).select(cols.join(",")).limit(limit);
  if (entity.orderBy) query = query.order(entity.orderBy, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  // Підставляємо людські назви для зовнішніх ключів.
  const labelMaps: Record<string, Map<string, string>> = {};
  for (const lookup of entity.lookups ?? []) {
    const ids = Array.from(new Set(rows.map((r) => r[lookup.column]).filter(Boolean))) as string[];
    const map = new Map<string, string>();
    if (ids.length) {
      const { data: refs } = await db.from(lookup.table).select(`id,${lookup.matchColumns[0]}`).in("id", ids);
      for (const ref of (refs ?? []) as any[]) map.set(ref.id, String(ref[lookup.matchColumns[0]!] ?? ""));
    }
    labelMaps[lookup.key] = map;
  }

  const out = rows.map((r) => {
    const record: Record<string, unknown> = {};
    for (const lookup of entity.lookups ?? []) {
      record[lookup.label] = labelMaps[lookup.key]?.get(String(r[lookup.column] ?? "")) ?? "";
    }
    for (const f of entity.fields) {
      const v = r[f.key];
      record[f.label] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    }
    return record;
  });

  await writeAudit(actor, {
    module: entity.module,
    action: "export",
    entityType: entity.table,
    entityLabel: `Вивантаження: ${entity.label} (${out.length})`,
    isCritical: true,
  });

  return { entityKey: entity.key, label: entity.label, count: out.length, rows: out };
}

/* ------------------------------ Імпорт ------------------------------- */

export async function importEntityOp(
  userId: string,
  input: { entityKey: string; rows: Record<string, unknown>[]; dryRun: boolean; updateExisting: boolean },
): Promise<ImportReport> {
  const entity = getEntity(input.entityKey);
  if (!entity) throw new Error("Невідомий розділ для імпорту");
  if (entity.exportOnly) throw new Error(`Розділ «${entity.label}» доступний лише для вивантаження`);
  const actor = await ensure(userId, entity, "create");
  const db = await admin();

  const issues: ImportIssue[] = [];
  const prepared: { row: number; payload: Record<string, unknown> }[] = [];

  // Кеші підстановок: значення → id
  const lookupCache: Record<string, Map<string, string>> = {};
  async function resolveLookup(lookupKey: string, table: string, matchColumns: string[], value: string): Promise<string | null> {
    const cacheKey = `${table}:${norm(value)}`;
    const cache = (lookupCache[lookupKey] ??= new Map());
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    for (const col of matchColumns) {
      const { data } = await db.from(table).select("id").ilike(col, value).limit(1);
      const id = (data ?? [])[0]?.id as string | undefined;
      if (id) {
        cache.set(cacheKey, id);
        return id;
      }
    }
    cache.set(cacheKey, "");
    return null;
  }

  for (let i = 0; i < input.rows.length; i++) {
    const raw = input.rows[i] ?? {};
    const rowNo = i + 2; // з урахуванням рядка заголовків
    const payload: Record<string, unknown> = {};
    let rowFailed = false;

    for (const field of entity.fields) {
      const { value, error } = coerce(field, raw[field.key]);
      if (error) {
        issues.push({ row: rowNo, message: error });
        rowFailed = true;
        continue;
      }
      if (field.required && (value === null || value === "")) {
        issues.push({ row: rowNo, message: `«${field.label}»: обов'язкове поле` });
        rowFailed = true;
        continue;
      }
      if (value !== null) payload[field.key] = value;
    }

    for (const lookup of entity.lookups ?? []) {
      const val = raw[lookup.key];
      if (val === null || val === undefined || String(val).trim() === "") continue;
      const id = await resolveLookup(lookup.key, lookup.table, lookup.matchColumns, String(val).trim());
      if (!id) {
        issues.push({ row: rowNo, message: `«${lookup.label}»: не знайдено «${String(val)}»` });
        continue;
      }
      payload[lookup.column] = id;
    }

    if (rowFailed || Object.keys(payload).length === 0) continue;
    if (entity.ownerColumn) payload[entity.ownerColumn] = userId;
    prepared.push({ row: rowNo, payload });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of prepared) {
    // Пошук існуючого запису за ключем співставлення.
    let existingId: string | null = null;
    for (const col of entity.matchColumns) {
      const val = item.payload[col];
      if (val === null || val === undefined || String(val).trim() === "") continue;
      const { data } = await db.from(entity.table).select("id").ilike(col, String(val)).limit(1);
      const found = (data ?? [])[0]?.id as string | undefined;
      if (found) {
        existingId = found;
        break;
      }
    }

    if (existingId && !input.updateExisting) {
      skipped++;
      continue;
    }

    if (input.dryRun) {
      if (existingId) updated++;
      else created++;
      continue;
    }

    if (existingId) {
      const patch = { ...item.payload };
      if (entity.ownerColumn) delete patch[entity.ownerColumn];
      const { error } = await db.from(entity.table).update(patch).eq("id", existingId);
      if (error) {
        issues.push({ row: item.row, message: error.message });
        continue;
      }
      updated++;
    } else {
      const { error } = await db.from(entity.table).insert(item.payload);
      if (error) {
        issues.push({ row: item.row, message: error.message });
        continue;
      }
      created++;
    }
  }

  if (!input.dryRun) {
    await writeAudit(actor, {
      module: entity.module,
      action: "import",
      entityType: entity.table,
      entityLabel: `Імпорт: ${entity.label} (нових ${created}, оновлених ${updated})`,
      isCritical: true,
      newValue: { created, updated, skipped, issues: issues.length },
    });
  }

  return {
    ok: issues.length === 0,
    total: input.rows.length,
    created,
    updated,
    skipped,
    dryRun: input.dryRun,
    issues: issues.slice(0, 100),
    preview: prepared.slice(0, 10).map((p) => p.payload),
  };
}

export function listEntitiesOp() {
  return EXCHANGE_ENTITIES.map((e) => ({ key: e.key, label: e.label, group: e.group, exportOnly: Boolean(e.exportOnly) }));
}
