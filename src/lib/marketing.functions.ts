import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============ Довідники ============ */

export const listMarketingRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [channels, accounts, campaigns, creatives, landing, reasons, integrations] = await Promise.all([
      sb.from("marketing_channels").select("*").order("sort_order"),
      sb.from("marketing_accounts").select("*").order("name"),
      sb.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("marketing_creatives").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("landing_pages").select("*").order("name"),
      sb.from("marketing_lead_reasons").select("*").eq("is_active", true).order("sort_order"),
      sb.from("marketing_integrations").select("*").order("priority"),
    ]);
    return {
      channels: channels.data ?? [],
      accounts: accounts.data ?? [],
      campaigns: campaigns.data ?? [],
      creatives: creatives.data ?? [],
      landing: landing.data ?? [],
      reasons: reasons.data ?? [],
      integrations: integrations.data ?? [],
    };
  });

/* ============ Огляд / аналітика ============ */

export const getMarketingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const fromTs = `${data.from}T00:00:00.000Z`;
    const toTs = `${data.to}T23:59:59.999Z`;
    const spanDays = Math.max(1, Math.round((new Date(data.to).getTime() - new Date(data.from).getTime()) / 864e5) + 1);
    const prevTo = new Date(new Date(data.from).getTime() - 864e5);
    const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 864e5);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [metrics, prevMetrics, leads, prevLeads, measurements, estimates, orders, payments, expenses, budgets, alerts] = await Promise.all([
      sb.from("marketing_daily_metrics").select("*").gte("date", data.from).lte("date", data.to),
      sb.from("marketing_daily_metrics").select("spend, impressions, clicks").gte("date", iso(prevFrom)).lte("date", iso(prevTo)),
      sb.from("crm_leads").select("id, title, status, lead_quality, budget, area, created_at, marketing_channel_id, marketing_campaign_id, assigned_to, next_action_at")
        .gte("created_at", fromTs).lte("created_at", toTs).limit(2000),
      sb.from("crm_leads").select("id, lead_quality").gte("created_at", prevFrom.toISOString()).lte("created_at", prevTo.toISOString()).limit(2000),
      sb.from("order_measurements").select("id, status, measured_at, created_at").gte("created_at", fromTs).lte("created_at", toTs).limit(2000),
      sb.from("estimates").select("id, status, total_client, gross_profit, created_at").gte("created_at", fromTs).lte("created_at", toTs).limit(2000),
      sb.from("orders").select("id, commercial_status, created_at").gte("created_at", fromTs).lte("created_at", toTs).limit(2000),
      sb.from("payments").select("amount, direction, paid_at").gte("paid_at", data.from).lte("paid_at", data.to).limit(5000),
      sb.from("expenses").select("amount, spent_at").gte("spent_at", data.from).lte("spent_at", data.to).limit(5000),
      sb.from("marketing_budgets").select("*"),
      sb.from("marketing_alerts").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
    ]);

    const nm = (v: unknown) => Number(v ?? 0) || 0;
    const revenue = (payments.data ?? []).filter((p) => p.direction === "in").reduce((s, p) => s + nm(p.amount), 0);
    const costs = (expenses.data ?? []).reduce((s, e) => s + nm(e.amount), 0);

    return {
      period: { from: data.from, to: data.to, prevFrom: iso(prevFrom), prevTo: iso(prevTo) },
      metrics: metrics.data ?? [],
      prevMetrics: prevMetrics.data ?? [],
      leads: leads.data ?? [],
      prevLeadsQualified: (prevLeads.data ?? []).filter((l) => l.lead_quality === "цільовий").length,
      measurements: measurements.data ?? [],
      estimates: estimates.data ?? [],
      orders: orders.data ?? [],
      revenue,
      grossProfit: revenue - costs,
      budgets: budgets.data ?? [],
      alerts: alerts.data ?? [],
    };
  });

/* ============ Універсальний CRUD довідників маркетингу ============ */

const TABLES = ["marketing_channels", "marketing_accounts", "marketing_campaigns", "marketing_creatives", "marketing_ad_groups", "marketing_ads", "marketing_budgets", "landing_pages", "marketing_lead_reasons", "marketing_daily_metrics"] as const;

