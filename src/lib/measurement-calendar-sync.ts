/**
 * Bidirectional sync: calendar_events (category=measure) ↔ order_measurements.
 * Funnel → calendar already lives in scheduleMeasurement; this closes calendar → measurement.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { measurementTypeFromEvent } from "./measurement-status";

type Sb = SupabaseClient<any, any, any>;

/** Measurement status → calendar event status (used by setMeasurementStatus). */
export const EVENT_STATUS_BY_MEASUREMENT: Record<string, string> = {
  planned: "planned",
  assigned: "planned",
  confirmed: "confirmed",
  in_progress: "in_progress",
  completed: "done",
  canceled: "cancelled",
  rescheduled: "cancelled",
};

/** Calendar event status → measurement status (calendar → measurement). */
export const MEASUREMENT_STATUS_BY_EVENT: Record<string, string> = {
  planned: "planned",
  confirmed: "confirmed",
  in_progress: "in_progress",
  done: "completed",
  cancelled: "canceled",
  canceled: "canceled",
};

export function isMeasureCalendarEvent(
  category?: string | null,
  eventType?: string | null,
): boolean {
  if (category === "measure") return true;
  return Boolean(eventType && String(eventType).startsWith("measure_"));
}

function leadIdFromEvent(event: {
  metadata?: unknown;
  lead_id?: string | null;
}): string | null {
  if (event.lead_id) return event.lead_id;
  const meta = event.metadata;
  if (meta && typeof meta === "object" && (meta as any).lead_id) {
    const id = String((meta as any).lead_id);
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  }
  return null;
}

/** Drop undefined keys so supabase update does not null optional FKs. */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * After calendar create/update of a measure event without measurement_id:
 * insert order_measurements and set event.measurement_id.
 * When measurement_id already set: sync scheduled_at / surveyor / status.
 */
export async function syncMeasurementForCalendarEvent(
  sb: Sb,
  userId: string,
  event: Record<string, any>,
): Promise<Record<string, any>> {
  if (!event?.id || !isMeasureCalendarEvent(event.category, event.event_type)) {
    return event;
  }

  if (event.measurement_id) {
    await patchLinkedMeasurement(sb, event);
    return event;
  }

  const leadId = leadIdFromEvent(event);
  let clientId = (event.client_id as string | null) ?? null;
  if (!clientId && event.order_id) {
    const { data: ord } = await sb.from("orders").select("client_id").eq("id", event.order_id).maybeSingle();
    clientId = (ord?.client_id as string | null) ?? null;
  }
  if (!clientId && leadId) {
    const { data: lead } = await sb.from("crm_leads").select("client_id").eq("id", leadId).maybeSingle();
    clientId = (lead?.client_id as string | null) ?? null;
  }

  const surveyorId = (event.employee_id as string | null) ?? null;
  const status =
    MEASUREMENT_STATUS_BY_EVENT[String(event.status ?? "planned")] ??
    (surveyorId ? "assigned" : "planned");
  // Prefer assigned when surveyor present and calendar still "planned"
  const finalStatus =
    surveyorId && (status === "planned" || !event.status) ? "assigned" : status;

  const { data: measurement, error: me } = await sb
    .from("order_measurements")
    .insert({
      order_id: event.order_id ?? null,
      lead_id: leadId,
      client_id: clientId,
      surveyor_id: surveyorId,
      scheduled_at: event.starts_at ?? null,
      address: event.address ?? null,
      area: event.area ?? null,
      notes: event.description ?? null,
      type: measurementTypeFromEvent(event.event_type),
      status: finalStatus === "planned" && surveyorId ? "assigned" : finalStatus,
      created_by: userId,
    } as any)
    .select()
    .single();

  if (me || !measurement) {
    console.error("ensureMeasurementForEvent", me);
    return event;
  }

  const meta =
    event.metadata && typeof event.metadata === "object" ? { ...(event.metadata as object) } : {};
  if (leadId) (meta as any).lead_id = leadId;

  const { data: linked, error: ue } = await sb
    .from("calendar_events")
    .update({
      measurement_id: measurement.id,
      metadata: meta,
      ...(clientId && !event.client_id ? { client_id: clientId } : {}),
    } as any)
    .eq("id", event.id)
    .select()
    .maybeSingle();

  if (ue) console.error("ensureMeasurementForEvent link", ue);

  if (leadId) {
    await sb.from("crm_lead_activities").insert({
      lead_id: leadId,
      actor_id: userId,
      kind: "measurement",
      body: `Замір заплановано з календаря: ${event.title ?? ""}`.trim(),
    });
  }

  return linked ?? { ...event, measurement_id: measurement.id, metadata: meta };
}

/** Sync linked order_measurements from a calendar event (move / status / upsert). */
export async function patchLinkedMeasurement(
  sb: Sb,
  event: {
    measurement_id?: string | null;
    starts_at?: string | null;
    employee_id?: string | null;
    status?: string | null;
    address?: string | null;
    area?: number | null;
    description?: string | null;
  },
): Promise<void> {
  if (!event.measurement_id) return;

  const patch: Record<string, unknown> = {};
  if (event.starts_at) patch["scheduled_at"] = event.starts_at;
  if (event.employee_id !== undefined) {
    patch["surveyor_id"] = event.employee_id;
    // Promote planned → assigned when surveyor appears
    if (event.employee_id && (!event.status || event.status === "planned")) {
      patch["status"] = "assigned";
    }
  }
  if (event.status != null) {
    const mapped = MEASUREMENT_STATUS_BY_EVENT[String(event.status)];
    if (mapped) {
      patch["status"] = mapped;
      if (mapped === "completed") {
        const now = new Date().toISOString();
        patch["completed_at"] = now;
        patch["measured_at"] = now;
      }
      if (mapped === "confirmed") patch["confirmed_at"] = new Date().toISOString();
    }
  }
  if (event.address !== undefined) patch["address"] = event.address;
  if (event.area !== undefined) patch["area"] = event.area;
  if (event.description !== undefined) patch["notes"] = event.description;

  if (!Object.keys(patch).length) return;

  const { error } = await sb
    .from("order_measurements")
    .update(patch as any)
    .eq("id", event.measurement_id);
  if (error) console.error("patchLinkedMeasurement", error);
}
