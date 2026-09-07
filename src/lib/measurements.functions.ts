import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dateRangeSchema,
  leadSearchSchema,
  measurementResultSchema,
  measurementStatusSchema,
  measurementToEstimateSchema,
  scheduleMeasurementSchema,
} from "./crm-analytics.schema";
import { measurementsPayload } from "./measurements.server";
import { measurementTypeFromEvent } from "./measurement-status";
import { kyivRange } from "./kyiv-time";

/** Заміри за період: канонічні записи order_measurements + календарна проєкція. */
export const listMeasurements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ context, data }) => measurementsPayload(context.supabase, kyivRange(data.from, data.to)));

/**
 * Планування заміру. Канонічна сутність — order_measurements;
 * подія календаря створюється як проєкція і посилається на measurement_id.
 */
export const scheduleMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleMeasurementSchema.parse(d))
  .handler(async ({ context, data }) => {
    const starts = new Date(data.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("Некоректна дата заміру");
    const ends = new Date(starts.getTime() + data.duration_min * 60_000);

    let clientId = data.client_id ?? null;
    if (!clientId && data.order_id) {
      const { data: ord } = await context.supabase
        .from("orders").select("client_id").eq("id", data.order_id).maybeSingle();
      clientId = (ord?.client_id as string | null) ?? null;
    }
    if (!clientId && data.lead_id) {
      const { data: lead } = await context.supabase
        .from("crm_leads").select("client_id").eq("id", data.lead_id).maybeSingle();
      clientId = (lead?.client_id as string | null) ?? null;
    }

    const { data: measurement, error: me } = await context.supabase
      .from("order_measurements")
      .insert({
        order_id: data.order_id ?? null,
        lead_id: data.lead_id ?? null,
        client_id: clientId,
        surveyor_id: data.employee_id ?? null,
        scheduled_at: starts.toISOString(),
        address: data.address ?? null,
        area: data.area ?? null,
        notes: data.description ?? null,
        type: measurementTypeFromEvent(data.event_type),
        status: data.employee_id ? "assigned" : "planned",
        created_by: context.userId,
      } as any)
      .select()
      .single();
    if (me || !measurement) { console.error("scheduleMeasurement", me); throw new Error("Не вдалося створити замір"); }

    const { data: event, error: ee } = await context.supabase
      .from("calendar_events")
      .insert({
        title: data.title,
        event_type: data.event_type,
        category: "measure",
        status: "planned",
        priority: "normal",
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        address: data.address ?? null,
        client_name: data.client_name ?? null,
        area: data.area ?? null,
        employee_id: data.employee_id ?? null,
        order_id: data.order_id ?? null,
        client_id: clientId,
        measurement_id: measurement.id,
        description: data.description ?? null,
        metadata: data.lead_id ? { lead_id: data.lead_id } : {},
        created_by: context.userId,
      })
      .select()
      .maybeSingle();
    if (ee) console.error("scheduleMeasurement event", ee);

    return { measurement, event: event ?? null };
  });

const EVENT_STATUS_BY_MEASUREMENT: Record<string, string> = {
  planned: "planned",
  assigned: "planned",
  confirmed: "confirmed",
  in_progress: "in_progress",
  completed: "done",
  canceled: "cancelled",
  rescheduled: "cancelled",
};

/** Життєвий цикл заміру: planned → assigned → confirmed → in_progress → completed. */
export const setMeasurementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementStatusSchema.parse(d))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.surveyor_id !== undefined) patch['surveyor_id'] = data.surveyor_id;
    if (data.scheduled_at !== undefined) patch['scheduled_at'] = data.scheduled_at;
    if (data.status === "confirmed") patch['confirmed_at'] = now;
    if (data.status === "completed") { patch['completed_at'] = now; patch['measured_at'] = now; }

    const { data: row, error } = await context.supabase
      .from("order_measurements").update(patch as any).eq("id", data.id).select().maybeSingle();
    if (error) { console.error("setMeasurementStatus", error); throw new Error("Не вдалося оновити статус заміру"); }
    if (!row) throw new Error("Замір не знайдено або немає прав");

    await context.supabase
      .from("calendar_events")
      .update({
        status: EVENT_STATUS_BY_MEASUREMENT[data.status] ?? "planned",
        ...(data.surveyor_id !== undefined ? { employee_id: data.surveyor_id } : {}),
        ...(data.scheduled_at ? { starts_at: data.scheduled_at } : {}),
      })
      .eq("measurement_id", data.id);

    return row;
  });

