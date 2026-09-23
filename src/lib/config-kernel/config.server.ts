/** Control Plane — серверна реалізація репозиторію і аудиту (service role, після перевірки прав). */
import { admin, requirePermission, writeAudit, type Actor } from "@/lib/access.server";
import type { AuditSink, ConfigEntry, ConfigRepo, ConfigTarget } from "./lifecycle";
import { createLifecycle, ConfigValidationError } from "./lifecycle";
import { COMPANY_ID } from "./scope";
import { WRITABLE_SCOPE_TYPES, dictionaryRefError, roleTypeConflict, type PublishedRow } from "./scoped";

export const CONFIG_PERMISSION = { module: "settings", action: "manage_settings" } as const;

export async function requireConfigManager(userId: string): Promise<Actor> {
  return requirePermission(userId, CONFIG_PERMISSION.module, CONFIG_PERMISSION.action);
}

export async function supabaseConfigRepo(): Promise<ConfigRepo> {
  const db = (await admin()) as any;
  return {
    async listVersions(t: ConfigTarget) {
      const { data, error } = await db
        .from("config_entries").select("*")
        .eq("kind", t.kind).eq("key", t.key).eq("scope_type", t.scope.type).eq("scope_id", t.scope.id)
        .order("version", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConfigEntry[];
    },
    async insert(e) {
      const { data, error } = await db.from("config_entries").insert(e).select("*").single();
      if (error) throw new Error(error.message);
      return data as ConfigEntry;
    },
    async update(id, patch) {
      const { data, error } = await db.from("config_entries").update(patch).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return data as ConfigEntry;
    },
  };
}

export function auditSink(actor: Actor): AuditSink {
  return async (action, t, oldValue, newValue, note) =>
    writeAudit(actor, {
      module: "settings",
      action,
      entityType: `config:${t.kind}`,
      entityId: `${t.key}@${t.scope.type}:${t.scope.id}`,
      entityLabel: t.key,
      oldValue,
      newValue,
      reason: note ?? null,
      isCritical: action === "config.publish" || action === "config.rollback",
    });
}

/** Запис дозволено лише в company (terzi) або в існуючу активну роль з access_roles. */
export async function assertWritableScope(scope: { type: string; id: string }) {
  if (!(WRITABLE_SCOPE_TYPES as readonly string[]).includes(scope.type)) throw new Error("Цей скоуп не редагується з Налаштувань");
  if (scope.type === "company" && scope.id !== COMPANY_ID) throw new Error("Невідома компанія");
  if (scope.type === "role") {
    const db = (await admin()) as any;
    const { data } = await db.from("access_roles").select("key").eq("key", scope.id).maybeSingle();
    if (!data) throw new Error(`Роль «${scope.id}» не знайдена в довіднику ролей`);
  }
}

/** Перевірки посилань перед публікацією/rollback. */
export async function beforePublishChecks(t: ConfigTarget, payload: unknown) {
  if (t.kind !== "custom_field") return;
  const p = payload as any;
  const db = (await admin()) as any;
  const errors: string[] = [];
  if (p?.dictionary) {
    const { data } = await db.from("config_entries").select("kind,key,scope_type,scope_id,status,payload,version")
      .eq("kind", "dictionary").eq("status", "published").eq("key", p.dictionary);
    const e = dictionaryRefError(p.dictionary, (data ?? []) as PublishedRow[], t.scope);
    if (e) errors.push(e);
  }
  if (t.scope.type === "role") {
    const { data } = await db.from("config_entries").select("payload")
      .eq("kind", "custom_field").eq("status", "published").eq("key", t.key)
      .eq("scope_type", "company").eq("scope_id", COMPANY_ID).maybeSingle();
    const e = roleTypeConflict(t.scope, p, data?.payload);
    if (e) errors.push(e);
  }
  if (errors.length) throw new ConfigValidationError(errors);
}

export async function lifecycleFor(userId: string, scope?: { type: string; id: string }) {
  const actor = await requireConfigManager(userId);
  if (scope) await assertWritableScope(scope);
  return createLifecycle(await supabaseConfigRepo(), auditSink(actor), actor.userId, beforePublishChecks);
}
