/**
 * Хвиля 3 — версіонування напрямків.
 *
 * Чернетка (таблиці directions/input_fields/...) → публікація (незмінний знімок
 * у direction_versions) → порівняння версій → відкат чернетки до версії.
 *
 * Опублікована версія НЕ змінюється й НЕ видаляється (RLS дозволяє лише
 * SELECT + INSERT). Відкат = створення нової чернетки з конфігу версії.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadDefinition, upsertChild, deleteChild } from "@/lib/directions-repo";
import { DIRECTION_ENGINE_VERSION, type RuntimeDefinition } from "./runtime";

export interface DirectionVersionRow {
  id: string;
  direction_id: string;
  version: number;
  config: RuntimeDefinition;
  engine_version: string;
  note: string | null;
  published_by: string | null;
  published_at: string;
}

type ChildTable =
  | "input_fields" | "material_items" | "work_items"
  | "logistics_items" | "coefficients" | "additional_services" | "formulas";

const CHILD_MAP: { table: ChildTable; key: keyof RuntimeDefinition }[] = [
  { table: "input_fields", key: "fields" },
  { table: "material_items", key: "materials" },
  { table: "work_items", key: "works" },
  { table: "logistics_items", key: "logistics" },
  { table: "additional_services", key: "services" },
  { table: "formulas", key: "formulas" },
  { table: "coefficients", key: "coefficients" },
];

export async function listVersions(directionId: string): Promise<DirectionVersionRow[]> {
  const { data, error } = await supabase
    .from("direction_versions")
    .select("*")
    .eq("direction_id", directionId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DirectionVersionRow[];
}

/** Публікація: знімок поточної чернетки + інкремент номера версії. */
export async function publishVersion(directionId: string, note: string): Promise<number> {
  const def = await loadDefinition(directionId);
  const existing = await listVersions(directionId);
  const version = (existing[0]?.version ?? 0) + 1;
  const { data: userRes } = await supabase.auth.getUser();

  const { error } = await supabase.from("direction_versions").insert({
    direction_id: directionId,
    version,
    config: def as unknown as Record<string, unknown>,
    engine_version: DIRECTION_ENGINE_VERSION,
    note: note || null,
    published_by: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;

  const { error: upErr } = await supabase
    .from("directions")
    .update({ current_version: version, status: "published" } as never)
    .eq("id", directionId);
  if (upErr) throw upErr;
  return version;
}

/** Відкат чернетки: повністю переписує дочірні записи з конфігу версії. */
export async function restoreVersion(row: DirectionVersionRow): Promise<void> {
  const current = await loadDefinition(row.direction_id);

  // 1. Прибрати поточну чернетку (версії залишаються недоторканими).
  const deletions: Promise<unknown>[] = [];
  for (const { table, key } of CHILD_MAP) {
    const arr = (current[key] ?? []) as unknown as { id?: string }[];
    for (const r of arr) if (r.id) deletions.push(deleteChild(table, r.id));
  }
  await Promise.all(deletions);

  // 2. Записати конфіг версії як нову чернетку.
  const inserts: Promise<unknown>[] = [];
  for (const { table, key } of CHILD_MAP) {
    const arr = (row.config[key] ?? []) as unknown as Record<string, unknown>[];
    for (const r of arr) {
      const { id: _drop, created_at: _c, updated_at: _u, ...rest } = r;
      inserts.push(upsertChild(table, { ...rest, direction_id: row.direction_id }));
    }
  }
  await Promise.all(inserts);

  await supabase
    .from("directions")
    .update({ status: "draft" } as never)
    .eq("id", row.direction_id);
}

export interface DiffEntry {
  block: string;
  key: string;
  kind: "added" | "removed" | "changed";
  details: string;
}

const IGNORED = new Set(["id", "created_at", "updated_at", "direction_id"]);

function rowKey(block: string, r: Record<string, unknown>): string {
  return String(r["field_key"] ?? r["formula_key"] ?? r["coef_key"] ?? r["code"] ?? r["name"] ?? `${block}?`);
}

/** Детермінований діф двох конфігів (порівнюємо за бізнес-ключем рядка). */
export function diffConfigs(a: RuntimeDefinition, b: RuntimeDefinition): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const { key } of CHILD_MAP) {
    const block = String(key);
    const left = ((a[key] ?? []) as unknown as Record<string, unknown>[]);
    const right = ((b[key] ?? []) as unknown as Record<string, unknown>[]);
    const lm = new Map(left.map((r) => [rowKey(block, r), r]));
    const rm = new Map(right.map((r) => [rowKey(block, r), r]));

    for (const [k, r] of rm) {
      if (!lm.has(k)) { out.push({ block, key: k, kind: "added", details: "новий рядок" }); continue; }
      const l = lm.get(k)!;
      const changes: string[] = [];
      const fields = new Set([...Object.keys(l), ...Object.keys(r)].filter((f) => !IGNORED.has(f)));
      for (const f of fields) {
        const lv = JSON.stringify(l[f] ?? null);
        const rv = JSON.stringify(r[f] ?? null);
        if (lv !== rv) changes.push(`${f}: ${lv} → ${rv}`);
      }
      if (changes.length) out.push({ block, key: k, kind: "changed", details: changes.join("; ") });
    }
    for (const [k] of lm) if (!rm.has(k)) out.push({ block, key: k, kind: "removed", details: "рядок прибрано" });
  }
  return out;
}
