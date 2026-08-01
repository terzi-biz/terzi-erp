/** Дашборд дзвінків Binotel (лише сервер): фільтри, SLA-статуси, лічильники. */
import { admin, loadActor, requirePermission } from "../../access.server";

async function canView(userId: string) {
  const actor = await loadActor(userId);
  if (actor.canManage) return actor;
  return requirePermission(userId, "integrations", "view");
}

export type CallsFilter = {
  from?: string | null;
  to?: string | null;
  generalCallId?: string | null;
  disposition?: string | null;
  direction?: string | null;
  sla?: "all" | "no_task" | "in_sla" | "overdue" | "done";
  limit?: number;
};

export type SlaStatus = "not_applicable" | "no_task" | "in_sla" | "overdue" | "done";

/** SLA рахуємо лише для пропущених вхідних: є задача → у строк / прострочена / закрита. */
function slaFor(call: any, task: any | null): SlaStatus {
  if (!call.is_missed || call.direction !== "inbound") return "not_applicable";
  if (!task) return "no_task";
  if (task.status === "done") return "done";
  if (task.status === "cancelled") return "done";
  if (task.due_at && new Date(task.due_at).getTime() < Date.now()) return "overdue";
  return "in_sla";
}

export async function binotelCallsDashboardOp(userId: string, f: CallsFilter = {}) {
  await canView(userId);
  const db = await admin();
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);

  let q = db
    .from("crm_calls")
    .select(
      "id,external_id,direction,status,disposition_raw,is_missed,started_at,answered_at,duration_sec,wait_seconds,from_number,to_number,phone_norm,pbx_number,pbx_number_name,internal_number,recording_url,contact_id,lead_id,client_id,employee_id",
    )
    .eq("provider", "binotel")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (f.from) q = q.gte("started_at", new Date(f.from).toISOString());
  if (f.to) q = q.lte("started_at", new Date(f.to).toISOString());
  if (f.generalCallId) q = q.ilike("external_id", `%${f.generalCallId.replace(/[%_]/g, "")}%`);
  if (f.disposition && f.disposition !== "all") q = q.eq("status", f.disposition);
  if (f.direction && f.direction !== "all") q = q.eq("direction", f.direction as "inbound" | "outbound");

  const { data: calls, error } = await q;
  if (error) throw new Error(`Не вдалося завантажити дзвінки: ${error.message}`);
  const rows = (calls ?? []) as any[];

  const keys = rows.filter((r) => r.external_id).map((r) => `binotel:missed:${r.external_id}`);
  const tasksByKey = new Map<string, any>();
  if (keys.length) {
    const { data: tasks } = await db.from("crm_tasks").select("id,external_key,status,due_at,assigned_to,completed_at").in("external_key", keys);
    for (const t of (tasks ?? []) as any[]) tasksByKey.set(t.external_key, t);
  }

  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  const contacts = new Map<string, string>();
  if (contactIds.length) {
    const { data } = await db.from("crm_contacts").select("id,full_name").in("id", contactIds);
    for (const c of (data ?? []) as any[]) contacts.set(c.id, c.full_name);
  }

  const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))];
  const employees = new Map<string, string>();
  if (employeeIds.length) {
    const { data } = await db.from("profiles").select("user_id,display_name,email").in("user_id", employeeIds);
    for (const p of (data ?? []) as any[]) employees.set(p.user_id, p.display_name ?? p.email ?? "");
  }

  let items = rows.map((r) => {
    const task = r.external_id ? (tasksByKey.get(`binotel:missed:${r.external_id}`) ?? null) : null;
    return {
      ...r,
      contact_name: r.contact_id ? (contacts.get(r.contact_id) ?? null) : null,
      employee_name: r.employee_id ? (employees.get(r.employee_id) ?? null) : null,
      task_id: task?.id ?? null,
      task_due_at: task?.due_at ?? null,
      sla_status: slaFor(r, task),
    };
  });

  if (f.sla && f.sla !== "all") items = items.filter((i) => i.sla_status === f.sla);

  const stats = {
    total: items.length,
    inbound: items.filter((i) => i.direction === "inbound").length,
    outbound: items.filter((i) => i.direction === "outbound").length,
    missed: items.filter((i) => i.is_missed).length,
    answered: items.filter((i) => !i.is_missed).length,
    overdue: items.filter((i) => i.sla_status === "overdue").length,
    noTask: items.filter((i) => i.sla_status === "no_task").length,
    avgDuration: items.length ? Math.round(items.reduce((s, i) => s + (i.duration_sec ?? 0), 0) / items.length) : 0,
    avgWait: items.length ? Math.round(items.reduce((s, i) => s + (i.wait_seconds ?? 0), 0) / items.length) : 0,
  };

  return { items, stats };
}

