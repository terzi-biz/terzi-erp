import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const COMMERCIAL_STATUSES = [
  "new","qualification","measurement_scheduled","measurement_done","calculation",
  "estimate_sent","negotiation","contract","awaiting_prepayment","sold","refused","postponed",
] as const;
export const PRODUCTION_STATUSES = [
  "not_planned","preparation","awaiting_materials","ready_to_plan","planned",
  "crew_assigned","in_progress","paused","works_done","acceptance","remarks","handed_over","warranty",
] as const;
export const FINANCIAL_STATUSES = [
  "no_invoice","awaiting_payment","partial_payment","prepayment_received",
  "has_debt","paid","financially_closed",
] as const;
export const OBJECT_SERVICES = [
  "screed","roofing_pvc","roofing_ruberoid","insulation","demolition","plaster","polybeton","other",
] as const;
export const RISK_LEVELS = ["green","yellow","red"] as const;

export const COMMERCIAL_LABELS: Record<string,string> = {
  new: "Новий", qualification: "Кваліфікація", measurement_scheduled: "Замір призначено",
  measurement_done: "Замір виконано", calculation: "Розрахунок", estimate_sent: "Смета надіслана",
  negotiation: "Переговори", contract: "Договір", awaiting_prepayment: "Очікує передоплату",
  sold: "Продано", refused: "Відмова", postponed: "Відкладено",
};
export const PRODUCTION_LABELS: Record<string,string> = {
  not_planned: "Не запланований", preparation: "Підготовка", awaiting_materials: "Очікує матеріали",
  ready_to_plan: "Готовий до планування", planned: "Заплановано", crew_assigned: "Бригада призначена",
  in_progress: "В роботі", paused: "Призупинено", works_done: "Роботи виконані",
  acceptance: "Приймання", remarks: "Зауваження", handed_over: "Об'єкт зданий", warranty: "Гарантія",
};
export const FINANCIAL_LABELS: Record<string,string> = {
  no_invoice: "Рахунок не виставлено", awaiting_payment: "Очікує оплату", partial_payment: "Часткова оплата",
  prepayment_received: "Передоплата отримана", has_debt: "Є заборгованість", paid: "Оплачено",
  financially_closed: "Фінансово закритий",
};
export const SERVICE_LABELS: Record<string,string> = {
  screed: "Стяжка", roofing_pvc: "ПВХ-мембрана", roofing_ruberoid: "Рубероїд/Акваізол",
  insulation: "Утеплення", demolition: "Демонтаж", plaster: "Штукатурка",
  polybeton: "Полістиролбетон", other: "Інше",
};

const objectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(300),
  address: z.string().max(500).optional().nullable(),
  district: z.string().max(200).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  object_type: z.string().max(100).optional().nullable(),
  floor: z.number().int().optional().nullable(),
  has_lift: z.boolean().optional(),
  access_notes: z.string().max(1000).optional().nullable(),
  distance_km: z.number().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  crm_link: z.string().max(500).optional().nullable(),
  commercial_status: z.enum(COMMERCIAL_STATUSES).optional(),
  production_status: z.enum(PRODUCTION_STATUSES).optional(),
  financial_status: z.enum(FINANCIAL_STATUSES).optional(),
  risk_level: z.enum(RISK_LEVELS).optional(),
  planned_start: z.string().optional().nullable(),
  planned_end: z.string().optional().nullable(),
  services: z.array(z.enum(OBJECT_SERVICES)).optional(),
});

