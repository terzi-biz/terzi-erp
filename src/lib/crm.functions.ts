import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------- Pipelines & stages ---------------- */

export const listPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: pipelines, error: pe }, { data: stages, error: se }] = await Promise.all([
      context.supabase.from("crm_pipelines").select("*").eq("is_active", true).order("sort_order"),
      context.supabase.from("crm_stages").select("*").order("sort_order"),
    ]);
    if (pe || se) { console.error("listPipelines", pe || se); throw new Error("Не вдалося завантажити воронки"); }
    return { pipelines: pipelines ?? [], stages: stages ?? [] };
  });

/* ---------------- Contacts ---------------- */

const contactInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  position: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_contacts").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { console.error("listContacts", error); throw new Error("Не вдалося завантажити контакти"); }
    return data ?? [];
  });

export const findContactDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const norm = data.phone.replace(/\D/g, "");
    if (norm.length < 6) return [];
    const { data: rows, error } = await context.supabase
      .from("crm_contacts").select("id, full_name, phone, company").eq("phone_norm", norm).limit(10);
    if (error) { console.error("findContactDuplicates", error); return []; }
    return rows ?? [];
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("crm_contacts").update(rest).eq("id", id).select().single()
      : await context.supabase.from("crm_contacts").insert({ ...rest, owner_id: context.userId }).select().single();
    if (error) { console.error("upsertContact", error); throw new Error("Не вдалося зберегти контакт"); }
    return out;
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_contacts").delete().eq("id", data.id);
    if (error) { console.error("deleteContact", error); throw new Error("Не вдалося видалити контакт"); }
    return { ok: true };
  });

/* ---------------- Leads ---------------- */

const leadInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  object_id: z.string().uuid().optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  direction: z.string().max(100).optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  area: z.number().nonnegative().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  status: z.enum(["open", "won", "lost", "postponed"]).optional(),
  lost_reason: z.string().max(500).optional().nullable(),
  next_action_at: z.string().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_leads").select("*").order("updated_at", { ascending: false }).limit(500);
    if (error) { console.error("listLeads", error); throw new Error("Не вдалося завантажити ліди"); }
    return data ?? [];
  });

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("crm_leads").update(rest).eq("id", id).select().single()
      : await context.supabase.from("crm_leads").insert({ ...rest, owner_id: context.userId, assigned_to: context.userId }).select().single();
    if (error) { console.error("upsertLead", error); throw new Error("Не вдалося зберегти лід"); }
    if (out) {
      await context.supabase.from("crm_lead_activities").insert({
        lead_id: out.id, actor_id: context.userId, kind: id ? "update" : "created",
        body: id ? "Лід оновлено" : "Лід створено",
      });
    }
    return out;
  });

export const moveLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), stage_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("crm_leads").select("stage_id").eq("id", data.id).maybeSingle();
    const { data: stage } = await context.supabase
      .from("crm_stages").select("id, name, is_won, is_lost, probability").eq("id", data.stage_id).maybeSingle();
    const patch: Record<string, unknown> = { stage_id: data.stage_id, probability: stage?.probability ?? null };
    if (stage?.is_won) { patch.status = "won"; patch.closed_at = new Date().toISOString(); }
    else if (stage?.is_lost) { patch.status = "lost"; patch.closed_at = new Date().toISOString(); }
    else { patch.status = "open"; patch.closed_at = null; }
    const { data: out, error } = await context.supabase.from("crm_leads").update(patch).eq("id", data.id).select().single();
    if (error) { console.error("moveLeadStage", error); throw new Error("Не вдалося перемістити лід"); }
    await context.supabase.from("crm_lead_activities").insert({
      lead_id: data.id, actor_id: context.userId, kind: "stage_change",
      body: `Етап змінено на «${stage?.name ?? ""}»`,
      from_stage_id: prev?.stage_id ?? null, to_stage_id: data.stage_id,
    });
    return out;
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_leads").delete().eq("id", data.id);
    if (error) { console.error("deleteLead", error); throw new Error("Не вдалося видалити лід"); }
    return { ok: true };
  });

export const listLeadActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("crm_lead_activities").select("*").eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) { console.error("listLeadActivities", error); return []; }
    return rows ?? [];
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_lead_activities")
      .insert({ lead_id: data.lead_id, actor_id: context.userId, kind: "note", body: data.body });
    if (error) { console.error("addLeadNote", error); throw new Error("Не вдалося додати нотатку"); }
    return { ok: true };
  });

/* ---------------- Tasks ---------------- */

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_tasks").select("*").order("due_at", { ascending: true }).limit(300);
    if (error) { console.error("listTasks", error); throw new Error("Не вдалося завантажити задачі"); }
    return data ?? [];
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    kind: z.string().max(50).default("call"),
    description: z.string().max(2000).optional().nullable(),
    due_at: z.string().optional().nullable(),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    status: z.enum(["open", "done", "cancelled"]).default("open"),
    lead_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch = { ...rest, completed_at: rest.status === "done" ? new Date().toISOString() : null };
    const { data: out, error } = id
      ? await context.supabase.from("crm_tasks").update(patch).eq("id", id).select().single()
      : await context.supabase.from("crm_tasks").insert({ ...patch, owner_id: context.userId, assigned_to: context.userId }).select().single();
    if (error) { console.error("upsertTask", error); throw new Error("Не вдалося зберегти задачу"); }
    return out;
  });

/* ---------------- Requests & calls ---------------- */

export const listRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_requests").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) { console.error("listRequests", error); throw new Error("Не вдалося завантажити звернення"); }
    return data ?? [];
  });

export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_calls").select("*").order("started_at", { ascending: false }).limit(300);
    if (error) { console.error("listCalls", error); throw new Error("Не вдалося завантажити дзвінки"); }
    return data ?? [];
  });
