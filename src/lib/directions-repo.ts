/**
 * Клієнт-сайд CRUD-обгортки над таблицями напрямків.
 * RLS: читання — будь-який auth; запис — admin.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DirectionDefField, DirectionDefItem } from "./engines/direction-engine";
import type { RuntimeDefinition, RuntimeItem, DerivedFormula } from "./directions/runtime";

export interface DirectionRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
}

export async function listDirections(): Promise<DirectionRow[]> {
  const { data, error } = await supabase.from("directions").select("id,name,category,description,active").order("name");
  if (error) throw error;
  return (data ?? []) as DirectionRow[];
}

export async function upsertDirection(row: DirectionRow): Promise<void> {
  const { error } = await supabase.from("directions").upsert(row);
  if (error) throw error;
}

export async function deleteDirection(id: string): Promise<void> {
  const { error } = await supabase.from("directions").delete().eq("id", id);
  if (error) throw error;
}

export async function loadDefinition(directionId: string): Promise<RuntimeDefinition> {
  const [dir, fields, materials, works, logistics, coeffs, services, formulas] = await Promise.all([
    supabase.from("directions").select("*").eq("id", directionId).single(),
    supabase.from("input_fields").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("material_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("work_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("logistics_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("coefficients").select("*").eq("direction_id", directionId).order("coef_group"),
    supabase.from("additional_services").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("formulas").select("*").eq("direction_id", directionId).order("formula_key"),
  ]);
  if (dir.error) throw dir.error;
  return {
    id: dir.data.id,
    name: dir.data.name,
    category: dir.data.category,
    fields: (fields.data ?? []) as DirectionDefField[],
    materials: ((materials.data ?? []) as unknown as DirectionDefItem[]),
    works: ((works.data ?? []) as unknown as DirectionDefItem[]),
    logistics: ((logistics.data ?? []) as unknown as DirectionDefItem[]),
    services: ((services.data ?? []) as unknown as RuntimeItem[]),
    formulas: (formulas.data ?? []).map((f) => ({
      formula_key: f.formula_key,
      expression: f.expression,
      output_unit: f.output_unit,
    })) as DerivedFormula[],
    coefficients: (coeffs.data ?? []).map((c) => ({
      coef_group: c.coef_group,
      coef_key: c.coef_key,
      value: Number(c.value),
    })),
  };
}

type TableName = "input_fields" | "material_items" | "work_items" | "logistics_items" | "coefficients" | "additional_services" | "formulas";

export async function upsertChild<T extends Record<string, unknown>>(
  table: TableName,
  row: T,
): Promise<void> {
  // supabase-js типів для варіативного table немає — це адмін-only CRUD, тому кастимо.
  const { error } = await (supabase.from(table) as unknown as { upsert: (r: unknown) => Promise<{ error: unknown }> }).upsert(row);
  if (error) throw error as Error;
}

export async function deleteChild(table: TableName, id: string): Promise<void> {
  const { error } = await (supabase.from(table) as unknown as { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } }).delete().eq("id", id);
  if (error) throw error as Error;
}
