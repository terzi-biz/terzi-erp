/**
 * Заміри як окремий блок CRM: факт замірів, планові події календаря і воронка
 * лід → замір → договір. Тільки читання під RLS користувача.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;

const CONTRACT_STATUSES = ["contract", "awaiting_prepayment", "sold"];

export interface MeasurementRow {
  id: string;
  measured_at: string | null;
  created_at: string | null;
  type: string | null;
  status: string | null;
  area: number | null;
  perimeter: number | null;
  notes: string | null;
  surveyor_id: string | null;
  surveyor_name: string | null;
  order_id: string | null;
  order_number: string | null;
  order_name: string | null;
  order_address: string | null;
  order_commercial_status: string | null;
  /** Замір призвів до договору/продажу. */
  converted: boolean;
}

export interface PlannedMeasurement {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: string | null;
  event_type: string | null;
  address: string | null;
  client_name: string | null;
  area: number | null;
  employee_id: string | null;
  employee_name: string | null;
  order_id: string | null;
}

export interface MeasurementFunnel {
  leads: number;
  measurements: number;
  contracts: number;
  /** null — коли база періоду порожня і відсоток порахувати неможливо. */
  leadToMeasure: number | null;
  measureToContract: number | null;
  leadToContract: number | null;
  planned: number;
  done: number;
  withoutSurveyor: number;
}

export interface MeasurementsPayload {
  rows: MeasurementRow[];
  planned: PlannedMeasurement[];
  funnel: MeasurementFunnel;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function measurementsPayload(sb: Sb, p: { from: string; to: string }): Promise<MeasurementsPayload> {
  const fromTs = `${p.from}T00:00:00.000Z`;
  const toTs = `${p.to}T23:59:59.999Z`;

  const [mRes, leadsRes, contractsRes, eventsRes] = await Promise.all([
    sb.from("order_measurements").select("*").gte("created_at", fromTs).lte("created_at", toTs)
      .order("created_at", { ascending: false }).limit(1000),
    sb.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", fromTs).lte("created_at", toTs),
    sb.from("orders").select("id", { count: "exact", head: true }).in("commercial_status", CONTRACT_STATUSES)
      .gte("created_at", fromTs).lte("created_at", toTs),
    sb.from("calendar_events").select("*").eq("category", "measure")
      .gte("starts_at", fromTs).lte("starts_at", toTs).order("starts_at").limit(500),
  ]);

  const measurements = (mRes.data ?? []) as any[];
  const events = (eventsRes.data ?? []) as any[];

  const orderIds = Array.from(new Set(measurements.map((m) => m.order_id).filter(Boolean))) as string[];
  const userIds = Array.from(new Set([
    ...measurements.map((m) => m.surveyor_id),
    ...events.map((e) => e.employee_id),
  ].filter(Boolean))) as string[];

  const orderById = new Map<string, any>();
  const nameByUser = new Map<string, string>();

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
  ]);

  const rows: MeasurementRow[] = measurements.map((m) => {
    const o = m.order_id ? orderById.get(m.order_id) : null;
    return {
      id: m.id,
      measured_at: m.measured_at ?? null,
      created_at: m.created_at ?? null,
      type: m.type ?? null,
      status: m.status ?? null,
      area: m.area == null ? null : Number(m.area),
      perimeter: m.perimeter == null ? null : Number(m.perimeter),
      notes: m.notes ?? null,
      surveyor_id: m.surveyor_id ?? null,
      surveyor_name: m.surveyor_id ? nameByUser.get(m.surveyor_id) ?? null : null,
      order_id: m.order_id ?? null,
      order_number: o?.number ?? null,
      order_name: o?.name ?? null,
      order_address: o?.address ?? null,
      order_commercial_status: o?.commercial_status ?? null,
      converted: Boolean(o && CONTRACT_STATUSES.includes(o.commercial_status)),
    };
  });

  const planned: PlannedMeasurement[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at ?? null,
    status: e.status ?? null,
    event_type: e.event_type ?? null,
    address: e.address ?? null,
    client_name: e.client_name ?? null,
    area: e.area == null ? null : Number(e.area),
    employee_id: e.employee_id ?? null,
    employee_name: e.employee_id ? nameByUser.get(e.employee_id) ?? null : null,
    order_id: e.order_id ?? null,
  }));

  const leads = leadsRes.count ?? 0;
  const contracts = contractsRes.count ?? 0;
  const converted = rows.filter((r) => r.converted).length;

  return {
    rows,
    planned,
    funnel: {
      leads,
      measurements: rows.length,
      contracts,
      leadToMeasure: pct(rows.length, leads),
      measureToContract: pct(converted, rows.length),
      leadToContract: pct(contracts, leads),
      planned: planned.filter((e) => e.status !== "done" && e.status !== "cancelled").length,
      done: rows.filter((r) => r.status === "done").length,
      withoutSurveyor: rows.filter((r) => !r.surveyor_id).length,
    },
  };
}
