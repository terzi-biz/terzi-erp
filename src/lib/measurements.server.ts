/**
 * Заміри як окремий блок CRM. Канонічна сутність — order_measurements;
 * calendar_events — лише проєкція планування (посилається на measurement_id).
 * Тільки читання під RLS користувача.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalMeasurementStatus, isOpenMeasurement } from "./measurement-status";

type Sb = SupabaseClient<any, any, any>;

const CONTRACT_STATUSES = ["contract", "awaiting_prepayment", "sold"];

export interface MeasurementRow {
  id: string;
  measured_at: string | null;
  scheduled_at: string | null;
  created_at: string | null;
  type: string | null;
  /** Канонічний статус (legacy значення відображені на нові). */
  status: string;
  raw_status: string | null;
  area: number | null;
  perimeter: number | null;
  notes: string | null;
  address: string | null;
  surveyor_id: string | null;
  surveyor_name: string | null;
  lead_id: string | null;
  client_id: string | null;
  order_id: string | null;
  order_number: string | null;
  order_name: string | null;
  order_address: string | null;
  order_commercial_status: string | null;
  event_id: string | null;
  /** Замір призвів до договору/продажу. */
  converted: boolean;
}

export interface MeasurementFunnel {
  leads: number;
  measurements: number;
  contracts: number;
  leadToMeasure: number | null;
  measureToContract: number | null;
  leadToContract: number | null;
  planned: number;
  done: number;
  canceled: number;
  rescheduled: number;
  withoutSurveyor: number;
  /** Минулі заплановані заміри без зафіксованого результату. */
  overduePlanned: number;
  /** Заміри без події в календарі. */
  withoutEvent: number;
}

