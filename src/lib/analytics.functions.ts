import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rangeSchema, drilldownSchema, manualSpendSchema, sourceMapSchema, idSchema, previousRange } from "./analytics.schema";
import { drilldown } from "./analytics.server";

/** Зведення за період + попередній період тієї ж довжини. */
export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const prev = previousRange(data.from, data.to);
    const [cur, before] = await Promise.all([
      sb.rpc("analytics_overview", { p_from: data.from, p_to: data.to }),
      sb.rpc("analytics_overview", { p_from: prev.from, p_to: prev.to }),
    ]);
    if (cur.error) throw new Error(cur.error.message);
    return { current: cur.data, previous: before.data ?? null, prevPeriod: prev };
  });

/** Список реальних записів за метрикою. */
export const getAnalyticsDrilldown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => drilldownSchema.parse(d))
  .handler(async ({ context, data }) => drilldown(context.supabase, data));

/** Довідники аналітики: мапа джерел, офлайн-витрати, цілі. */
export const listAnalyticsRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const [map, spend, targets] = await Promise.all([
      sb.from("marketing_source_map").select("*").order("raw_source"),
      sb.from("marketing_manual_spend").select("*").gte("spend_date", data.from).lte("spend_date", data.to).order("spend_date", { ascending: false }),
      sb.from("analytics_targets").select("*").order("month", { ascending: false }).limit(200),
    ]);
    return { map: map.data ?? [], spend: spend.data ?? [], targets: targets.data ?? [] };
  });

/** Ручні (офлайн) витрати на маркетинг. */
export const saveManualSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => manualSpendSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = data.id
      ? await context.supabase.from("marketing_manual_spend").update(data).eq("id", data.id)
      : await context.supabase.from("marketing_manual_spend").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteManualSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))

  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("marketing_manual_spend").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Нормалізація джерела: сире значення → канонічна назва. */
export const saveSourceMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sourceMapSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("marketing_source_map")
      .upsert(data, { onConflict: "raw_source" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
