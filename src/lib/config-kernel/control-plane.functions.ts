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
  .inputValidator((d) => z.object({ kind: z.enum(["module_overlay", "custom_field", "dictionary", "flag", "workflow"]) }).parse(d))
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
    await (await lifecycleFor(context.userId, data.scope)).discardDraft(data);
    return { ok: true };
  });

const ROW_COLS = "kind,key,scope_type,scope_id,status,payload,version";

/** Опубліковані визначення полів сутності, зведені по ключу за ланцюгом скоупів актора (без дублів). */
async function resolvedDefs(sb: any, entity: string, roleKey: string | null) {
  const { resolveAllByKey } = await import("./scoped");
  const { data } = await sb.from("config_entries").select(ROW_COLS)
    .eq("kind", "custom_field").eq("status", "published").like("key", `${entity}.%`);
  const m = resolveAllByKey("custom_field", data ?? [], { roleKey });
  return [...m.entries()].map(([key, r]) => ({ key, payload: r.value, version: r.version ?? 1 }));
}

/** Ролі для селектора скоупу (джерело — access_roles). */
export const listConfigScopeRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireConfigManager } = await import("./config.server");
    const { admin } = await import("@/lib/access.server");
    await requireConfigManager(context.userId);
    const { data } = await ((await admin()) as any).from("access_roles").select("key,name,is_active").order("sort_order");
    return ((data ?? []) as { key: string; name: string; is_active: boolean }[]).filter((r) => r.is_active).map((r) => ({ key: r.key, name: r.name }));
  });

/** Повна історія версій ключа у скоупі (для history/rollback). */
export const listConfigHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    kind: z.enum(["module_overlay", "custom_field", "dictionary", "workflow"]), key: z.string().min(1).max(128),
    scope: z.object({ type: z.enum(SCOPE_CHAIN), id: z.string().max(128) }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireConfigManager } = await import("./config.server");
    const { admin } = await import("@/lib/access.server");
    await requireConfigManager(context.userId);
    const db = (await admin()) as any;
    const { data: rows, error } = await db.from("config_entries")
      .select("id,version,status,change_note,created_at,created_by,published_at,published_by,based_on_version")
      .eq("kind", data.kind).eq("key", data.key).eq("scope_type", data.scope.type).eq("scope_id", data.scope.id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).flatMap((r: any) => [r.created_by, r.published_by]).filter(Boolean))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await db.from("profiles").select("user_id,display_name,email").in("user_id", ids);
      for (const p of profs ?? []) names[p.user_id] = p.display_name || p.email || p.user_id;
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id as string, version: r.version as number, status: r.status as string, note: (r.change_note ?? null) as string | null,
      createdAt: r.created_at as string, publishedAt: (r.published_at ?? null) as string | null,
      author: r.created_by ? (names[r.created_by] ?? null) : null, publisher: r.published_by ? (names[r.published_by] ?? null) : null,
      basedOn: (r.based_on_version ?? null) as number | null,
    }));
  });

/** Runtime: оверлеї модулів, резолвлені з роллю актора (company → role). */
export const getModuleOverlays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadActor } = await import("@/lib/access.server");
    const { resolveAllByKey } = await import("./scoped");
    const actor = await loadActor(context.userId);
    const { data } = await (context.supabase as any).from("config_entries").select(ROW_COLS)
      .eq("kind", "module_overlay").eq("status", "published");
    const out: Record<string, any> = {};
    for (const [k, r] of resolveAllByKey("module_overlay", data ?? [], { roleKey: actor.roleKey })) out[k] = r.value;
    return out;
  });

/** Runtime: визначення + значення кастомних полів запису (права — як на саму сутність). */
export const getCustomFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entity: ENTITY, entityId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { CUSTOM_FIELD_ENTITIES, customFieldSchema, computeFormulaValues } = await import("./custom-fields");
    const { dictionarySchema } = await import("./dictionaries");
    const actor = await requirePermission(context.userId, CUSTOM_FIELD_ENTITIES[data.entity].permissionModule, "view");
    let canEdit = true;
    try { await requirePermission(context.userId, CUSTOM_FIELD_ENTITIES[data.entity].permissionModule, "edit"); } catch { canEdit = false; }
    const sb = context.supabase as any;
    const defsRaw = await resolvedDefs(sb, data.entity, actor.roleKey ?? null);
    const fields = defsRaw
      .map((r) => ({ key: r.key.split(".")[1], version: r.version, def: customFieldSchema.safeParse(r.payload) }))
      .filter((f) => f.def.success)
      .map((f) => ({ key: f.key, version: f.version, def: (f.def as any).data }));
    const { data: vals } = await sb.from("custom_field_values")
      .select("field_key,value,updated_at").eq("entity_type", data.entity).eq("entity_id", data.entityId);
    const dictCodes = [...new Set(fields.map((f) => f.def.dictionary).filter(Boolean))] as string[];
    const dictionaries: Record<string, any> = {};
    if (dictCodes.length) {
      const { resolveAllByKey } = await import("./scoped");
      const { data: ds } = await sb.from("config_entries").select(ROW_COLS)
        .eq("kind", "dictionary").eq("status", "published").in("key", dictCodes);
      for (const [k, r] of resolveAllByKey("dictionary", ds ?? [], { roleKey: actor.roleKey ?? null })) {
        const p = dictionarySchema.safeParse(r.value); if (p.success) dictionaries[k] = p.data;
      }
    }
    const sorted = fields.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0));
    const values = Object.fromEntries((vals ?? []).map((v: any) => [v.field_key, v.value])) as Record<string, any>;
    // Формули обчислюються детерміновано на сервері з уже збережених числових полів.
    const computed = computeFormulaValues(sorted, values);
    let employees: { id: string; label: string }[] = [];
    if (sorted.some((f) => f.def.type === "employee")) {
      const { data: profs } = await sb.from("profiles").select("user_id,display_name,email").limit(500);
      employees = (profs ?? [])
        .map((p: any) => ({ id: String(p.user_id), label: String(p.display_name || p.email || p.user_id) }))
        .sort((a: any, b: any) => a.label.localeCompare(b.label, "uk"));
    }
    return { canEdit, fields: sorted, values, computed, dictionaries, employees };
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
    const defRow = (await resolvedDefs(db, data.entity, actor.roleKey ?? null)).find((d) => d.key === `${data.entity}.${data.field}`);
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
      value: r.value, definition_version: defRow!.version, updated_by: context.userId,
    }, { onConflict: "entity_type,entity_id,field_key" });
    if (error) throw new Error(error.message);
    await writeAudit(actor, {
      module: ent.permissionModule, action: "custom_field.set", entityType: data.entity, entityId: data.entityId,
      entityLabel: data.field, orderId: data.entity === "order" ? data.entityId : null,
      oldValue: prev?.value ?? null, newValue: r.value,
    });
    return { ok: true, value: r.value as any };
  });
