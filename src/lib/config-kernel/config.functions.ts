/** Control Plane — серверні функції. Запис лише через backend із перевіркою settings:manage_settings. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SCOPE_CHAIN } from "./scope";

const target = z.object({
  kind: z.string().min(1).max(64),
  key: z.string().min(1).max(128),
  scope: z.object({ type: z.enum(SCOPE_CHAIN), id: z.string().max(128) }),
});

export const saveConfigDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => target.extend({ payload: z.unknown(), note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    const lc = await lifecycleFor(context.userId);
    return lc.saveDraft(data, data.payload, data.note);
  });

export const previewConfigDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => target.parse(d))
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    const r = await (await lifecycleFor(context.userId)).preview(data);
    return r ? (JSON.parse(JSON.stringify(r)) as { draftVersion: number; publishedVersion: number | null; changes: { path: string; before: any; after: any }[]; validation: { ok: boolean; errors?: string[] } }) : null;
  });

export const publishConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => target.extend({ note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    return (await lifecycleFor(context.userId)).publish(data, data.note);
  });

export const rollbackConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => target.extend({ toVersion: z.number().int().positive(), note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    return (await lifecycleFor(context.userId)).rollback(data, data.toVersion, data.note);
  });

export const listConfigVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => target.parse(d))
  .handler(async ({ data, context }) => {
    const { requireConfigManager, supabaseConfigRepo } = await import("./config.server");
    await requireConfigManager(context.userId);
    return (await supabaseConfigRepo()).listVersions(data);
  });

/** Runtime-читання: RLS віддає лише опубліковані (і не-чутливі для не-фінансових ролей). */
export const getResolvedConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.string().min(1).max(64), key: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const { isConfigKind } = await import("./kinds");
    const { resolveConfig } = await import("./lifecycle");
    const { loadActor } = await import("@/lib/access.server");
    if (!isConfigKind(data.kind)) throw new Error("Невідомий тип конфігурації");
    const actor = await loadActor(context.userId);
    const { data: rows } = await (context.supabase as any)
      .from("config_entries")
      .select("kind,key,scope_type,scope_id,status,payload")
      .eq("kind", data.kind).eq("key", data.key).eq("status", "published");
    return resolveConfig(data.kind, data.key, rows ?? [], { roleKey: actor.roleKey, userId: context.userId });
  });