export const listObjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("objects").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listObjects", error); throw new Error("Не вдалося завантажити об'єкти"); }
    const rows = data ?? [];
    if (!rows.length) return [];
    const ids = rows.map((r: any) => r.id);
    const clientIds = Array.from(new Set(rows.map((r: any) => r.client_id).filter(Boolean)));
    const managerIds = Array.from(new Set(rows.map((r: any) => r.manager_id).filter(Boolean)));
    const [{ data: services }, { data: clients }, { data: profs }] = await Promise.all([
      context.supabase.from("object_services").select("object_id,service").in("object_id", ids),
      clientIds.length
        ? context.supabase.from("clients").select("id,name,phone").in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      managerIds.length
        ? context.supabase.from("profiles").select("user_id,display_name,email").in("user_id", managerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const svcMap = new Map<string, string[]>();
    (services ?? []).forEach((s: any) => {
      const arr = svcMap.get(s.object_id) ?? [];
      arr.push(s.service);
      svcMap.set(s.object_id, arr);
    });
    const cliMap = new Map<string, any>();
    (clients ?? []).forEach((c: any) => cliMap.set(c.id, c));
    const mgrMap = new Map<string, string>();
    (profs ?? []).forEach((p: any) => mgrMap.set(p.user_id, p.display_name || p.email || ""));
    return rows.map((r: any) => ({
      ...r,
      services: svcMap.get(r.id) ?? [],
      client: r.client_id ? cliMap.get(r.client_id) ?? null : null,
      manager_display: r.manager_id ? mgrMap.get(r.manager_id) ?? null : null,
    }));
  });

export const getObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: obj, error } = await context.supabase
      .from("objects").select("*").eq("id", data.id).maybeSingle();
    if (error) { console.error("getObject", error); throw new Error("Не вдалося отримати об'єкт"); }
    if (!obj) throw new Error("Об'єкт не знайдено");
    const [{ data: services }, { data: zones }, { data: measurements }, { data: assignments },
      { data: files }, { data: comments }, { data: history }, { data: estimates }, { data: bookings }] =
      await Promise.all([
        context.supabase.from("object_services").select("*").eq("object_id", data.id),
        context.supabase.from("object_zones").select("*").eq("object_id", data.id).order("created_at"),
        context.supabase.from("object_measurements").select("*").eq("object_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("object_assignments").select("*").eq("object_id", data.id),
        context.supabase.from("object_files").select("*").eq("object_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("object_comments").select("*").eq("object_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("object_status_history").select("*").eq("object_id", data.id).order("changed_at", { ascending: false }).limit(200),
        context.supabase.from("estimates").select("id,number,module,status,total_client,created_at").eq("object_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("crew_bookings").select("*").eq("object_id", data.id).order("start_at", { ascending: false }),
      ]);
    let client: any = null;
    if (obj.client_id) {
      const { data: c } = await context.supabase.from("clients").select("*").eq("id", obj.client_id).maybeSingle();
      client = c ?? null;
    }
    let manager_display: string | null = null;
    if (obj.manager_id) {
      const { data: p } = await context.supabase.from("profiles").select("display_name,email").eq("user_id", obj.manager_id).maybeSingle();
      manager_display = p ? (p.display_name || p.email) : null;
    }
    return {
      ...obj, client, manager_display,
      services: services ?? [], zones: zones ?? [], measurements: measurements ?? [],
      assignments: assignments ?? [], files: files ?? [], comments: comments ?? [],
      history: history ?? [], estimates: estimates ?? [], bookings: bookings ?? [],
    };
  });

export const saveObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => objectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { services, id, ...rest } = data;
    const row: any = { ...rest };
    if (!id) row.owner_id = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("objects").update(row).eq("id", id).select().single()
      : await context.supabase.from("objects").insert(row).select().single();
    if (error) { console.error("saveObject", error); throw new Error("Не вдалося зберегти об'єкт"); }
    if (services) {
      await context.supabase.from("object_services").delete().eq("object_id", out.id);
      if (services.length) {
        await context.supabase.from("object_services")
          .insert(services.map((s) => ({ object_id: out.id, service: s })));
      }
    }
    return out;
  });

export const deleteObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("objects").delete().eq("id", data.id);
    if (error) { console.error("deleteObject", error); throw new Error("Не вдалося видалити об'єкт"); }
    return { ok: true };
  });

export const updateObjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    commercial_status: z.enum(COMMERCIAL_STATUSES).optional(),
    production_status: z.enum(PRODUCTION_STATUSES).optional(),
    financial_status: z.enum(FINANCIAL_STATUSES).optional(),
    risk_level: z.enum(RISK_LEVELS).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const cleaned: any = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) cleaned[k] = v;
    if (!Object.keys(cleaned).length) return { ok: true };
    const { error } = await context.supabase.from("objects").update(cleaned).eq("id", id);
    if (error) { console.error("updateObjectStatus", error); throw new Error("Не вдалося оновити статус"); }
    return { ok: true };
  });

