import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAutoEvent, addHours } from "./auto-events.server";
import { orderManagementInput } from "./orders.schema";
import {
  COMMERCIAL_STATUSES, PRODUCTION_STATUSES, FINANCIAL_STATUSES, ORDER_SERVICES, RISK_LEVELS,
} from "./orders.constants";


const orderInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(300),
  address: z.string().max(500).optional().nullable(),
  district: z.string().max(200).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  order_type: z.string().max(100).optional().nullable(),
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
  services: z.array(z.enum(ORDER_SERVICES)).optional(),
});

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listOrders", error); throw new Error("Не вдалося завантажити об'єкти"); }
    const rows = data ?? [];
    if (!rows.length) return [];
    const ids = rows.map((r: any) => r.id);
    const clientIds = Array.from(new Set(rows.map((r: any) => r.client_id).filter(Boolean)));
    const managerIds = Array.from(new Set(rows.map((r: any) => r.manager_id).filter(Boolean)));
    const [{ data: services }, { data: clients }, { data: profs }] = await Promise.all([
      context.supabase.from("order_services").select("order_id,service").in("order_id", ids),
      clientIds.length
        ? context.supabase.from("clients").select("id,name,phone").in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: [] as any[] }),
    ]);
    const svcMap = new Map<string, string[]>();
    (services ?? []).forEach((s: any) => {
      const arr = svcMap.get(s.order_id) ?? [];
      arr.push(s.service);
      svcMap.set(s.order_id, arr);
    });
    const cliMap = new Map<string, any>();
    (clients ?? []).forEach((c: any) => cliMap.set(c.id, c));
    void profs;
    const { staffNameMap } = await import("./staff.server");
    const mgrMap = await staffNameMap(managerIds as string[]);
    return rows.map((r: any) => ({
      ...r,
      services: svcMap.get(r.id) ?? [],
      client: r.client_id ? cliMap.get(r.client_id) ?? null : null,
      manager_display: r.manager_id ? mgrMap.get(r.manager_id) ?? null : null,
    }));
  });

export const getOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: obj, error } = await context.supabase
      .from("orders").select("*").eq("id", data.id).maybeSingle();
    if (error) { console.error("getOrder", error); throw new Error("Не вдалося отримати об'єкт"); }
    if (!obj) throw new Error("Об'єкт не знайдено");
    const [{ data: services }, { data: zones }, { data: measurements }, { data: assignments },
      { data: files }, { data: comments }, { data: history }, { data: estimates }, { data: bookings },
      { data: tasks }] =
      await Promise.all([
        context.supabase.from("order_services").select("*").eq("order_id", data.id),
        context.supabase.from("order_zones").select("*").eq("order_id", data.id).order("created_at"),
        context.supabase.from("order_measurements").select("*").eq("order_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("order_assignments").select("*").eq("order_id", data.id),
        context.supabase.from("order_files").select("*").eq("order_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("order_comments").select("*").eq("order_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("order_status_history").select("*").eq("order_id", data.id).order("changed_at", { ascending: false }).limit(200),
        context.supabase.from("estimates").select("id,number,module,status,total_client,created_at").eq("order_id", data.id).order("created_at", { ascending: false }),
        context.supabase.from("crew_bookings").select("*").eq("order_id", data.id).order("date", { ascending: false }),
        context.supabase.from("crm_tasks")
          .select("id,title,description,kind,status,priority,due_at,completed_at,created_at,assigned_to,external_key")
          .eq("order_id", data.id).order("created_at", { ascending: false }).limit(200),
      ]);
    let client: any = null;
    if (obj.client_id) {
      const { data: c } = await context.supabase.from("clients").select("*").eq("id", obj.client_id).maybeSingle();
      client = c ?? null;
    }

    // Телефонія: дзвінки клієнта цього замовлення (за client_id або нормалізованим номером).
    const { toE164 } = await import("./phone");
    const e164 = toE164(client?.phone ?? null);
    let calls: any[] = [];
    if (obj.client_id || e164) {
      let q = context.supabase.from("crm_calls")
        .select("id,direction,status,started_at,created_at,duration_sec,is_missed,from_number,to_number,phone_e164,recording_url,recording_available,external_id,client_id")
        .order("started_at", { ascending: false, nullsFirst: false }).limit(100);
      q = obj.client_id && e164
        ? q.or(`client_id.eq.${obj.client_id},phone_e164.eq.${e164}`)
        : obj.client_id ? q.eq("client_id", obj.client_id) : q.eq("phone_e164", e164 as string);
      const { data: rows } = await q;
      calls = rows ?? [];
    }

    let manager_display: string | null = null;
    if (obj.manager_id) {
      const { staffName } = await import("./staff.server");
      manager_display = await staffName(obj.manager_id);
    }
    return {
      ...obj, client, manager_display,
      services: services ?? [], zones: zones ?? [], measurements: measurements ?? [],
      assignments: assignments ?? [], files: files ?? [], comments: comments ?? [],
      history: history ?? [], estimates: estimates ?? [], bookings: bookings ?? [],
      tasks: tasks ?? [], calls,
    };
  });


