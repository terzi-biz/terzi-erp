/** Server functions for Control Center rules + journal. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { automationActionSchema, automationRuleSchema } from "./schema";

async function userRoles(sb: { from: (t: string) => any }, userId: string): Promise<string[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

function canWriteRules(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("director");
}

export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("automation_rules")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("listRules", error);
      throw new Error("Не вдалося завантажити правила");
    }
    return { rules: data ?? [] };
  });

export const saveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => automationRuleSchema.parse(d))
  .handler(async ({ context, data }) => {
    const roles = await userRoles(context.supabase, context.userId);
    if (!canWriteRules(roles)) throw new Error("Лише admin/director можуть змінювати правила");

    const { id, ...rest } = data;
    const row = {
      name: rest.name,
      enabled: rest.enabled ?? true,
      trigger_entity: rest.trigger_entity,
      trigger_field: rest.trigger_field,
      trigger_from: rest.trigger_from ?? null,
      trigger_to: rest.trigger_to,
      condition: (rest.condition ?? {}) as Json,
      actions: rest.actions as Json,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { data: out, error } = await context.supabase
        .from("automation_rules")
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        console.error("saveRule update", error);
        throw new Error("Не вдалося оновити правило");
      }
      return { rule: out };
    }

    const { data: out, error } = await context.supabase
      .from("automation_rules")
      .insert({ ...row, created_by: context.userId })
      .select("*")
      .single();
    if (error) {
      console.error("saveRule insert", error);
      throw new Error("Не вдалося створити правило");
    }
    return { rule: out };
  });

export const setRuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const roles = await userRoles(context.supabase, context.userId);
    if (!canWriteRules(roles)) throw new Error("Лише admin/director можуть змінювати правила");

    const { error } = await context.supabase
      .from("automation_rules")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) {
      console.error("setRuleEnabled", error);
      throw new Error("Не вдалося змінити статус правила");
    }
    return { ok: true };
  });

export const listJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        status: z.enum(["pending", "done", "failed", "cancelled"]).optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const limit = data?.limit ?? 50;
    let q = context.supabase
      .from("automation_journal")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      console.error("listJournal", error);
      throw new Error("Не вдалося завантажити журнал");
    }
    return { journal: rows ?? [] };
  });

export const controlCenterKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const todayStart = new Date();
    // Europe/Kyiv day boundary approximation via local box timezone (already Kyiv)
    todayStart.setHours(0, 0, 0, 0);
    const iso = todayStart.toISOString();

    const [{ count: enabledCount }, { count: journalToday }, { count: failedCount }] =
      await Promise.all([
        context.supabase
          .from("automation_rules")
          .select("id", { count: "exact", head: true })
          .eq("enabled", true),
        context.supabase
          .from("automation_journal")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso),
        context.supabase
          .from("automation_journal")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
      ]);

    return {
      rules_enabled: enabledCount ?? 0,
      journal_today: journalToday ?? 0,
      failed: failedCount ?? 0,
    };
  });

// Re-export action schema for UI forms (tree-shake safe on server fns file).
export { automationActionSchema };
