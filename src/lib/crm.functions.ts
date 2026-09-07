import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { digits, likeTerm, pageQuerySchema, pageRange } from "./pagination";


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

/** Контакти. Без параметрів — масив; з `{ page }` — серверна пагінація й пошук. */
export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ? pageQuerySchema.partial().parse(d) : {}))
  .handler(async ({ context, data: input }) => {
    const paged = Boolean(input && input.page);
    const p = pageQuerySchema.parse({ ...(input ?? {}), page: input?.page ?? 1 });
    let q = context.supabase
      .from("crm_contacts").select("*", paged ? { count: "exact" } : {})
      .order("created_at", { ascending: false });
    const term = likeTerm(p.q);
    if (term) {
      const num = digits(p.q);
      const parts = [`full_name.ilike.*${term}*`, `phone.ilike.*${term}*`, `company.ilike.*${term}*`, `email.ilike.*${term}*`];
      if (num.length >= 4) parts.push(`phone_norm.ilike.*${num}*`);
      q = q.or(parts.join(","));
    }
    if (paged) { const [a, b] = pageRange(p); q = q.range(a, b); } else { q = q.limit(500); }
    const res = await (q as any);
    if (res.error) { console.error("listContacts", res.error); throw new Error("Не вдалося завантажити контакти"); }
    const rows = (res.data ?? []) as any[];
    return (paged ? { rows, total: (res.count as number | null) ?? rows.length, page: p.page, page_size: p.page_size } : rows) as any;
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
  order_id: z.string().uuid().optional().nullable(),
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

/** Ліди. Без параметрів — масив для канбану; з `{ page }` — серверна пагінація й пошук. */
export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ? pageQuerySchema.partial().parse(d) : {}))
  .handler(async ({ context, data: input }) => {
    const paged = Boolean(input && input.page);
    const p = pageQuerySchema.parse({ ...(input ?? {}), page: input?.page ?? 1 });
    let q = context.supabase
      .from("crm_leads").select("*", paged ? { count: "exact" } : {})
      .order("updated_at", { ascending: false });
    const term = likeTerm(p.q);
    if (term) {
      const num = digits(p.q);
      const parts = [`title.ilike.*${term}*`, `contact_name.ilike.*${term}*`, `phone.ilike.*${term}*`, `address.ilike.*${term}*`];
      if (num.length >= 4) parts.push(`phone_e164.ilike.*${num}*`);
      q = q.or(parts.join(","));
    }
    if (p.status) q = q.eq("status", p.status);
    if (paged) { const [a, b] = pageRange(p); q = q.range(a, b); } else { q = q.limit(500); }
    const res = await (q as any);
    if (res.error) { console.error("listLeads", res.error); throw new Error("Не вдалося завантажити ліди"); }
    const rows = (res.data ?? []) as any[];
    return (paged ? { rows, total: (res.count as number | null) ?? rows.length, page: p.page, page_size: p.page_size } : rows) as any;
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
    const status = stage?.is_won ? ("won" as const) : stage?.is_lost ? ("lost" as const) : ("open" as const);
    const patch = {
      stage_id: data.stage_id,
      probability: stage?.probability ?? null,
      status,
      closed_at: status === "open" ? null : new Date().toISOString(),
    };
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

/** Задачі. Без параметрів — масив; з `{ page }` — серверна пагінація, пошук і фільтр статусу. */
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ? pageQuerySchema.partial().parse(d) : {}))
  .handler(async ({ context, data: input }) => {
    const paged = Boolean(input && input.page);
    const p = pageQuerySchema.parse({ ...(input ?? {}), page: input?.page ?? 1 });
    let q = context.supabase
      .from("crm_tasks").select("*", paged ? { count: "exact" } : {})
      .order("due_at", { ascending: true });
    const term = likeTerm(p.q);
    if (term) q = q.or(`title.ilike.*${term}*,description.ilike.*${term}*`);
    if (p.status) q = q.eq("status", p.status);
    if (paged) { const [a, b] = pageRange(p); q = q.range(a, b); } else { q = q.limit(300); }
    const res = await (q as any);
    if (res.error) { console.error("listTasks", res.error); throw new Error("Не вдалося завантажити задачі"); }
    const rows = (res.data ?? []) as any[];
    return (paged ? { rows, total: (res.count as number | null) ?? rows.length, page: p.page, page_size: p.page_size } : rows) as any;
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

/** Дзвінки. Без параметрів — масив; з `{ page }` — серверна пагінація й пошук по номеру. */
export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ? pageQuerySchema.partial().parse(d) : {}))
  .handler(async ({ context, data: input }) => {
    const paged = Boolean(input && input.page);
    const p = pageQuerySchema.parse({ ...(input ?? {}), page: input?.page ?? 1 });
    let q = context.supabase
      .from("crm_calls").select("*", paged ? { count: "exact" } : {})
      .order("started_at", { ascending: false });
    const num = digits(p.q);
    if (num.length >= 3) q = q.or(`phone_e164.ilike.*${num}*,from_number.ilike.*${num}*,to_number.ilike.*${num}*`);
    if (p.status) q = q.eq("status", p.status);
    if (paged) { const [a, b] = pageRange(p); q = q.range(a, b); } else { q = q.limit(500); }
    const res = await (q as any);
    if (res.error) { console.error("listCalls", res.error); throw new Error("Не вдалося завантажити дзвінки"); }
    const rows = (res.data ?? []) as any[];
    return (paged ? { rows, total: (res.count as number | null) ?? rows.length, page: p.page, page_size: p.page_size } : rows) as any;
  });


