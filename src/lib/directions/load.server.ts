/**
 * Серверне завантаження конфігурації напрямку (чернетка або опублікована версія).
 * Використовує авторизований клієнт з middleware — RLS діє від імені користувача.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeDefinition } from "./runtime";

type Db = SupabaseClient<never, never, never>;

/** Чернетка напрямку: збирається з дочірніх таблиць конструктора. */
export async function loadDraftDefinition(db: Db, directionId: string): Promise<RuntimeDefinition> {
  const q = (t: string, order: string) =>
    (db as unknown as { from: (t: string) => any }).from(t).select("*").eq("direction_id", directionId).order(order);

  const [dir, fields, materials, works, logistics, coeffs, services, formulas] = await Promise.all([
    (db as unknown as { from: (t: string) => any }).from("directions").select("*").eq("id", directionId).single(),
    q("input_fields", "sort_order"),
    q("material_items", "sort_order"),
    q("work_items", "sort_order"),
    q("logistics_items", "sort_order"),
    q("coefficients", "coef_group"),
    q("additional_services", "sort_order"),
    q("formulas", "formula_key"),
  ]);
  if (dir.error) throw new Error(dir.error.message);

  return {
    id: dir.data.id,
    name: dir.data.name,
    category: dir.data.category,
    fields: fields.data ?? [],
    materials: materials.data ?? [],
    works: works.data ?? [],
    logistics: logistics.data ?? [],
    services: services.data ?? [],
    formulas: (formulas.data ?? []).map((f: Record<string, unknown>) => ({
      formula_key: f['formula_key'] as string,
      expression: f['expression'] as string,
      output_unit: (f['output_unit'] as string | null) ?? null,
    })),
    coefficients: (coeffs.data ?? []).map((c: Record<string, unknown>) => ({
      coef_group: c['coef_group'] as string,
      coef_key: c['coef_key'] as string,
      value: Number(c['value']),
    })),
  } as RuntimeDefinition;
}

/** Незмінна опублікована версія. Без version — остання опублікована. */
export async function loadPublishedDefinition(
  db: Db,
  directionId: string,
  version?: number | null,
): Promise<{ def: RuntimeDefinition; version: number } | null> {
  let query = (db as unknown as { from: (t: string) => any })
    .from("direction_versions")
    .select("version, config")
    .eq("direction_id", directionId)
    .order("version", { ascending: false })
    .limit(1);
  if (version) query = query.eq("version", version);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) return null;
  return { def: row.config as RuntimeDefinition, version: Number(row.version) };
}
