import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calendarEventPayload, eventFilterSchema, rangeSchema } from "./calendar.server";

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
    if (data.objectId) q = q.eq("object_id", data.objectId);
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
    if (id) {
      const { data: row, error } = await context.supabase
        .from("calendar_events").update(rest).eq("id", id).select().maybeSingle();
      if (error) throw new Error("Не вдалося зберегти подію");
      if (!row) throw new Error("Подію не знайдено або немає прав на редагування");
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert({ ...rest, created_by: context.userId })
      .select().single();
    if (error) throw new Error("Не вдалося створити подію");
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
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("calendar_events").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error("Не вдалося перенести подію");
    if (!row) throw new Error("Немає прав на перенесення цієї події");
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
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id,display_name,email,avatar_url,department,position,is_active")
      .order("display_name");
    if (error) throw new Error("Не вдалося завантажити співробітників");
    return data ?? [];
  });

export const listCalendarObjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("objects")
      .select("id,number,name,address,client_id")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error("Не вдалося завантажити об'єкти");
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
