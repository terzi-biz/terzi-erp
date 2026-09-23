/**
 * Finance Core v3 — серверні функції довідників: версіоновані правила,
 * реєстр активів, резерви, причини. Правка правила створює НОВУ версію
 * (попередня закривається `effective_to`), історія не перезаписується.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RULE_SCOPES } from "./rules";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Очікується дата YYYY-MM-DD");

export const financeRuleInput = z.object({
  scope: z.enum(RULE_SCOPES),
  code: z.string().min(2).max(64),
  label: z.string().max(160).optional().nullable(),
  value_num: z.number().finite().optional().nullable(),
  value_text: z.string().max(500).optional().nullable(),
  unit: z.enum(["uah", "percent", "months", "ratio", "units"]).optional().nullable(),
  effective_from: day,
  notes: z.string().max(1000).optional().nullable(),
});

export const assetInput = z.object({
  id: uuid.optional(),
  name: z.string().min(2).max(200),
  asset_type: z.enum(["equipment", "vehicle", "tool", "other"]).default("equipment"),
  inventory_no: z.string().max(64).optional().nullable(),
  purchase_cost: z.number().min(0),
  salvage_value: z.number().min(0).default(0),
  commissioned_at: day.optional().nullable(),
  method: z.enum(["months", "hours", "shifts", "m2", "orders", "fixed", "manual"]).default("months"),
  life_units: z.number().positive().optional().nullable(),
  direction_key: z.string().max(64).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

/** Усі правила з історією версій. */
export const listFinanceRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("finance_rules")
      .select("*")
      .order("scope", { ascending: true })
      .order("code", { ascending: true })
      .order("effective_from", { ascending: false });
    if (error) { console.error("listFinanceRules", error); throw new Error("Не вдалося завантажити правила"); }
    return data ?? [];
  });

/** Нова версія правила. Попередня закривається днем раніше, не видаляється. */
export const saveFinanceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => financeRuleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin } = await import("@/lib/access.server");
    await requirePermission(context.userId, "finance", "manage_settings");
    const db = (await admin()) as any; // права перевірено канонічно вище
    const prevEnd = new Date(`${data.effective_from}T00:00:00Z`);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const closeOn = prevEnd.toISOString().slice(0, 10);

    const { error: eClose } = await db
      .from("finance_rules")
      .update({ effective_to: closeOn })
      .eq("scope", data.scope)
      .eq("code", data.code)
      .is("effective_to", null)
      .lt("effective_from", data.effective_from);
    if (eClose) { console.error("saveFinanceRule.close", eClose); throw new Error("Не вдалося закрити попередню версію"); }

    const { data: row, error } = await db
      .from("finance_rules")
      .insert({
        scope: data.scope,
        code: data.code,
        label: data.label ?? null,
        value_num: data.value_num ?? null,
        value_text: data.value_text ?? null,
        unit: data.unit ?? null,
        effective_from: data.effective_from,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) { console.error("saveFinanceRule", error); throw new Error("Не вдалося зберегти правило"); }

    await db.from("audit_logs").insert({
      action: "finance_rule_saved",
      entity_type: "finance_rules",
      entity_id: row.id,
      user_id: context.userId,
      metadata: { scope: data.scope, code: data.code, value: data.value_num, from: data.effective_from },
    } as never);
    return row;
  });

/** Довідник причин (reason codes). */
export const listReasonCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("finance_reason_codes")
      .select("*")
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) { console.error("listReasonCodes", error); throw new Error("Не вдалося завантажити причини"); }
    return data ?? [];
  });

/** Реєстр активів. */
export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assets")
      .select("*")
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) { console.error("listAssets", error); throw new Error("Не вдалося завантажити активи"); }
    return data ?? [];
  });

export const saveAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assetInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { data: row, error } = await context.supabase
      .from("assets")
      .upsert(payload as never, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { console.error("saveAsset", error); throw new Error("Не вдалося зберегти актив"); }
    return row;
  });

/** Стан резервів (ФНЗ / гарантія / CAPEX) за періодами. */
export const listReserves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("finance_reserves")
      .select("*")
      .order("period", { ascending: false });
    if (error) { console.error("listReserves", error); throw new Error("Не вдалося завантажити резерви"); }
    return data ?? [];
  });