/** Збереження результату заміру (за замовчуванням переводить у completed). */
export const saveMeasurementResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementResultSchema.parse(d))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (data.area !== undefined) patch['area'] = data.area;
    if (data.perimeter !== undefined) patch['perimeter'] = data.perimeter;
    if (data.notes !== undefined) patch['notes'] = data.notes;
    if (data.address !== undefined) patch['address'] = data.address;
    if (data.complete) { patch['status'] = "completed"; patch['completed_at'] = now; patch['measured_at'] = now; }

    const { data: row, error } = await context.supabase
      .from("order_measurements").update(patch as any).eq("id", data.id).select().maybeSingle();
    if (error) { console.error("saveMeasurementResult", error); throw new Error("Не вдалося зберегти результат заміру"); }
    if (!row) throw new Error("Замір не знайдено або немає прав");

    if (data.complete) {
      await context.supabase.from("calendar_events").update({ status: "done" }).eq("measurement_id", data.id);
    }
    return row;
  });

/**
 * Кошторис із виконаного заміру. Створює чернетку з прив'язкою до замовлення й клієнта;
 * розрахунок робиться існуючим Calculation Core у калькуляторі модуля.
 */
export const createEstimateFromMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementToEstimateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: m, error: me } = await sb
      .from("order_measurements").select("*").eq("id", data.measurement_id).maybeSingle();
    if (me || !m) throw new Error("Замір не знайдено");
    if (!["completed", "done"].includes(String(m.status))) {
      throw new Error("Кошторис можна створити тільки з виконаного заміру");
    }

    let orderId = (m as any).order_id as string | null;
    let clientId = (m as any).client_id as string | null;
    let order: any = null;
    if (orderId) {
      const { data: o } = await sb.from("orders").select("id, number, name, address, client_id, manager_id").eq("id", orderId).maybeSingle();
      order = o ?? null;
      clientId = clientId ?? (o?.client_id as string | null) ?? null;
    }
    if (!orderId) {
      if (!clientId) throw new Error("Замір не прив'язаний до замовлення чи клієнта — прив'яжіть їх спочатку");
      const { data: created, error: oe } = await sb.from("orders").insert({
        name: (m as any).address || "Об'єкт із заміру",
        address: (m as any).address ?? null,
        client_id: clientId,
        manager_id: context.userId,
        commercial_status: "calculation",
      } as any).select("id, number, name, address, client_id").single();
      if (oe || !created) { console.error("createEstimateFromMeasurement order", oe); throw new Error("Не вдалося створити замовлення"); }
      order = created; orderId = created.id as string;
      await sb.from("order_measurements").update({ order_id: orderId } as any).eq("id", data.measurement_id);
    }
    if (!clientId) throw new Error("Немає клієнта для кошторису");

    let clientName: string | null = null;
    let clientPhone: string | null = null;
    const { data: cl } = await sb.from("clients").select("name, phone").eq("id", clientId).maybeSingle();
    clientName = (cl?.name as string | null) ?? null;
    clientPhone = (cl?.phone as string | null) ?? null;

    const number = `З-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Date.now()).slice(-5)}`;
    const { data: est, error: ee } = await sb.from("estimates").insert({
      number,
      module: data.module,
      status: "afterMeasure",
      order_id: orderId,
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      address: (m as any).address ?? order?.address ?? null,
      area: (m as any).area ?? null,
      total_client: 0, total_cost: 0, gross_profit: 0, margin_percent: 0,
      payload: {
        measurement_id: (m as any).id,
        area: (m as any).area ?? null,
        perimeter: (m as any).perimeter ?? null,
        thicknesses: (m as any).thicknesses ?? null,
        slopes: (m as any).slopes ?? null,
        base: (m as any).base ?? null,
        logistics: (m as any).logistics ?? null,
        notes: (m as any).notes ?? null,
      },
      owner_id: context.userId,
    } as any).select("id, number, order_id, client_id").single();
    if (ee || !est) { console.error("createEstimateFromMeasurement estimate", ee); throw new Error("Не вдалося створити кошторис"); }

    return { estimate_id: est.id as string, number: est.number as string, order_id: est.order_id as string, client_id: est.client_id as string, module: data.module };
  });

/** Ліди та замовлення для прив'язки заміру. */
export const listMeasurementTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadSearchSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const term = data.q.replace(/[,()\\%*]/g, " ").trim().slice(0, 60);

    let leadQ = context.supabase
      .from("crm_leads")
      .select("id, title, phone_e164, client_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (term) leadQ = leadQ.or(`title.ilike.*${term}*,phone_e164.ilike.*${term}*`);

    let orderQ = context.supabase
      .from("orders")
      .select("id, number, name, address, client_id, commercial_status")
      .order("created_at", { ascending: false })
      .limit(50);
    if (term) orderQ = orderQ.or(`name.ilike.*${term}*,number.ilike.*${term}*,address.ilike.*${term}*`);

    const [leads, orders, employees] = await Promise.all([
      leadQ,
      orderQ,
      context.supabase.from("profiles").select("user_id, display_name, email").limit(200),
    ]);

    return {
      leads: (leads.data ?? []) as any[],
      orders: (orders.data ?? []) as any[],
      employees: ((employees.data ?? []) as any[]).map((e) => ({
        id: e.user_id,
        name: e.display_name || e.email || "Без імені",
      })),
    };
  });
