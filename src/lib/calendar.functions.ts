import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calendarEventPayload, eventFilterSchema, rangeSchema } from "./calendar.server";
import {
  isMeasureCalendarEvent,
  omitUndefined,
  syncMeasurementForCalendarEvent,
  patchLinkedMeasurement,
} from "./measurement-calendar-sync";

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => eventFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("calendar_events")
      .select("*")
      .gte("starts_at", data.fromISO)
      .lt("starts_at", data.toISO)
      .order("starts_at");

    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    if (data.crewKey) q = q.eq("crew_key", data.crewKey);
    if (data.orderId) q = q.eq("order_id", data.orderId);
    if (data.statuses?.length) q = q.in("status", data.statuses);
    if (data.categories?.length) q = q.in("category", data.categories);
    if (data.directions?.length) q = q.in("direction", data.directions);
    if (data.search) {
      // Екрануємо символи, які PostgREST трактує як синтаксис фільтра (,()*\)
      const term = data.search
        .replace(/[,()\\]/g, " ")
        .replace(/[%*]/g, "")
        .trim()
        .slice(0, 100);
      if (term) {
        q = q.or(`title.ilike.*${term}*,address.ilike.*${term}*,client_name.ilike.*${term}*`);
      }
    }


    const { data: rows, error } = await q.limit(2000);
    if (error) throw new Error("Не вдалося завантажити події календаря");
    return rows ?? [];
  });

export const upsertCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => calendarEventPayload.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch = omitUndefined(rest as Record<string, unknown>);

    let row: Record<string, any> | null = null;
    if (id) {
      // Preserve measurement_id if client omitted it (EventEditor historically dropped FKs).
      if (patch.measurement_id === undefined) {
        const { data: prev } = await context.supabase
          .from("calendar_events").select("measurement_id, metadata, category, event_type")
          .eq("id", id).maybeSingle();
        if (prev?.measurement_id) patch.measurement_id = prev.measurement_id;
        if (patch.metadata === undefined && prev?.metadata) patch.metadata = prev.metadata;
      }
      const { data: updated, error } = await context.supabase
        .from("calendar_events").update(patch as any).eq("id", id).select().maybeSingle();
      if (error) throw new Error("Не вдалося зберегти подію");
      if (!updated) throw new Error("Подію не знайдено або немає прав на редагування");
      row = updated;
    } else {
      const { data: created, error } = await context.supabase
        .from("calendar_events")
        .insert({ ...patch, created_by: context.userId } as any)
        .select().single();
      if (error) throw new Error("Не вдалося створити подію");
      row = created;
    }

    if (row && isMeasureCalendarEvent(row.category, row.event_type)) {
      row = await syncMeasurementForCalendarEvent(context.supabase, context.userId, row);
    }
    return row;
  });

export const moveCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      starts_at: z.string(),
      ends_at: z.string(),
      employee_id: z.string().uuid().nullable().optional(),
      crew_key: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...raw } = data;
    const patch = omitUndefined(raw as Record<string, unknown>);
    const { data: row, error } = await context.supabase
      .from("calendar_events").update(patch as any).eq("id", id).select().maybeSingle();
    if (error) throw new Error("Не вдалося перенести подію");
    if (!row) throw new Error("Немає прав на перенесення цієї події");

    if (isMeasureCalendarEvent(row.category, row.event_type)) {
      if (row.measurement_id) {
        await patchLinkedMeasurement(context.supabase, {
          measurement_id: row.measurement_id,
          starts_at: row.starts_at,
          employee_id: row.employee_id,
          status: row.status,
        });
      } else {
        await syncMeasurementForCalendarEvent(context.supabase, context.userId, row);
      }
    }
    return row;
  });

export const setCalendarEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("calendar_events").update({ status: data.status }).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error("Не вдалося змінити статус");
    if (!row) throw new Error("Немає прав на зміну статусу");

    if (isMeasureCalendarEvent(row.category, row.event_type)) {
      if (row.measurement_id) {
        await patchLinkedMeasurement(context.supabase, {
          measurement_id: row.measurement_id,
          status: row.status,
          employee_id: row.employee_id,
          starts_at: row.starts_at,
        });
      } else {
        await syncMeasurementForCalendarEvent(context.supabase, context.userId, row);
      }
    }
    return row;
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw new Error("Не вдалося видалити подію");
    return { ok: true };
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listStaffDirectory } = await import("./staff.server");
    return await listStaffDirectory();
  });

export const listCalendarOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id,number,name,address,client_id")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error("Не вдалося завантажити замовлення");
    return data ?? [];
  });

/** Ідемпотентне автостворення події з іншої сутності ERP */
export const syncSourceEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("calendar_events").select("id")
      .eq("source_type", data.source_type).eq("source_id", data.source_id)
      .eq("event_type", data.event_type).maybeSingle();

    const patch = data.patch as never;
    if (existing?.id) {
      const { data: row, error } = await context.supabase
        .from("calendar_events").update(patch).eq("id", existing.id).select().maybeSingle();
      if (error) throw new Error("Не вдалося оновити пов'язану подію");
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert({
        ...(data.patch as Record<string, unknown>),
        source_type: data.source_type,
        source_id: data.source_id,
        event_type: data.event_type,
        created_by: context.userId,
      } as never)
      .select().single();

    if (error) throw new Error("Не вдалося створити пов'язану подію");
    return row;
  });
