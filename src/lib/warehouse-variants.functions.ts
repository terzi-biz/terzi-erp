import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  itemIdSchema,
  attributeSaveSchema,
  packUnitSaveSchema,
  applicationSaveSchema,
  deleteByIdSchema,
} from "@/lib/warehouse-import.schema";
import { loadCosts } from "@/lib/warehouse.schema";

/** Картка сімейства/варіанта складської позиції: характеристики, упаковки, застосування. */

export const getStockItemCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: item, error }, { data: attributes }, { data: packs }, { data: applications }, { data: balances }, costs] =
      await Promise.all([
        sb.from("stock_items")
          .select("id,name,sku,unit,category,module,catalog_item_id,min_qty,archived,family_key,variant_label,verification_status,origin_external_key,source_ref,created_at,updated_at")
          .eq("id", data.itemId).maybeSingle(),
        sb.from("stock_item_attributes").select("*").eq("item_id", data.itemId).order("attribute_key"),
        sb.from("stock_item_pack_units").select("*").eq("item_id", data.itemId).order("unit_label"),
        sb.from("stock_item_applications").select("*, catalog:catalog_item_id(id,name,unit)").eq("item_id", data.itemId).order("module"),
        sb.from("stock_balances").select("*, warehouse:warehouse_id(name)").eq("item_id", data.itemId),
        loadCosts(sb),
      ]);
    if (error || !item) throw new Error("Позицію не знайдено");
    const avg = costs.get(`item:${data.itemId}`);
    return {
      item,
      attributes: attributes ?? [],
      pack_units: packs ?? [],
      applications: applications ?? [],
      balances: balances ?? [],
      /** null = собівартість недоступна або невідома; це не нульова вартість. */
      avg_cost: avg ?? null,
      cost_available: avg != null,
    };
  });

export const saveStockItemAttribute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => attributeSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { itemId, ...rest } = data;
    const payload = {
      item_id: itemId,
      ...rest,
      numeric_value: rest.data_type === "number" ? rest.numeric_value : null,
      min_value: rest.data_type === "range" ? rest.min_value : null,
      max_value: rest.data_type === "range" ? rest.max_value : null,
      text_value: rest.data_type === "text" ? rest.text_value : null,
      verified_by: rest.verification_status === "verified" ? context.userId : null,
      verified_at: rest.verification_status === "verified" ? new Date().toISOString() : null,
    };
    const { data: out, error } = await context.supabase
      .from("stock_item_attributes").upsert(payload, { onConflict: "item_id,attribute_key" }).select().single();
    if (error) { console.error("saveStockItemAttribute", error); throw new Error("Не вдалося зберегти характеристику (потрібні права адміністратора або директора)"); }
    return out;
  });

export const deleteStockItemAttribute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteByIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stock_item_attributes").delete().eq("id", data.id);
    if (error) throw new Error("Не вдалося видалити характеристику");
    return { ok: true };
  });

export const saveStockItemPackUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => packUnitSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { itemId, id, ...rest } = data;
    const payload = {
      item_id: itemId,
      ...rest,
      verified_by: rest.verification_status === "verified" ? context.userId : null,
      verified_at: rest.verification_status === "verified" ? new Date().toISOString() : null,
    };
    const { data: out, error } = id
      ? await context.supabase.from("stock_item_pack_units").update(payload).eq("id", id).select().single()
      : await context.supabase.from("stock_item_pack_units").insert(payload).select().single();
    if (error) { console.error("saveStockItemPackUnit", error); throw new Error("Не вдалося зберегти упаковку (потрібні права адміністратора або директора)"); }
    return out;
  });

export const deleteStockItemPackUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteByIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stock_item_pack_units").delete().eq("id", data.id);
    if (error) throw new Error("Не вдалося видалити упаковку");
    return { ok: true };
  });

export const saveStockItemApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applicationSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { itemId, ...rest } = data;
    if (rest.catalog_item_id) {
      const { data: c } = await context.supabase.from("catalog_items").select("id").eq("id", rest.catalog_item_id).maybeSingle();
      if (!c) throw new Error("Вказана позиція каталогу не існує");
    }
    const { data: out, error } = await context.supabase
      .from("stock_item_applications")
      .upsert({ item_id: itemId, ...rest, created_by: context.userId }, { onConflict: "item_id,module" })
      .select().single();
    if (error) { console.error("saveStockItemApplication", error); throw new Error("Не вдалося зберегти застосування (потрібні права адміністратора або директора)"); }
    return out;
  });

export const deleteStockItemApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteByIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stock_item_applications").delete().eq("id", data.id);
    if (error) throw new Error("Не вдалося видалити застосування");
    return { ok: true };
  });