/** Посилання на аудіозапис розмови (Binotel). Запитується на вимогу і кешується. */
export const getCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ call_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { fetchCallRecordingUrl } = await import("./integrations/binotel/record.server");
    return await fetchCallRecordingUrl(data.call_id);
  });


const requestInput = z.object({
  id: z.string().uuid().optional(),
  channel: z.string().min(1).max(50).default("manual"),
  subject: z.string().max(200).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  contact_email: z.string().max(200).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  campaign: z.string().max(100).optional().nullable(),
  status: z.enum(["new", "in_progress", "converted", "spam", "closed"]).default("new"),
});

export const upsertRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("crm_requests").update(rest).eq("id", id).select().single()
      : await context.supabase.from("crm_requests").insert({ ...rest, owner_id: context.userId, assigned_to: context.userId }).select().single();
    if (error) { console.error("upsertRequest", error); throw new Error("Не вдалося зберегти звернення"); }
    return out;
  });

export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_requests").delete().eq("id", data.id);
    if (error) { console.error("deleteRequest", error); throw new Error("Не вдалося видалити звернення"); }
    return { ok: true };
  });

export const convertRequestToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error: re } = await context.supabase
      .from("crm_requests").select("*").eq("id", data.id).maybeSingle();
    if (re || !req) throw new Error("Звернення не знайдено");
    if (req.lead_id) return { lead_id: req.lead_id };

    let contactId = req.contact_id as string | null;
    const norm = (req.contact_phone ?? "").replace(/\D/g, "");
    if (!contactId && norm.length >= 6) {
      const { data: existing } = await context.supabase
        .from("crm_contacts").select("id").eq("phone_norm", norm).limit(1).maybeSingle();
      contactId = existing?.id ?? null;
    }
    if (!contactId && (req.contact_name || req.contact_phone)) {
      const { data: c } = await context.supabase.from("crm_contacts").insert({
        full_name: req.contact_name || req.contact_phone || "Без імені",
        phone: req.contact_phone, email: req.contact_email, owner_id: context.userId,
      }).select("id").single();
      contactId = c?.id ?? null;
    }

    const { data: pipeline } = await context.supabase
      .from("crm_pipelines").select("id").eq("is_active", true).order("sort_order").limit(1).maybeSingle();
    const { data: stage } = pipeline
      ? await context.supabase.from("crm_stages").select("id, probability")
          .eq("pipeline_id", pipeline.id).order("sort_order").limit(1).maybeSingle()
      : { data: null as any };

    const { data: lead, error: le } = await context.supabase.from("crm_leads").insert({
      title: req.subject || req.contact_name || `Звернення ${req.channel}`,
      pipeline_id: pipeline?.id ?? null,
      stage_id: stage?.id ?? null,
      contact_id: contactId,
      source: req.source || req.channel,
      notes: req.message,
      owner_id: context.userId,
      assigned_to: context.userId,
    }).select().single();
    if (le || !lead) { console.error("convertRequestToLead", le); throw new Error("Не вдалося створити лід"); }

    await context.supabase.from("crm_requests")
      .update({ status: "converted", lead_id: lead.id, contact_id: contactId }).eq("id", req.id);
    await context.supabase.from("crm_lead_activities").insert({
      lead_id: lead.id, actor_id: context.userId, kind: "created",
      body: `Лід створено зі звернення (${req.channel})`,
    });
    return { lead_id: lead.id };
  });

