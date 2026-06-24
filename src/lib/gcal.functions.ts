/**
 * Server functions для синхронізації кошторисів з Google Calendar
 * через Lovable connector-gateway. Жодних викликів напряму до Google API.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GW = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

const MODULE_LABEL: Record<string, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж",
};

function fmtDateLocal(d: Date) {
  // RFC3339 з зоною Київ (+02 / +03) — Google прийме як ISO; spec API дозволяє dateTime+timeZone
  return d.toISOString();
}

async function gcalFetch(path: string, init: RequestInit) {
  const apiKey = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!apiKey || !ck) throw new Error("Google Calendar connector не підключено");
  const res = await fetch(`${GW}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-Connection-Api-Key": ck,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GCal ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const syncInput = z.object({
  estimateId: z.string().uuid(),
  startAt: z.string(),                // ISO
  durationDays: z.number().min(1).max(365),
  calendarId: z.string().default("primary"),
});

export const syncEstimateToCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => syncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: est, error } = await supabase
      .from("estimates").select("*").eq("id", data.estimateId).single();
    if (error || !est) throw new Error("Кошторис не знайдено");

    const start = new Date(data.startAt);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, Math.ceil(data.durationDays)));

    const moduleLabel = MODULE_LABEL[est.module] ?? est.module;
    const summary = `[${moduleLabel}] ${est.client_name ?? "Клієнт"} — ${est.address ?? "Об'єкт"}${est.area ? ` (${est.area} м²)` : ""}`;
    const description = [
      `Кошторис №${est.number}`,
      `Менеджер: ${est.manager ?? "—"}`,
      `Статус: ${est.status}`,
      `Сума клієнту: ${Number(est.total_client).toLocaleString("uk-UA")} грн`,
      `Тривалість (план): ${data.durationDays} дн.`,
    ].join("\n");

    const body = {
      summary,
      description,
      location: est.address ?? undefined,
      start: { date: start.toISOString().slice(0, 10) }, // all-day events
      end:   { date: end.toISOString().slice(0, 10) },
      extendedProperties: {
        private: { terzi_estimate_id: est.id, terzi_module: est.module },
      },
    };

    let event;
    if (est.gcal_event_id) {
      event = await gcalFetch(
        `/calendars/${encodeURIComponent(data.calendarId)}/events/${encodeURIComponent(est.gcal_event_id)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ).catch(async (e: Error) => {
        // якщо подія видалена вручну — створимо нову
        if (e.message.includes("404") || e.message.includes("410")) {
          return gcalFetch(`/calendars/${encodeURIComponent(data.calendarId)}/events`,
            { method: "POST", body: JSON.stringify(body) });
        }
        throw e;
      });
    } else {
      event = await gcalFetch(
        `/calendars/${encodeURIComponent(data.calendarId)}/events`,
        { method: "POST", body: JSON.stringify(body) },
      );
    }

    await supabase.from("estimates").update({
      schedule_start_at: fmtDateLocal(start),
      schedule_end_at: fmtDateLocal(end),
      duration_days: data.durationDays,
      gcal_event_id: event.id,
      gcal_calendar_id: data.calendarId,
      gcal_synced_at: new Date().toISOString(),
    }).eq("id", est.id);

    return { ok: true, eventId: event.id, htmlLink: event.htmlLink };
  });

export const deleteEstimateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ estimateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: est } = await supabase
      .from("estimates").select("id,gcal_event_id,gcal_calendar_id").eq("id", data.estimateId).single();
    if (!est?.gcal_event_id) return { ok: true, skipped: true };
    try {
      await gcalFetch(
        `/calendars/${encodeURIComponent(est.gcal_calendar_id ?? "primary")}/events/${encodeURIComponent(est.gcal_event_id)}`,
        { method: "DELETE" },
      );
    } catch (e) {
      // навіть якщо вже видалено — продовжуємо
      console.warn("[gcal] delete:", (e as Error).message);
    }
    await supabase.from("estimates").update({
      gcal_event_id: null, gcal_synced_at: new Date().toISOString(),
    }).eq("id", est.id);
    return { ok: true };
  });
