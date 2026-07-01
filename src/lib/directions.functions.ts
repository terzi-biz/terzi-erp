/**
 * Server functions для напрямів нової ERP-моделі TERZI.
 * Пілот: pvc_membrane. Далі — screed_v2, roofing_ruberoid_v2, insulation_v2, demolition_v2
 * (той самий контракт, різні direction_id).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculate, type DirectionManifest, type CatalogItem } from "./engines/direction-engine";

async function loadManifest(supabase: any, directionId: string): Promise<DirectionManifest> {
  const [dir, inputs, mats, works, logs, adds, coefs, sects, forms] = await Promise.all([
    supabase.from("directions").select("id,name,category").eq("id", directionId).maybeSingle(),
    supabase.from("input_fields").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("material_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("work_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("logistics_items").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("additional_services").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("coefficients").select("*").eq("direction_id", directionId),
    supabase.from("estimate_sections").select("*").eq("direction_id", directionId).order("sort_order"),
    supabase.from("formulas").select("*").eq("direction_id", directionId),
  ]);
  const errs = [dir, inputs, mats, works, logs, adds, coefs, sects, forms].filter((r) => r.error).map((r) => r.error);
  if (errs.length) { console.error("loadManifest", errs); throw new Error("Не вдалося завантажити напрям"); }
  if (!dir.data) throw new Error("Напрям не знайдено");
  const cast = (rows: any[]): CatalogItem[] => (rows ?? []).map((r) => ({ ...r, cost_price: Number(r.cost_price) }));
  return {
    direction: dir.data,
    inputs: (inputs.data ?? []).map((f: any) => ({ ...f, default_value: f.default_value })),
    materials: cast(mats.data ?? []),
    works: cast(works.data ?? []),
    logistics: cast(logs.data ?? []),
    additional: cast(adds.data ?? []),
    coefficients: (coefs.data ?? []).map((c: any) => ({ ...c, value: Number(c.value) })),
    sections: sects.data ?? [],
    formulas: forms.data ?? [],
  };
}

export const getDirectionManifest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { directionId: string }) => z.object({ directionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => loadManifest(context.supabase, data.directionId));

const inputsSchema = z.record(z.string(), z.union([z.number(), z.string()]));

export const calculateDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { directionId: string; inputs: Record<string, number | string> }) =>
    z.object({ directionId: z.string().min(1), inputs: inputsSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const manifest = await loadManifest(context.supabase, data.directionId);
    const numericInputs: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.inputs)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) numericInputs[k] = n;
    }
    return calculate(manifest, numericInputs);
  });

const savePayloadSchema = z.object({
  directionId: z.string().min(1),
  inputs: inputsSchema,
  clientName: z.string().max(200).optional().nullable(),
  clientPhone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  manager: z.string().max(200).optional().nullable(),
  number: z.string().min(1).max(100),
});

export const saveDirectionEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof savePayloadSchema>) => savePayloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const manifest = await loadManifest(context.supabase, data.directionId);
    const numericInputs: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.inputs)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) numericInputs[k] = n;
    }
    const result = calculate(manifest, numericInputs);
    const clientLines = result.lines
      .filter((l) => l.clientVisible)
      .map((l) => ({ block: l.block, name: l.name, unit: l.unit, qty: l.qty, price: l.pricePerUnit, sum: l.sum }));
    const internalLines = result.lines.map((l) => ({ ...l }));
    const module = manifest.direction.category === "roofing" ? "roofing" : "screed";
    const { data: row, error } = await context.supabase.from("estimates").insert({
      number: data.number,
      module,
      direction_id: data.directionId,
      status: "draft",
      client_name: data.clientName ?? null,
      client_phone: data.clientPhone ?? null,
      address: data.address ?? null,
      manager: data.manager ?? null,
      area: numericInputs.area_m2 ?? null,
      total_client: result.totals.totalClient,
      total_cost: result.totals.totalCost,
      gross_profit: result.totals.grossProfit,
      margin_percent: result.totals.marginPercent,
      calculation_json: result as any,
      client_lines: clientLines as any,
      internal_lines: internalLines as any,
      engine_version: result.engineVersion,
      payload: { inputs: numericInputs } as any,
      user_id: context.userId,
    }).select("id, number").single();
    if (error) { console.error("saveDirectionEstimate", error); throw new Error("Не вдалося зберегти кошторис"); }
    return row;
  });