export const upsertCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    direction: z.enum(["inbound", "outbound"]).default("inbound"),
    from_number: z.string().max(50).optional().nullable(),
    to_number: z.string().max(50).optional().nullable(),
    duration_sec: z.number().int().nonnegative().default(0),
    status: z.string().max(50).optional().nullable(),
    started_at: z.string().optional(),
    lead_id: z.string().uuid().optional().nullable(),
    contact_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("crm_calls").update(rest).eq("id", id).select().single()
      : await context.supabase.from("crm_calls").insert({ ...rest, owner_id: context.userId }).select().single();
    if (error) { console.error("upsertCall", error); throw new Error("Не вдалося зберегти дзвінок"); }
    return out;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_tasks").delete().eq("id", data.id);
    if (error) { console.error("deleteTask", error); throw new Error("Не вдалося видалити задачу"); }
    return { ok: true };
  });

/* ---------------- Server-side KPI (не залежить від пагінації) ---------------- */

export const crmKpi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().min(8).max(10), to: z.string().min(8).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.rpc("crm_kpi", {
      p_from: `${data.from}T00:00:00.000Z`,
      p_to: `${data.to}T23:59:59.999Z`,
    });
    if (error) { console.error("crmKpi", error); throw new Error("Не вдалося порахувати показники CRM"); }
    return out as {
      leads: { total: number; open: number; qualified: number; won: number; lost: number; postponed: number;
        conversion: number; pipeline_value: number; won_value: number;
        with_contact: number; with_client: number; with_order: number };
      calls: { total: number; inbound: number; outbound: number; missed: number; answered: number; duration_sec: number };
      tasks: { open: number; overdue: number; today: number };
      measurements: { scheduled: number; completed: number; cancelled: number };
    };
  });

/* ---------------- Лід → Замовлення ---------------- */

export const convertLeadToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: lead, error: le } = await sb.from("crm_leads")
      .select("id, title, client_id, contact_id, order_id, address, district, phone_e164, source, assigned_to, budget, area, notes, utm, direction, campaign, external_source, external_id, marketing_channel_id, marketing_campaign_id")
      .eq("id", data.lead_id).maybeSingle();

    if (le || !lead) throw new Error("Лід не знайдено");
    if (lead.order_id) return { order_id: lead.order_id as string, created: false };
    if (!lead.client_id && !lead.contact_id && !lead.phone_e164) {
      throw new Error("Лід не кваліфікований: немає клієнта, контакту або телефону");
    }

    let clientId = lead.client_id as string | null;
    if (!clientId && lead.contact_id) {
      const { data: ct } = await sb.from("crm_contacts").select("client_id, full_name, phone").eq("id", lead.contact_id).maybeSingle();
      clientId = (ct?.client_id as string | null) ?? null;
      if (!clientId && ct) {
        const { data: created, error: ce } = await sb.from("clients")
          .insert({ name: ct.full_name || lead.title, phone: ct.phone ?? lead.phone_e164 ?? null, source: lead.source ?? null, owner_id: context.userId } as any)
          .select("id").single();
        if (ce) { console.error("convertLeadToOrder client", ce); throw new Error("Не вдалося створити клієнта"); }
        clientId = created.id as string;
        await sb.from("crm_contacts").update({ client_id: clientId }).eq("id", lead.contact_id);
      }
    }
    if (!clientId && lead.phone_e164) {
      const { data: found } = await sb.from("clients").select("id").eq("phone_e164", lead.phone_e164).limit(2);
      if ((found?.length ?? 0) === 1) clientId = found![0]!.id as string;
      else if (!found?.length) {
        const { data: created, error: ce } = await sb.from("clients")
          .insert({ name: lead.title, phone: lead.phone_e164, source: lead.source ?? null, owner_id: context.userId } as any).select("id").single();
        if (ce) { console.error("convertLeadToOrder client2", ce); throw new Error("Не вдалося створити клієнта"); }
        clientId = created.id as string;
      }
    }
    if (!clientId) throw new Error("Неоднозначний клієнт — оберіть його вручну в картці ліда");

    const { data: order, error: oe } = await sb.from("orders").insert({
      name: lead.title,
      address: lead.address ?? null,
      client_id: clientId,
      manager_id: lead.assigned_to ?? context.userId,
      source: lead.source ?? null,
      commercial_status: "qualification",
    } as any).select("id, number").single();
    if (oe || !order) { console.error("convertLeadToOrder order", oe); throw new Error("Не вдалося створити замовлення"); }

    await sb.from("crm_leads").update({ order_id: order.id, client_id: clientId }).eq("id", lead.id);
    await sb.from("crm_lead_activities").insert({
      lead_id: lead.id, actor_id: context.userId, kind: "converted",
      body: `Створено замовлення ${order.number ?? ""}`.trim(),
    });
    return { order_id: order.id as string, number: order.number as string | null, created: true };
  });
