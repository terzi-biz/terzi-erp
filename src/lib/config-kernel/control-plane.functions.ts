/** Control Plane Wave 2 — серверні функції для адмінки та runtime кастомних полів. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SCOPE_CHAIN } from "./scope";

const ENTITY = z.enum(["order", "lead"]);

export interface AdminConfigRow {
  id: string; kind: string; key: string; scope_type: string; scope_id: string;
  version: number; status: string; payload: any; change_note: string | null;
  created_at: string; published_at: string | null;
}

/** Адмін-список: поточні draft/published записи вказаного kind. */
export const listConfigAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["module_overlay", "custom_field", "dictionary", "flag"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireConfigManager } = await import("./config.server");
    const { admin } = await import("@/lib/access.server");
    await requireConfigManager(context.userId);
    const db = (await admin()) as any;
    const { data: rows, error } = await db
      .from("config_entries")
      .select("id,kind,key,scope_type,scope_id,version,status,payload,change_note,created_at,published_at")
      .eq("kind", data.kind).in("status", ["draft", "published"])
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdminConfigRow[];
  });

export const discardConfigDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    kind: z.string().min(1).max(64), key: z.string().min(1).max(128),
    scope: z.object({ type: z.enum(SCOPE_CHAIN), id: z.string().max(128) }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    await (await lifecycleFor(context.userId)).discardDraft(data);
    return { ok: true };
  });

async function publishedDefs(sb: any, entity: string) {
  const { data } = await sb.from("config_entries")
    .select("key,payload,version,scope_type")
    .eq("kind", "custom_field").eq("status", "published").like("key", `${entity}.%`);
  return (data ?? []) as { key: string; payload: any; version: number; scope_type: string }[];
}

/** Runtime: визначення + значення кастомних полів запису (права — як на саму сутність). */
export const getCustomFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entity: ENTITY, entityId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { CUSTOM_FIELD_ENTITIES, customFieldSchema } = await import("./custom-fields");
    const { dictionarySchema } = await import("./dictionaries");
    const actor = await requirePermission(context.userId, CUSTOM_FIELD_ENTITIES[data.entity].permissionModule, "view");
    let canEdit = true;
    try { await requirePermission(context.userId, CUSTOM_FIELD_ENTITIES[data.entity].permissionModule, "edit"); } catch { canEdit = false; }
    const sb = context.supabase as any;
    const defsRaw = await publishedDefs(sb, data.entity);
    const fields = defsRaw
      .map((r) => ({ key: r.key.split(".")[1], version: r.version, def: customFieldSchema.safeParse(r.payload) }))
      .filter((f) => f.def.success)
      .map((f) => ({ key: f.key, version: f.version, def: (f.def as any).data }));
    const { data: vals } = await sb.from("custom_field_values")
      .select("field_key,value,updated_at").eq("entity_type", data.entity).eq("entity_id", data.entityId);
    const dictCodes = [...new Set(fields.map((f) => f.def.dictionary).filter(Boolean))] as string[];
    const dictionaries: Record<string, any> = {};
    if (dictCodes.length) {
      const { data: ds } = await sb.from("config_entries").select("key,payload")
        .eq("kind", "dictionary").eq("status", "published").in("key", dictCodes);
      for (const d of ds ?? []) { const p = dictionarySchema.safeParse(d.payload); if (p.success) dictionaries[d.key] = p.data; }
    }
    void actor;
    return {
      canEdit,
      fields: fields.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0)),
      values: Object.fromEntries((vals ?? []).map((v: any) => [v.field_key, v.value])) as Record<string, unknown>,
      dictionaries,
    };
  });

export const setCustomFieldValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    entity: ENTITY, entityId: z.string().uuid(),
    field: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/), value: z.unknown(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("@/lib/access.server");
    const { CUSTOM_FIELD_ENTITIES, customFieldSchema, validateFieldValue } = await import("./custom-fields");
    const { findSecretLike } = await import("./kinds");
    const ent = CUSTOM_FIELD_ENTITIES[data.entity];
    const actor = await requirePermission(context.userId, ent.permissionModule, "edit");
    const db = (await admin()) as any;
    const { data: defRow } = await db.from("config_entries").select("payload,version")
      .eq("kind", "custom_field").eq("status", "published").eq("key", `${data.entity}.${data.field}`)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const def = customFieldSchema.safeParse(defRow?.payload);
    if (!def.success) throw new Error("Поле не опубліковане або невалідне");
    if (def.data.archived) throw new Error("Поле архівоване — редагування недоступне");
    const { data: exists } = await db.from(ent.table).select("id").eq("id", data.entityId).maybeSingle();
    if (!exists) throw new Error("Запис не знайдено");
    const { data: prev } = await db.from("custom_field_values").select("value")
      .eq("entity_type", data.entity).eq("entity_id", data.entityId).eq("field_key", data.field).maybeSingle();
    const r = validateFieldValue(def.data, data.value, prev?.value);
    if (!r.ok) throw new Error(r.error);
    if (findSecretLike(r.value).length) throw new Error("Значення схоже на секрет — збереження заборонено");
    const { error } = await db.from("custom_field_values").upsert({
      entity_type: data.entity, entity_id: data.entityId, field_key: data.field,
      value: r.value, definition_version: defRow.version, updated_by: context.userId,
    }, { onConflict: "entity_type,entity_id,field_key" });
    if (error) throw new Error(error.message);
    await writeAudit(actor, {
      module: ent.permissionModule, action: "custom_field.set", entityType: data.entity, entityId: data.entityId,
      entityLabel: data.field, orderId: data.entity === "order" ? data.entityId : null,
      oldValue: prev?.value ?? null, newValue: r.value,
    });
    return { ok: true, value: r.value };
  });