export const saveMarketingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    table: z.enum(TABLES),
    id: z.string().uuid().optional().nullable(),
    valuesJson: z.string().min(2).max(200_000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const values = JSON.parse(data.valuesJson) as Record<string, unknown>;
    delete values.id;
    const q = context.supabase.from(data.table);
    const { data: out, error } = data.id
      ? await q.update(values as never).eq("id", data.id).select().single()
      : await q.insert(values as never).select().single();
    if (error) { console.error("saveMarketingRow", data.table, error); throw new Error("Не вдалося зберегти запис"); }
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: data.id ? "update" : "create",
      entity_type: data.table, entity_id: (out as { id?: string } | null)?.id ?? null,
      entity_label: String((values as { name?: string }).name ?? ""),
      new_value: values as never, actor_id: context.userId, is_critical: false,
    });
    return out;
  });

export const deleteMarketingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ table: z.enum(TABLES), id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from(data.table).delete().eq("id", data.id);
    if (error) { console.error("deleteMarketingRow", error); throw new Error("Не вдалося видалити запис"); }
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: "delete", entity_type: data.table, entity_id: data.id,
      actor_id: context.userId, is_critical: true,
    });
    return { ok: true };
  });

/* ============ Атрибуція лідів ============ */

export const listAttributedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_leads")
      .select("id, title, status, lead_quality, disqualify_reason_id, source, campaign, utm, budget, area, district, created_at, marketing_channel_id, marketing_campaign_id, marketing_creative_id, landing_page_id, first_touch_at, last_touch_at, client_id, order_id")
      .order("created_at", { ascending: false }).limit(500);
    if (error) { console.error("listAttributedLeads", error); throw new Error("Не вдалося завантажити ліди"); }
    return data ?? [];
  });

export const getLeadTouchpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows } = await context.supabase
      .from("marketing_touchpoints").select("*").eq("crm_lead_id", data.leadId).order("occurred_at");
    return rows ?? [];
  });

export const updateLeadMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    leadId: z.string().uuid(),
    lead_quality: z.string().max(60).nullable().optional(),
    disqualify_reason_id: z.string().uuid().nullable().optional(),
    marketing_channel_id: z.string().uuid().nullable().optional(),
    marketing_campaign_id: z.string().uuid().nullable().optional(),
    marketing_creative_id: z.string().uuid().nullable().optional(),
    landing_page_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { leadId, ...patch } = data;
    const { data: out, error } = await context.supabase.from("crm_leads").update(patch).eq("id", leadId).select().single();
    if (error) { console.error("updateLeadMarketing", error); throw new Error("Не вдалося оновити лід"); }
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: "lead_qualify", entity_type: "crm_leads", entity_id: leadId,
      new_value: patch as never, actor_id: context.userId, is_critical: false,
    });
    return out;
  });

/** Реєструє точку дотику і синхронізує first/last touch у ліда. */
export const addTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    crm_lead_id: z.string().uuid(),
    touchpoint_type: z.string().max(50).default("visit"),
    channel_id: z.string().uuid().nullable().optional(),
    campaign_id: z.string().uuid().nullable().optional(),
    creative_id: z.string().uuid().nullable().optional(),
    landing_page_id: z.string().uuid().nullable().optional(),
    source: z.string().max(120).nullable().optional(),
    medium: z.string().max(120).nullable().optional(),
    campaign: z.string().max(200).nullable().optional(),
    occurred_at: z.string().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const occurred = data.occurred_at ?? new Date().toISOString();
    const { data: existing } = await sb.from("marketing_touchpoints").select("id").eq("crm_lead_id", data.crm_lead_id).limit(1);
    const isFirst = !(existing ?? []).length;
    await sb.from("marketing_touchpoints").update({ is_last_touch: false }).eq("crm_lead_id", data.crm_lead_id);
    const { data: out, error } = await sb.from("marketing_touchpoints")
      .insert({ ...data, occurred_at: occurred, is_first_touch: isFirst, is_last_touch: true }).select().single();
    if (error) { console.error("addTouchpoint", error); throw new Error("Не вдалося зберегти торкання"); }
    await sb.from("crm_leads").update({
      last_touch_at: occurred,
      ...(isFirst ? { first_touch_at: occurred, marketing_channel_id: data.channel_id ?? null } : {}),
    }).eq("id", data.crm_lead_id);
    return out;
  });