/** Повна картка дзвінка: запис розмови, диспозиція, звʼязані сутності та історія подій. */
export async function binotelCallDetailOp(userId: string, generalCallId: string) {
  await canView(userId);
  const db = await admin();

  const { data: call, error } = await db
    .from("crm_calls")
    .select("*")
    .eq("provider", "binotel")
    .eq("external_id", generalCallId)
    .maybeSingle();
  if (error) throw new Error(`Не вдалося завантажити дзвінок: ${error.message}`);
  if (!call) throw new Error("Дзвінок не знайдено");
  const row = call as any;

  const [contactRes, leadRes, taskRes, employeeRes] = await Promise.all([
    row.contact_id ? db.from("crm_contacts").select("id,full_name,phone").eq("id", row.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    row.lead_id ? db.from("crm_leads").select("id,title,status_id,pipeline_id").eq("id", row.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("crm_tasks").select("id,title,status,due_at,completed_at,assigned_to").eq("external_key", `binotel:missed:${generalCallId}`).maybeSingle(),
    row.employee_id ? db.from("profiles").select("user_id,display_name,email").eq("user_id", row.employee_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Історія подій інтеграції за цим generalCallID + журнал спроб по кожній події.
  const { data: events } = await db
    .from("integration_events")
    .select("id,event_type,direction,status,attempts,created_at,updated_at,idempotency_key,last_error")
    .eq("provider_key", "binotel")
    .eq("entity_id", generalCallId)
    .order("created_at", { ascending: true });

  const eventIds = ((events ?? []) as any[]).map((e) => e.id);
  let logs: any[] = [];
  if (eventIds.length) {
    const { data } = await db
      .from("integration_event_logs")
      .select("id,event_id,level,message,http_status,duration_ms,created_at")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });
    logs = (data ?? []) as any[];
  }

  const timeline = [
    ...((events ?? []) as any[]).map((e) => ({
      kind: "event" as const,
      at: e.created_at,
      title: e.event_type,
      detail: `статус: ${e.status}${e.attempts ? ` · спроб: ${e.attempts}` : ""}${e.last_error ? ` · ${e.last_error}` : ""}`,
      level: e.status === "failed" ? "error" : "info",
    })),
    ...logs.map((l) => ({
      kind: "log" as const,
      at: l.created_at,
      title: l.message ?? "Запис журналу",
      detail: [l.http_status ? `HTTP ${l.http_status}` : null, l.duration_ms != null ? `${l.duration_ms} мс` : null].filter(Boolean).join(" · "),
      level: l.level ?? "info",
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    call: {
      ...row,
      contact_name: (contactRes as any)?.data?.full_name ?? null,
      employee_name: (employeeRes as any)?.data?.display_name ?? (employeeRes as any)?.data?.email ?? null,
    },
    contact: (contactRes as any)?.data ?? null,
    lead: (leadRes as any)?.data ?? null,
    task: (taskRes as any)?.data ?? null,
    sla_status: slaFor(row, (taskRes as any)?.data ?? null),
    timeline,
  };
}