// Zones
const zoneInput = z.object({
  id: z.string().uuid().optional(),
  object_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  service: z.enum(OBJECT_SERVICES).optional().nullable(),
  area: z.number().optional().nullable(),
  perimeter: z.number().optional().nullable(),
  thickness_cm: z.number().optional().nullable(),
  slope_percent: z.number().optional().nullable(),
  volume: z.number().optional().nullable(),
  complexity: z.string().max(100).optional().nullable(),
  base_type: z.string().max(200).optional().nullable(),
  planned_start: z.string().optional().nullable(),
  planned_end: z.string().optional().nullable(),
  crew_id: z.string().max(100).optional().nullable(),
  status: z.string().max(50).optional(),
});

export const saveObjectZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zoneInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("object_zones").update(rest).eq("id", id).select().single()
      : await context.supabase.from("object_zones").insert(rest).select().single();
    if (error) { console.error("saveObjectZone", error); throw new Error("Не вдалося зберегти зону"); }
    return out;
  });

export const deleteObjectZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("object_zones").delete().eq("id", data.id);
    if (error) { console.error("deleteObjectZone", error); throw new Error("Не вдалося видалити зону"); }
    return { ok: true };
  });

// Comments
export const addObjectComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    object_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles").select("display_name,email").eq("user_id", context.userId).maybeSingle();
    const author_name = prof?.display_name || prof?.email || null;
    const { data: out, error } = await context.supabase.from("object_comments").insert({
      object_id: data.object_id, body: data.body, author_id: context.userId, author_name,
    }).select().single();
    if (error) { console.error("addObjectComment", error); throw new Error("Не вдалося додати коментар"); }
    return out;
  });

// Assignments
export const setObjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    object_id: z.string().uuid(),
    role: z.enum(["manager","surveyor","estimator","foreman","brigadier","executor","accountant","buyer","qc"]),
    user_id: z.string().uuid().optional().nullable(),
    display_name: z.string().max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("object_assignments")
      .delete().eq("object_id", data.object_id).eq("role", data.role);
    if (data.user_id || data.display_name) {
      const { error } = await context.supabase.from("object_assignments").insert({
        object_id: data.object_id, role: data.role,
        user_id: data.user_id ?? null, display_name: data.display_name ?? null,
      });
      if (error) { console.error("setObjectAssignment", error); throw new Error("Не вдалося зберегти призначення"); }
    }
    return { ok: true };
  });

// Measurement
const measurementInput = z.object({
  id: z.string().uuid().optional(),
  object_id: z.string().uuid(),
  type: z.enum(["primary","repeat","control","as_built"]).default("primary"),
  measured_at: z.string().optional().nullable(),
  contact_on_site: z.string().max(200).optional().nullable(),
  area: z.number().optional().nullable(),
  perimeter: z.number().optional().nullable(),
  thicknesses: z.any().optional(),
  slopes: z.any().optional(),
  base: z.any().optional(),
  logistics: z.any().optional(),
  notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["draft","done","cancelled"]).default("draft"),
});

export const saveObjectMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const row: any = { ...rest, surveyor_id: context.userId };
    const { data: out, error } = id
      ? await context.supabase.from("object_measurements").update(row).eq("id", id).select().single()
      : await context.supabase.from("object_measurements").insert(row).select().single();
    if (error) { console.error("saveObjectMeasurement", error); throw new Error("Не вдалося зберегти замер"); }
    // Sync object params on done
    if (out.status === "done") {
      const patch: any = {};
      if (out.area != null) patch.area = out.area;
      // area/perimeter live in zones/estimates; do minimal sync
      if (Object.keys(patch).length) {
        await context.supabase.from("objects").update({ commercial_status: "measurement_done" }).eq("id", data.object_id);
      } else {
        await context.supabase.from("objects").update({ commercial_status: "measurement_done" }).eq("id", data.object_id);
      }
    }
    return out;
  });

export const linkEstimateToObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    estimate_id: z.string().uuid(),
    object_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("estimates").update({ object_id: data.object_id }).eq("id", data.estimate_id);
    if (error) { console.error("linkEstimateToObject", error); throw new Error("Не вдалося прив'язати кошторис"); }
    return { ok: true };
  });