/* ============ Попередження та рекомендації ============ */

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("marketing_alerts").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const runAlertRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { evaluateMarketingRules } = await import("./marketing/rules.server");
    return evaluateMarketingRules(context.supabase, context.userId);
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["open", "resolved", "ignored"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("marketing_alerts")
      .update({ status: data.status, resolved_at: data.status === "open" ? null : new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error("Не вдалося оновити попередження");
    return { ok: true };
  });

/** Створює задачу в існуючій системі задач ERP із попередження або рекомендації. */
export const createTaskFromMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(["alert", "recommendation"]),
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    due_at: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: task, error } = await sb.from("crm_tasks").insert({
      title: data.title, description: data.description ?? null, kind: "marketing",
      due_at: data.due_at ?? null, priority: "high", status: "open",
      owner_id: context.userId, assigned_to: context.userId,
    }).select().single();
    if (error) { console.error("createTaskFromMarketing", error); throw new Error("Не вдалося створити задачу"); }
    const table = data.kind === "alert" ? "marketing_alerts" : "marketing_recommendations";
    await sb.from(table).update({ linked_task_id: task.id, assigned_user_id: context.userId }).eq("id", data.id);
    await sb.from("audit_logs").insert({
      module: "marketing", action: "task_created", entity_type: table, entity_id: data.id,
      entity_label: data.title, actor_id: context.userId, is_critical: false,
    });
    return task;
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("marketing_recommendations").select("*").order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const setRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["new", "approved", "rejected", "postponed", "done"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const patch = data.status === "approved"
      ? { status: data.status, approved_by: context.userId, approved_at: new Date().toISOString() }
      : { status: data.status };
    const { error } = await context.supabase.from("marketing_recommendations").update(patch).eq("id", data.id);
    if (error) throw new Error("Не вдалося оновити рекомендацію");
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: `recommendation_${data.status}`, entity_type: "marketing_recommendations",
      entity_id: data.id, actor_id: context.userId, is_critical: false,
    });
    return { ok: true };
  });

/** Генерує rule-based рекомендації (без AI) на основі агрегованих даних. */
export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildRecommendations } = await import("./marketing/rules.server");
    return buildRecommendations(context.supabase, context.userId);
  });

/* ============ Інтеграції ============ */

export const updateMarketingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: z.string().min(1).max(60),
    account_name: z.string().max(200).nullable().optional(),
    external_account_id: z.string().max(200).nullable().optional(),
    configurationJson: z.string().max(20000).optional(),
    connection_status: z.enum(["not_connected", "connecting", "connected", "error", "disabled"]).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    if (data.account_name !== undefined) patch.account_name = data.account_name;
    if (data.external_account_id !== undefined) patch.external_account_id = data.external_account_id;
    if (data.connection_status) patch.connection_status = data.connection_status;
    if (data.configurationJson) patch.configuration_json = JSON.parse(data.configurationJson);
    const { error } = await context.supabase.from("marketing_integrations").update(patch as never).eq("provider", data.provider);
    if (error) { console.error("updateMarketingIntegration", error); throw new Error("Не вдалося оновити інтеграцію"); }
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: "integration_update", entity_type: "marketing_integrations",
      entity_label: data.provider, actor_id: context.userId, is_critical: true,
    });
    return { ok: true };
  });

/** Перевірка підключення: секрети живуть на сервері, у відповідь іде лише статус. */
export const testMarketingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ context, data }) => {
    const { testProvider } = await import("./marketing/adapters.server");
    const res = await testProvider(data.provider);
    await context.supabase.from("marketing_integrations").update({
      last_attempt_at: new Date().toISOString(),
      ...(res.ok ? { last_success_at: new Date().toISOString(), last_error: null, connection_status: "connected" } : { last_error: res.message, connection_status: res.configured ? "error" : "not_connected" }),
    }).eq("provider", data.provider);
    return res;
  });

/* ============ Журнал змін ============ */

export const listMarketingAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("audit_logs").select("*")
      .eq("module", "marketing").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

/* ============ Звʼязка CRM → маркетинг ============ */

/** Проставляє лідам канал і кампанію за джерелом/UTM, створює відсутні кампанії. */
export const syncMarketingFromCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncLeadAttribution } = await import("./marketing/attribution.server");
    const res = await syncLeadAttribution(context.supabase as never);
    await context.supabase.from("audit_logs").insert({
      module: "marketing", action: "attribution_sync", entity_type: "crm_leads",
      new_value: res as never, actor_id: context.userId, is_critical: false,
    });
    return res;
  });

/** Щоденні показники реклами за період (для таблиці «Кампанії»). */
export const listDailyMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("marketing_daily_metrics").select("*")
      .order("date", { ascending: false }).limit(500);
    return data ?? [];
  });

