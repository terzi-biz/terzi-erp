import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dateRangeSchema,
  leadSearchSchema,
  measurementEventPatchSchema,
  scheduleMeasurementSchema,
} from "./crm-analytics.schema";
import { measurementsPayload } from "./measurements.server";

/** Заміри за період: факти, планові події календаря і воронка лід → замір → договір. */
export const listMeasurements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ context, data }) => measurementsPayload(context.supabase, data));

/** Планування заміру в календарі на конкретну дату й час. */
export const scheduleMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleMeasurementSchema.parse(d))
  .handler(async ({ context, data }) => {
    const starts = new Date(data.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("Некоректна дата заміру");
    const ends = new Date(starts.getTime() + data.duration_min * 60_000);

    const { data: row, error } = await context.supabase
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
        client_id: data.client_id ?? null,
        description: data.description ?? null,
        metadata: data.lead_id ? { lead_id: data.lead_id } : {},
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error("Не вдалося запланувати замір");
    return row;
  });

/** Зміна статусу планової події заміру (виконано / скасовано). */
export const setMeasurementEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measurementEventPatchSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("category", "measure")
      .select()
      .maybeSingle();
    if (error) throw new Error("Не вдалося оновити статус заміру");
    if (!row) throw new Error("Подію не знайдено або немає прав");
    return row;
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
