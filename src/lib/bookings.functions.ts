import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeInput = z.object({
  fromISO: z.string(),
  toISO: z.string(),
});

export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const from = new Date(data.fromISO).toISOString().slice(0, 10);
    const toDate = new Date(data.toISO).toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("crew_bookings")
      .select("*")
      .gte("date", from)
      .lte("date", toDate)
      .order("date");
    if (error) throw error;
    return rows ?? [];
  });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  brigade_key: z.string().min(1),
  date: z.string(), // YYYY-MM-DD
  title: z.string().min(1).max(200),
  client: z.string().max(200).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  order_id: z.string().uuid().optional().nullable(),
});

export const upsertBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    // Довідник бригад у БД (brigades) — єдине джерело; неактивні не призначаються.
    const sb = context.supabase as any;
    const { data: brigade } = await sb.from("brigades").select("key,label,module,active").eq("key", data.brigade_key).maybeSingle();
    if (!brigade || !brigade.active) throw new Error("Невідома або неактивна бригада");
    if (data.order_id) {
      const { data: assigned } = await sb.from("order_brigades").select("brigade_key").eq("order_id", data.order_id);
      const keys = ((assigned ?? []) as any[]).map((r) => r.brigade_key);
      if (keys.length && !keys.includes(brigade.key)) throw new Error("Бригаду не призначено на цей об'єкт");
    }

    const payload = {
      brigade_key: brigade.key,
      brigade_label: brigade.label,
      module: brigade.module,
      date: data.date,
      title: data.title,
      client: data.client ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      ...(data.order_id !== undefined ? { order_id: data.order_id } : {}),
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("crew_bookings")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("crew_bookings")
      .insert({ ...payload, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crew_bookings").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