export interface MeasurementsPayload {
  rows: MeasurementRow[];
  planned: MeasurementRow[];
  funnel: MeasurementFunnel;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** from/to — ISO-мітки UTC, вже перераховані з київського дня. */
export async function measurementsPayload(sb: Sb, p: { from: string; to: string }): Promise<MeasurementsPayload> {
  const fromTs = p.from;
  const toTs = p.to;

  const [mRes, leadsRes, contractsRes] = await Promise.all([
    sb.from("order_measurements").select("*")
      .or(`and(scheduled_at.gte.${fromTs},scheduled_at.lte.${toTs}),and(scheduled_at.is.null,created_at.gte.${fromTs},created_at.lte.${toTs})`)
      .order("created_at", { ascending: false }).limit(1000),
    sb.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", fromTs).lte("created_at", toTs),
    sb.from("orders").select("id", { count: "exact", head: true }).in("commercial_status", CONTRACT_STATUSES)
      .gte("created_at", fromTs).lte("created_at", toTs),
  ]);

  const measurements = (mRes.data ?? []) as any[];
  if (mRes.error) console.error("measurementsPayload", mRes.error);

  const rows = await enrichMeasurements(sb, measurements);


  const leads = leadsRes.count ?? 0;
  const contracts = contractsRes.count ?? 0;
  const completed = rows.filter((r) => r.status === "completed");
  const converted = completed.filter((r) => r.converted).length;
  const nowTs = Date.now();
  const planned = rows.filter((r) => isOpenMeasurement(r.status));

  return {
    rows,
    planned,
    funnel: {
      leads,
      measurements: completed.length,
      contracts,
      leadToMeasure: pct(completed.length, leads),
      measureToContract: pct(converted, completed.length),
      leadToContract: pct(contracts, leads),
      planned: planned.length,
      done: completed.length,
      canceled: rows.filter((r) => r.status === "canceled").length,
      rescheduled: rows.filter((r) => r.status === "rescheduled").length,
      withoutSurveyor: planned.filter((r) => !r.surveyor_id).length,
      overduePlanned: planned.filter((r) => r.scheduled_at && new Date(r.scheduled_at).getTime() < nowTs).length,
      withoutEvent: rows.filter((r) => !r.event_id).length,
    },
  };
}

/**
 * Зворотний звʼязок календар → замір.
 * calendar_events — проєкція, тому будь-яка зміна події з measurement_id
 * переноситься в канонічний запис order_measurements (дата, замірник, статус).
 */
const MEASUREMENT_STATUS_BY_EVENT: Record<string, string> = {
  planned: "planned",
  confirmed: "confirmed",
  in_progress: "in_progress",
  done: "completed",
  cancelled: "canceled",
};

export function measurementPatchFromEvent(p: {
  starts_at?: string | null;
  employee_id?: string | null;
  status?: string | null;
  address?: string | null;
  current_status?: string | null;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (p.starts_at) patch['scheduled_at'] = p.starts_at;
  if (p.employee_id !== undefined) patch['surveyor_id'] = p.employee_id;
  if (p.address !== undefined && p.address !== null) patch['address'] = p.address;
  if (p.status) {
    const mapped = MEASUREMENT_STATUS_BY_EVENT[p.status];
    if (mapped) {
      // Не відкочуємо вже завершений замір назад у planned через зміну події.
      const current = p.current_status ? canonicalMeasurementStatus(p.current_status) : null;
      if (!(current === "completed" && mapped !== "canceled")) {
        patch['status'] = mapped;
        const now = new Date().toISOString();
        if (mapped === "confirmed") patch['confirmed_at'] = now;
        if (mapped === "completed") { patch['completed_at'] = now; patch['measured_at'] = now; }
      }
    }
  }
  // Призначення замірника переводить planned → assigned.
  if (patch['surveyor_id'] && patch['status'] === "planned") patch['status'] = "assigned";
  return patch;
}

export async function syncMeasurementFromEvent(
  sb: Sb,
  measurementId: string,
  p: { starts_at?: string | null; employee_id?: string | null; status?: string | null; address?: string | null },
) {
  const { data: current } = await sb
    .from("order_measurements").select("status").eq("id", measurementId).maybeSingle();
  const patch = measurementPatchFromEvent({ ...p, current_status: (current as any)?.status ?? null });
  if (!Object.keys(patch).length) return;
  const { error } = await sb.from("order_measurements").update(patch as any).eq("id", measurementId);
  if (error) console.error("syncMeasurementFromEvent", error);
}

/** Збагачення сирих order_measurements даними замовлення, замірника й події календаря. */
export async function enrichMeasurements(sb: Sb, measurements: any[]): Promise<MeasurementRow[]> {
  const ids = measurements.map((m) => m.id);
  const orderIds = Array.from(new Set(measurements.map((m) => m.order_id).filter(Boolean))) as string[];
  const userIds = Array.from(new Set(measurements.map((m) => m.surveyor_id).filter(Boolean))) as string[];
  const orderById = new Map<string, any>();
  const nameByUser = new Map<string, string>();
  const eventByMeasurement = new Map<string, string>();

  await Promise.all([
    orderIds.length
      ? sb.from("orders").select("id, number, name, address, commercial_status").in("id", orderIds)
          .then(({ data }) => { for (const o of data ?? []) orderById.set(o.id, o); })
      : Promise.resolve(),
    userIds.length
      ? sb.from("profiles").select("user_id, display_name, email").in("user_id", userIds)
          .then(({ data }) => {
            for (const r of data ?? []) {
              const n = (r as any).display_name || (r as any).email;
              if (n) nameByUser.set((r as any).user_id, n);
            }
          })
      : Promise.resolve(),
    ids.length
      ? sb.from("calendar_events").select("id, measurement_id").in("measurement_id", ids)
          .then(({ data }) => { for (const e of data ?? []) if ((e as any).measurement_id) eventByMeasurement.set((e as any).measurement_id, (e as any).id); })
      : Promise.resolve(),
  ]);

  return measurements.map((m) => {
    const o = m.order_id ? orderById.get(m.order_id) : null;
    return {
      id: m.id,
      measured_at: m.measured_at ?? null,
      scheduled_at: m.scheduled_at ?? null,
      created_at: m.created_at ?? null,
      type: m.type ?? null,
      status: canonicalMeasurementStatus(m.status),
      raw_status: m.status ?? null,
      area: m.area == null ? null : Number(m.area),
      perimeter: m.perimeter == null ? null : Number(m.perimeter),
      notes: m.notes ?? null,
      address: m.address ?? null,
      surveyor_id: m.surveyor_id ?? null,
      surveyor_name: m.surveyor_id ? nameByUser.get(m.surveyor_id) ?? null : null,
      lead_id: m.lead_id ?? null,
      client_id: m.client_id ?? null,
      order_id: m.order_id ?? null,
      order_number: o?.number ?? null,
      order_name: o?.name ?? null,
      order_address: o?.address ?? null,
      order_commercial_status: o?.commercial_status ?? null,
      event_id: eventByMeasurement.get(m.id) ?? null,
      converted: Boolean(o && CONTRACT_STATUSES.includes(o.commercial_status)),
    };
  });
}

/** Усі заміри ліда: прямо за lead_id, а також за клієнтом і замовленням ліда. */
export async function leadMeasurements(sb: Sb, leadId: string): Promise<MeasurementRow[]> {
  const { data: lead } = await sb.from("crm_leads").select("id, client_id, order_id").eq("id", leadId).maybeSingle();
  const ors = [`lead_id.eq.${leadId}`];
  if ((lead as any)?.client_id) ors.push(`client_id.eq.${(lead as any).client_id}`);
  if ((lead as any)?.order_id) ors.push(`order_id.eq.${(lead as any).order_id}`);
  const { data, error } = await sb.from("order_measurements").select("*")
    .or(ors.join(",")).order("scheduled_at", { ascending: false, nullsFirst: false }).limit(100);
  if (error) { console.error("leadMeasurements", error); throw new Error("Не вдалося завантажити заміри ліда"); }
  return enrichMeasurements(sb, data ?? []);
}
