/** Control Plane — серверна реалізація репозиторію і аудиту (service role, після перевірки прав). */
import { admin, requirePermission, writeAudit, type Actor } from "@/lib/access.server";
import type { AuditSink, ConfigEntry, ConfigRepo, ConfigTarget } from "./lifecycle";
import { createLifecycle } from "./lifecycle";

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

export async function lifecycleFor(userId: string) {
  const actor = await requireConfigManager(userId);
  return createLifecycle(await supabaseConfigRepo(), auditSink(actor), actor.userId);
}
