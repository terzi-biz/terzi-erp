/** Settings Control Center — серверні функції (канонічні права settings:manage_settings). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CALC_SETTINGS_KEYS, diffFromDefaults, type CalcSettingsKey } from "./calc-settings";
import { COMPANY_ID } from "./scope";

/** Що може поточний користувач у Налаштуваннях (сервер — джерело істини). */
export const getSettingsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission, loadActor } = await import("@/lib/access.server");
    const actor = await loadActor(context.userId);
    let canManageSettings = false;
    try { await requirePermission(context.userId, "settings", "manage_settings"); canManageSettings = true; } catch { /* немає права */ }
    let canManageFinanceRules = false;
    try { await requirePermission(context.userId, "finance", "manage_settings"); canManageFinanceRules = true; } catch { /* немає права */ }
    return { canManageSettings, canManageFinanceRules, canManageAccess: !!actor.canManage };
  });

/** Опубліковані company-wide перевизначення калькуляторів (порожньо = дефолти рушія). */
export const getCalcSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveConfig } = await import("./lifecycle");
    const { data: rows, error } = await (context.supabase as any)
      .from("config_entries")
      .select("kind,key,scope_type,scope_id,status,payload")
      .eq("kind", "calc_settings").eq("status", "published")
      .in("scope_type", ["system", "company"]);
    if (error) throw new Error("Не вдалося завантажити налаштування калькуляторів");
    const out = {} as Record<CalcSettingsKey, Record<string, number>>;
    for (const k of CALC_SETTINGS_KEYS) {
      out[k] = (resolveConfig("calc_settings", k, rows ?? [], { companyId: COMPANY_ID }).value ?? {}) as Record<string, number>;
    }
    return out;
  });

/** Зберігає і публікує company-wide значення (версія + аудит через kernel). */
export const saveCalcSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      key: z.enum(CALC_SETTINGS_KEYS as [CalcSettingsKey, ...CalcSettingsKey[]]),
      values: z.record(z.string().max(64), z.number().finite()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { lifecycleFor } = await import("./config.server");
    const lc = await lifecycleFor(context.userId);
    const target = { kind: "calc_settings", key: data.key, scope: { type: "company" as const, id: COMPANY_ID } };
    await lc.saveDraft(target, diffFromDefaults(data.key, data.values), "Налаштування калькулятора");
    const res = await lc.publish(target);
    return { ok: true as const, version: res.version as number };
  });