export const saveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { services, id, ...rest } = data;
    const row: any = { ...rest };
    if (!id) row.owner_id = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("orders").update(row).eq("id", id).select().single()
      : await context.supabase.from("orders").insert(row).select().single();
    if (error) { console.error("saveOrder", error); throw new Error("Не вдалося зберегти об'єкт"); }
    if (services) {
      await context.supabase.from("order_services").delete().eq("order_id", out.id);
      if (services.length) {
        await context.supabase.from("order_services")
          .insert(services.map((s) => ({ order_id: out.id, service: s })));
      }
    }
    return out;
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("orders").delete().eq("id", data.id).select("id");
    if (error) { console.error("deleteOrder", error); throw new Error("Не вдалося видалити об'єкт"); }
    if (!rows || rows.length === 0) throw new Error("Немає прав на видалення цього об'єкта");
    return { ok: true };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
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
    const { data: updated, error } = await context.supabase
      .from("orders").update(cleaned).eq("id", id).select("id");
    if (error) { console.error("updateOrderStatus", error); throw new Error("Не вдалося оновити статус"); }
    if (!updated || updated.length === 0) throw new Error("Немає прав на зміну статусу цього об'єкта");

    // Авто-події: договір і платежі
    const { data: obj } = await context.supabase
      .from("orders").select("id,name,address,client_id,clients:client_id(name)").eq("id", id).maybeSingle();
    const base = {
      order_id: id,
      client_id: (obj as any)?.client_id ?? null,
      address: (obj as any)?.address ?? null,
      client_name: (obj as any)?.clients?.name ?? null,
      employee_id: context.userId,
    };
    const now = new Date();
    const tomorrow10 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0).toISOString();

    if (cleaned.commercial_status === "contract") {
      await syncAutoEvent(context.supabase as any, context.userId, {
        ...base,
        source_type: "contract", source_id: id, event_type: "contract_signing",
        title: `Підписання договору — ${(obj as any)?.name ?? "Об'єкт"}`,
        category: "management", priority: "high",
        starts_at: tomorrow10, ends_at: addHours(tomorrow10, 1),
      });
    }
    if (cleaned.financial_status === "awaiting_payment" || cleaned.financial_status === "has_debt") {
      await syncAutoEvent(context.supabase as any, context.userId, {
        ...base,
        source_type: "payment", source_id: id, event_type: "payment_control",
        title: `Контроль оплати — ${(obj as any)?.name ?? "Об'єкт"}`,
        category: "finance", priority: cleaned.financial_status === "has_debt" ? "high" : "normal",
        starts_at: tomorrow10, ends_at: addHours(tomorrow10, 1),
      });
    }
    if (cleaned.financial_status === "prepayment_received" || cleaned.financial_status === "paid") {
      await syncAutoEvent(context.supabase as any, context.userId, {
        ...base,
        source_type: "payment", source_id: id, event_type: "payment_control",
        title: `Оплата отримана — ${(obj as any)?.name ?? "Об'єкт"}`,
        category: "finance", status: "done",
        starts_at: now.toISOString(), ends_at: addHours(now.toISOString(), 1),
      });
    }
    return { ok: true };
  });

// Zones
const zoneInput = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  service: z.enum(ORDER_SERVICES).optional().nullable(),
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

