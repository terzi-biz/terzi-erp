import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listSchema = z.object({ estimate_id: z.string().uuid() });

const saveSchema = z.object({
  estimate_id: z.string().uuid(),
  order_id: z.string().uuid().nullish(),
  item_key: z.string().min(1),
  item_name: z.string().min(1),
  unit: z.string().default(""),
  plan_qty: z.number().finite().default(0),
  fact_qty: z.number().finite().default(0),
  offcut_qty: z.number().finite().default(0),
  writeoff_qty: z.number().finite().default(0),
  labor_hours: z.number().finite().default(0),
  deviation_reason: z.string().nullish(),
});

/** Факт по позиціях покрівлі для конкретного кошторису. */
export const listRoofingActuals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("roofing_actuals")
      .select("*")
      .eq("estimate_id", data.estimate_id);
    if (error) throw new Error("Не вдалося завантажити факт по об'єкту");
    return rows ?? [];
  });

/** Створює або оновлює факт по одній позиції (унікальність — кошторис + ключ позиції). */
export const saveRoofingActual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: findError } = await context.supabase
      .from("roofing_actuals")
      .select("id")
      .eq("estimate_id", data.estimate_id)
      .eq("item_key", data.item_key)
      .maybeSingle();
    if (findError) throw new Error("Не вдалося перевірити наявний факт");

    const payload = {
      estimate_id: data.estimate_id,
      order_id: data.order_id ?? null,
      item_key: data.item_key,
      item_name: data.item_name,
      unit: data.unit,
      plan_qty: data.plan_qty,
      fact_qty: data.fact_qty,
      offcut_qty: data.offcut_qty,
      writeoff_qty: data.writeoff_qty,
      labor_hours: data.labor_hours,
      deviation_reason: data.deviation_reason ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await context.supabase
        .from("roofing_actuals")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error("Не вдалося зберегти факт");
      return { id: existing.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("roofing_actuals")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error("Не вдалося зберегти факт");
    return { id: inserted.id };
  });