export const saveOrderZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zoneInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("order_zones").update(rest).eq("id", id).select().single()
      : await context.supabase.from("order_zones").insert(rest).select().single();
    if (error) { console.error("saveOrderZone", error); throw new Error("Не вдалося зберегти зону"); }
    return out;
  });

export const deleteOrderZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("order_zones").delete().eq("id", data.id);
    if (error) { console.error("deleteOrderZone", error); throw new Error("Не вдалося видалити зону"); }
    return { ok: true };
  });

// Comments
export const addOrderComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles").select("display_name,email").eq("user_id", context.userId).maybeSingle();
    const author_name = prof?.display_name || prof?.email || null;
    const { data: out, error } = await context.supabase.from("order_comments").insert({
      order_id: data.order_id, body: data.body, author_id: context.userId, author_name,
    }).select().single();
    if (error) { console.error("addOrderComment", error); throw new Error("Не вдалося додати коментар"); }
    return out;
  });

// Assignments
export const setOrderAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
    role: z.enum(["manager","surveyor","estimator","foreman","brigadier","executor","accountant","buyer","qc"]),
    user_id: z.string().uuid().optional().nullable(),
    display_name: z.string().max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("order_assignments")
      .delete().eq("order_id", data.order_id).eq("role", data.role);
    if (data.user_id || data.display_name) {
      const { error } = await context.supabase.from("order_assignments").insert({
        order_id: data.order_id, role: data.role,
        user_id: data.user_id ?? null, display_name: data.display_name ?? null,
      });
      if (error) { console.error("setOrderAssignment", error); throw new Error("Не вдалося зберегти призначення"); }
    }
    return { ok: true };
  });

// Measurement
const measurementInput = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  type: z.enum(["primary","repeat","control","as_built"]).default("primary"),
  measured_at: z.string().optional().nullable(),
  contact_on_site: z.string().max(200).optional().nullable(),
  area: z.number().optional().nullable(),
  perimeter: z.number().optional().nullable(),
  weight_kg: z.number().optional().nullable(),
  thicknesses: z.any().optional(),
  slopes: z.any().optional(),
  base: z.any().optional(),
  logistics: z.any().optional(),
  notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["draft","done","cancelled"]).default("draft"),
});

export const saveOrderMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const row: any = { ...rest, surveyor_id: context.userId };
    const { data: out, error } = id
      ? await context.supabase.from("order_measurements").update(row).eq("id", id).select().single()
      : await context.supabase.from("order_measurements").insert(row).select().single();
    if (error) { console.error("saveOrderMeasurement", error); throw new Error("Не вдалося зберегти замер"); }

    // Авто-подія календаря «Замір»
    const { data: obj } = await context.supabase
      .from("orders").select("id,name,address,client_id,clients:client_id(name)").eq("id", data.order_id).maybeSingle();
    if (out.measured_at) {
      const typeLabel: Record<string, string> = {
        primary: "Первинний замір", repeat: "Повторний замір",
        control: "Контрольний замір", as_built: "Виконавчий замір",
      };
      await syncAutoEvent(context.supabase as any, context.userId, {
        source_type: "measurement",
        source_id: out.id,
        event_type: out.type ?? "primary",
        title: `${typeLabel[out.type] ?? "Замір"} — ${(obj as any)?.name ?? "Об'єкт"}`,
        category: "measurement",
        starts_at: new Date(out.measured_at).toISOString(),
        ends_at: addHours(new Date(out.measured_at).toISOString(), 2),
        order_id: data.order_id,
        client_id: (obj as any)?.client_id ?? null,
        measurement_id: out.id,
        address: (obj as any)?.address ?? null,
        client_name: (obj as any)?.clients?.name ?? null,
        area: out.area ?? null,
        employee_id: context.userId,
        status: out.status === "done" ? "done" : out.status === "cancelled" ? "cancelled" : "planned",
        description: out.notes ?? null,
      });
    }
    // Sync object params on done
    if (out.status === "done") {
      const patch: any = {};
      if (out.area != null) patch.area = out.area;
      // area/perimeter live in zones/estimates; do minimal sync
      if (Object.keys(patch).length) {
        await context.supabase.from("orders").update({ commercial_status: "measurement_done" }).eq("id", data.order_id);
      } else {
        await context.supabase.from("orders").update({ commercial_status: "measurement_done" }).eq("id", data.order_id);
      }
    }
    return out;
  });

export const linkEstimateToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    estimate_id: z.string().uuid(),
    order_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("estimates").update({ order_id: data.order_id }).eq("id", data.estimate_id);
    if (error) { console.error("linkEstimateToOrder", error); throw new Error("Не вдалося прив'язати кошторис"); }
    return { ok: true };
  });

/**
 * Ручне збереження управлінських полів замовлення.
 * Основні колонки оновлюються напряму, ручні значення — merge у management_data,
 * тому наступна синхронізація з CRM їх не перезаписує.
 */
export const saveOrderManagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderManagementInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, services, management, ...core } = data;
    const patch: any = {};
    for (const [k, v] of Object.entries(core)) if (v !== undefined) patch[k] = v;

    if (management && Object.keys(management).length) {
      const { data: cur } = await context.supabase
        .from("orders").select("management_data").eq("id", id).maybeSingle();
      const prev = (cur?.management_data && typeof cur.management_data === "object" && !Array.isArray(cur.management_data))
        ? (cur.management_data as Record<string, unknown>) : {};
      const next: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(management)) {
        if (v === undefined) continue;
        if (v === null || v === "") delete next[k];
        else next[k] = v;
      }
      patch.management_data = next;
    }

    if (Object.keys(patch).length) {
      const { data: rows, error } = await context.supabase
        .from("orders").update(patch).eq("id", id).select("id");
      if (error) { console.error("saveOrderManagement", error); throw new Error("Не вдалося зберегти зміни"); }
      if (!rows || rows.length === 0) throw new Error("Немає прав на редагування цього замовлення");
    }

    if (services) {
      await context.supabase.from("order_services").delete().eq("order_id", id);
      if (services.length) {
        await context.supabase.from("order_services")
          .insert(services.map((s) => ({ order_id: id, service: s })));
      }
    }
    return { ok: true };
  });

/* ───────────────────────── Задачі замовлення ───────────────────────── */

const orderTaskInput = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().nullable(),
  kind: z.string().max(50).optional().nullable(),
  due_at: z.string().max(40).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  status: z.enum(["open", "done", "cancelled"]).optional(),
});

export const saveOrderTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderTaskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, order_id, ...rest } = data;
    const { data: ord } = await context.supabase
      .from("orders").select("client_id").eq("id", order_id).maybeSingle();
    const row: any = {
      ...rest,
      order_id,
      client_id: (ord as any)?.client_id ?? null,
      completed_at: rest.status === "done" ? new Date().toISOString() : null,
    };
    if (!id) { row.owner_id = context.userId; row.assigned_to = context.userId; }
    const { data: out, error } = id
      ? await context.supabase.from("crm_tasks").update(row).eq("id", id).select().single()
      : await context.supabase.from("crm_tasks").insert(row).select().single();
    if (error) { console.error("saveOrderTask", error); throw new Error("Не вдалося зберегти задачу"); }
    return out;
  });

export const deleteOrderTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_tasks").delete().eq("id", data.id);
    if (error) { console.error("deleteOrderTask", error); throw new Error("Не вдалося видалити задачу"); }
    return { ok: true };
  });

/* ───────────────────────── Файли замовлення ───────────────────────── */

export const saveOrderFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
    url: z.string().min(3).max(1000),
    file_name: z.string().max(300).optional().nullable(),
    category: z.string().max(60).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.from("order_files").insert({
      ...data, uploaded_by: context.userId,
    }).select().single();
    if (error) { console.error("saveOrderFile", error); throw new Error("Не вдалося додати файл"); }
    return out;
  });

export const deleteOrderFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("order_files").delete().eq("id", data.id);
    if (error) { console.error("deleteOrderFile", error); throw new Error("Не вдалося видалити файл"); }
    return { ok: true };
  });

export const deleteOrderComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("order_comments").delete().eq("id", data.id);
    if (error) { console.error("deleteOrderComment", error); throw new Error("Не вдалося видалити коментар"); }
    return { ok: true };
  });
