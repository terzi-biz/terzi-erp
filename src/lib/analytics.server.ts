import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;
export interface DashboardFilters {
  from: string; to: string; pipelineId?: string | null; source?: string | null;
  managerId?: string | null; direction?: string | null; orderId?: string | null; status?: string | null;
}
export interface DrilldownParams extends DashboardFilters { metric: string; limit?: number }
export interface DrilldownRow { id: string; title: string; subtitle: string | null; date: string | null; amount: number | null; href: string | null }

const CONTRACT = ["contract", "awaiting_prepayment", "sold"];
const n = (v: unknown) => Number(v ?? 0) || 0;
const inRange = (value: string | null | undefined, from: string, to: string) => !!value && value.slice(0, 10) >= from && value.slice(0, 10) <= to;
const normalizedSource = (v: unknown) => String(v ?? "").trim() || "Не визначено";

async function all(sb: Sb, table: string, select = "*") {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await sb.from(table).select(select).range(from, from + 999);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return rows;
  }
}

async function optionalAll(sb: Sb, table: string, select = "*") {
  try { return await all(sb, table, select); } catch { return []; }
}

async function loadDashboardData(sb: Sb) {
  const [leads, pipelines, stages, activities, measurements, estimates, orders, calls, tasks, events, bookings, metrics, manualSpend, targets, profiles, integrations] = await Promise.all([
    all(sb, "crm_leads"), all(sb, "crm_pipelines"), all(sb, "crm_stages"), all(sb, "crm_lead_activities", "lead_id,kind,from_stage_id,to_stage_id,created_at"),
    all(sb, "order_measurements"), all(sb, "estimates"), all(sb, "orders"), all(sb, "crm_calls"), all(sb, "crm_tasks"),
    all(sb, "calendar_events"), all(sb, "crew_bookings"), all(sb, "marketing_daily_metrics"), all(sb, "marketing_manual_spend"),
    all(sb, "analytics_targets"), all(sb, "profiles", "user_id,display_name,is_active"),
    optionalAll(sb, "integrations", "provider_key,name,status,last_success_at,last_error_at,last_error,enabled"),
  ]);
  return { leads, pipelines, stages, activities, measurements, estimates, orders, calls, tasks, events, bookings, metrics, manualSpend, targets, profiles, integrations };
}

export async function dashboardOverview(sb: Sb, f: DashboardFilters) {
  return dashboardOverviewFromData(await loadDashboardData(sb), f);
}

export async function dashboardOverviewPair(sb: Sb, current: DashboardFilters, previous: DashboardFilters) {
  const data = await loadDashboardData(sb);
  return [dashboardOverviewFromData(data, current), dashboardOverviewFromData(data, previous)] as const;
}

function dashboardOverviewFromData(d: Awaited<ReturnType<typeof loadDashboardData>>, f: DashboardFilters) {
  const stageById = new Map(d.stages.map((s) => [s.id, s]));
  const initialByPipeline = new Map<string, any>();
  for (const stage of d.stages.filter((s) => s.is_active !== false).sort((a, b) => n(a.sort_order) - n(b.sort_order))) {
    if (!initialByPipeline.has(stage.pipeline_id)) initialByPipeline.set(stage.pipeline_id, stage);
  }
  const progressed = new Set<string>();
  for (const a of d.activities) {
    const from = stageById.get(a.from_stage_id); const to = stageById.get(a.to_stage_id);
    const initial = from ? initialByPipeline.get(from.pipeline_id) : null;
    if (from && to && initial?.id === from.id && n(to.sort_order) > n(from.sort_order)) progressed.add(a.lead_id);
  }
  const qualified = (l: any) => {
    return progressed.has(l.id);
  };
  const needsReview = (l: any) => {
    const stage = stageById.get(l.stage_id); const initial = stage ? initialByPipeline.get(stage.pipeline_id) : null;
    return !!stage && !!initial && stage.id !== initial.id && !progressed.has(l.id);
  };
  const filterLead = (l: any) => {
    if (!inRange(l.created_at, f.from, f.to)) return false;
    if (f.pipelineId && l.pipeline_id !== f.pipelineId) return false;
    if (f.source && normalizedSource(l.source) !== f.source) return false;
    if (f.managerId && l.assigned_to !== f.managerId) return false;
    if (f.direction && l.direction !== f.direction) return false;
    if (f.orderId && l.order_id !== f.orderId) return false;
    if (f.status && l.status !== f.status) return false;
    return true;
  };
  const leads = d.leads.filter(filterLead);
  const leadIds = new Set(leads.map((l) => l.id));
  const orderIds = new Set(leads.map((l) => l.order_id).filter(Boolean));
  const measurements = d.measurements.filter((m) => leadIds.has(m.lead_id) || (!!m.order_id && orderIds.has(m.order_id)));
  const completedMeasurements = measurements.filter((m) => m.status === "completed" || !!m.completed_at);
  const estimates = d.estimates.filter((e) => !!e.order_id && orderIds.has(e.order_id));
  const orders = d.orders.filter((o) => orderIds.has(o.id));
  const contracts = orders.filter((o) => CONTRACT.includes(o.commercial_status));
  const calls = d.calls.filter((c) => inRange(c.started_at, f.from, f.to) && (!f.managerId || c.employee_id === f.managerId) && (!f.orderId || c.order_id === f.orderId));
  const periodTasks = d.tasks.filter((t) => inRange(t.due_at ?? t.created_at, f.from, f.to) && (!f.managerId || t.assigned_to === f.managerId) && (!f.orderId || t.order_id === f.orderId));
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = d.tasks.filter((t) => t.status === "open" && !!t.due_at && t.due_at.slice(0, 10) < today && (!f.managerId || t.assigned_to === f.managerId));
  const events = d.events.filter((e) => inRange(e.starts_at, f.from, f.to) && (!f.managerId || e.manager_id === f.managerId || e.employee_id === f.managerId) && (!f.direction || e.direction === f.direction) && (!f.orderId || e.order_id === f.orderId));
  const bookings = d.bookings.filter((b) => b.date >= f.from && b.date <= f.to && (!f.direction || b.module === f.direction) && (!f.orderId || b.order_id === f.orderId));
  const spend = d.metrics.filter((x) => x.date >= f.from && x.date <= f.to).reduce((s, x) => s + n(x.spend), 0)
    + d.manualSpend.filter((x) => x.spend_date >= f.from && x.spend_date <= f.to && (!f.source || normalizedSource(x.source) === f.source)).reduce((s, x) => s + n(x.amount), 0);
  const targetMonth = f.from.slice(0, 7) + "-01";
  const targets = Object.fromEntries(d.targets.filter((x) => x.month === targetMonth).map((x) => [x.metric, n(x.target)]));
  const profileName = new Map(d.profiles.map((p) => [p.user_id, p.display_name || "Без імені"]));
  const by = <T,>(rows: T[], key: (row: T) => string) => {
    const out = new Map<string, T[]>(); for (const row of rows) { const k = key(row); out.set(k, [...(out.get(k) ?? []), row]); } return out;
  };
  const bySource = by(leads, (l) => normalizedSource(l.source));
  const sources = [...bySource.entries()].map(([source, rows]) => ({ source, spend: source === f.source || !f.source ? d.manualSpend.filter((x) => inRange(x.spend_date, f.from, f.to) && normalizedSource(x.source) === source).reduce((s, x) => s + n(x.amount), 0) : 0, leads: rows.length, qualified: rows.filter(qualified).length, contracts: rows.filter((l) => contracts.some((o) => o.id === l.order_id)).length }));
  const byManager = by(leads, (l) => l.assigned_to ?? "");
  const managers = [...byManager.entries()].map(([user_id, rows]) => ({ user_id: user_id || null, name: user_id ? profileName.get(user_id) ?? "Невідомий менеджер" : "Без менеджера", leads: rows.length, qualified: rows.filter(qualified).length, orders: rows.filter((l) => !!l.order_id).length, contracts: rows.filter((l) => contracts.some((o) => o.id === l.order_id)).length, contract_value: rows.reduce((s, l) => s + n(contracts.find((o) => o.id === l.order_id)?.amount_total), 0) }));
  const missed = calls.filter((c) => c.is_missed);
  const wasCalledBack = (missedCall: any) => calls.some((c) => c.direction === "outbound"
    && (c.phone_e164 || c.phone_norm) === (missedCall.phone_e164 || missedCall.phone_norm)
    && c.started_at > missedCall.started_at);
  const funnel = [
    { key: "leads", label: "Заявки", count: leads.length },
    { key: "qualified", label: "Кваліфіковані", count: leads.filter(qualified).length },
    { key: "measurements_scheduled", label: "Заміри призначено", count: new Set(measurements.map((m) => m.lead_id).filter((id) => leadIds.has(id))).size },
    { key: "measurements_completed", label: "Заміри виконано", count: new Set(completedMeasurements.map((m) => m.lead_id).filter((id) => leadIds.has(id))).size },
    { key: "estimates", label: "Кошториси", count: new Set(leads.filter((l) => estimates.some((e) => e.order_id === l.order_id)).map((l) => l.id)).size },
    { key: "contracts", label: "Продано / договір", count: new Set(leads.filter((l) => contracts.some((o) => o.id === l.order_id)).map((l) => l.id)).size },
  ].map((x, i, a) => ({ ...x, conversion: i ? (a[i - 1].count ? x.count / a[i - 1].count * 100 : null) : 100, overall: leads.length ? x.count / leads.length * 100 : null }));
  const dataQuality = {
    leads_no_source: leads.filter((l) => !l.source).length, leads_no_manager: leads.filter((l) => !l.assigned_to).length,
    qualification_needs_review: leads.filter(needsReview).length,
    calls_unlinked: calls.filter((c) => !c.lead_id && !c.client_id && !c.order_id).length,
    measurements_no_surveyor: measurements.filter((m) => !m.surveyor_id).length,
    estimates_no_order: d.estimates.filter((e) => inRange(e.created_at, f.from, f.to) && !e.order_id).length,
    orders_no_source: orders.filter((o) => !o.source).length, orders_no_amount: orders.filter((o) => !n(o.amount_total)).length,
  };
  const alerts = [
    overdueTasks.length ? { severity: "critical", title: "Прострочені задачі", value: overdueTasks.length, metric: "tasks_overdue", action: "Розподілити відповідальних" } : null,
    missed.filter((c) => !wasCalledBack(c)).length ? { severity: "warning", title: "Пропущені без передзвону", value: missed.filter((c) => !wasCalledBack(c)).length, metric: "calls_missed", action: "Перевірити дзвінки" } : null,
    dataQuality.leads_no_manager ? { severity: "warning", title: "Ліди без менеджера", value: dataQuality.leads_no_manager, metric: "dq_leads_no_manager", action: "Призначити" } : null,
    dataQuality.qualification_needs_review ? { severity: "warning", title: "Кваліфікація потребує перевірки", value: dataQuality.qualification_needs_review, metric: "qualified", action: "Перевірити історію" } : null,
  ].filter(Boolean);
  const insights = [
    funnel[1].conversion != null ? { severity: funnel[1].conversion < 40 ? "warning" : "success", title: `${funnel[1].conversion.toFixed(0)}% заявок пройшли первинний етап`, detail: `${funnel[1].count} із ${funnel[0].count} лідів мають підтверджений рух у воронці.`, metric: "qualified" } : null,
    missed.length ? { severity: "warning", title: `${missed.length} пропущених дзвінків`, detail: `${missed.filter(wasCalledBack).length} викликів мають пізніший вихідний дзвінок у вибраному періоді.`, metric: "calls_missed" } : null,
    contracts.length ? { severity: "success", title: `${contracts.length} продажів із когорти`, detail: `Конверсія від заявки — ${((contracts.length / Math.max(leads.length, 1)) * 100).toFixed(1)}%.`, metric: "contracts" } : null,
  ].filter(Boolean);
  return {
    period: { from: f.from, to: f.to },
    kpi: { leads: leads.length, qualified: leads.filter(qualified).length, measurements_scheduled: funnel[2].count, measurements_completed: funnel[3].count, estimates: funnel[4].count, contracts: funnel[5].count, orders: orders.length, contract_value: contracts.reduce((s, o) => s + n(o.amount_total), 0), marketing_spend: spend },
    funnel, sources, managers, surveyors: [],
    telephony: { total: calls.length, inbound: calls.filter((c) => c.direction === "inbound").length, outbound: calls.filter((c) => c.direction === "outbound").length, missed: missed.length, answered: calls.filter((c) => !c.is_missed).length, unique_numbers: new Set(calls.map((c) => c.phone_e164 || c.phone_norm).filter(Boolean)).size, avg_duration: calls.length ? calls.reduce((s, c) => s + n(c.duration_sec), 0) / calls.length : 0, missed_called_back: missed.filter(wasCalledBack).length, missed_unique: new Set(missed.map((c) => c.phone_e164 || c.phone_norm).filter(Boolean)).size },
    tasks: { period: periodTasks.length, overdue: overdueTasks.length }, calendar: { events: events.slice(0, 8), count: events.length }, operations: { bookings: bookings.length, crews: new Set(bookings.map((b) => b.brigade_key)).size },
    data_quality: dataQuality, alerts, insights, targets,
    refs: { pipelines: d.pipelines.filter((x) => x.is_active).map((x) => ({ id: x.id, name: x.name })), stages: d.stages.map((s) => ({ id: s.id, name: s.name, pipeline_id: s.pipeline_id })), sources: [...new Set(d.leads.map((l) => normalizedSource(l.source)))].sort(), managers: d.profiles.filter((p) => p.is_active !== false).map((p) => ({ id: p.user_id, name: p.display_name || "Без імені" })), directions: [...new Set([...d.leads.map((l) => l.direction), ...d.events.map((e) => e.direction)].filter(Boolean))].sort(), orders: d.orders.slice(0, 300).map((o) => ({ id: o.id, name: `${o.number} · ${o.name}` })), statuses: ["open", "won", "lost", "postponed"] },
    freshness: d.integrations.filter((x) => x.enabled).map((x) => ({ provider: x.provider_key, name: x.name, status: x.status, syncedAt: x.last_success_at, error: x.last_error })),
  };
}

export async function drilldown(sb: Sb, p: DrilldownParams): Promise<DrilldownRow[]> {
  const d = await loadDashboardData(sb);
  const overview = await dashboardOverviewFromLoaded(d, p);
  const ids = new Set((overview.metricIds[p.metric] ?? []).slice(0, p.limit ?? 200));
  const rows = [...d.leads, ...d.measurements, ...d.estimates, ...d.orders, ...d.calls, ...d.tasks, ...d.events].filter((r) => ids.has(r.id));
  return rows.map((r: any) => ({ id: r.id, title: r.title || r.name || r.number || r.phone_e164 || r.phone_norm || "Запис", subtitle: r.status ?? r.commercial_status ?? r.direction ?? null, date: r.created_at ?? r.started_at ?? r.due_at ?? r.starts_at ?? null, amount: r.amount_total != null ? n(r.amount_total) : r.total_client != null ? n(r.total_client) : null, href: r.stage_id ? `/crm/leads?lead=${r.id}` : r.started_at ? "/crm/calls" : r.starts_at ? "/operations" : r.commercial_status ? `/orders/${r.id}` : r.module ? "/history" : r.order_id ? `/orders/${r.order_id}` : null }));
}

async function dashboardOverviewFromLoaded(d: any, p: DrilldownParams) {
  const stageById = new Map<string, any>(d.stages.map((s: any) => [s.id, s]));
  const initial = new Map<string, any>(); d.stages.slice().sort((a: any, b: any) => n(a.sort_order) - n(b.sort_order)).forEach((s: any) => { if (!initial.has(s.pipeline_id)) initial.set(s.pipeline_id, s); });
  const progressed = new Set(d.activities.filter((a: any) => { const x = stageById.get(a.from_stage_id); const y = stageById.get(a.to_stage_id); return x && y && initial.get(x.pipeline_id)?.id === x.id && n(y.sort_order) > n(x.sort_order); }).map((a: any) => a.lead_id));
  const isQualified = (l: any) => progressed.has(l.id);
  const leads = d.leads.filter((l: any) => inRange(l.created_at, p.from, p.to) && (!p.pipelineId || l.pipeline_id === p.pipelineId) && (!p.source || normalizedSource(l.source) === p.source) && (!p.managerId || l.assigned_to === p.managerId) && (!p.direction || l.direction === p.direction) && (!p.orderId || l.order_id === p.orderId) && (!p.status || l.status === p.status));
  const leadIds = new Set(leads.map((l: any) => l.id)); const orderIds = new Set(leads.map((l: any) => l.order_id).filter(Boolean));
  const meas = d.measurements.filter((m: any) => leadIds.has(m.lead_id) || orderIds.has(m.order_id)); const est = d.estimates.filter((e: any) => orderIds.has(e.order_id)); const orders = d.orders.filter((o: any) => orderIds.has(o.id));
  const calls = d.calls.filter((c: any) => inRange(c.started_at, p.from, p.to) && (!p.managerId || c.employee_id === p.managerId));
  const metricIds: Record<string, string[]> = {
    leads: leads.map((x: any) => x.id), qualified: leads.filter(isQualified).map((x: any) => x.id),
    measurements: meas.map((x: any) => x.id), measurements_scheduled: meas.map((x: any) => x.id), measurements_completed: meas.filter((x: any) => x.status === "completed" || x.completed_at).map((x: any) => x.id),
    estimates: est.map((x: any) => x.id), orders: orders.map((x: any) => x.id), contracts: orders.filter((x: any) => CONTRACT.includes(x.commercial_status)).map((x: any) => x.id),
    calls_missed: calls.filter((x: any) => x.is_missed).map((x: any) => x.id),
    tasks_overdue: d.tasks.filter((x: any) => x.status === "open" && x.due_at?.slice(0, 10) < new Date().toISOString().slice(0, 10)).map((x: any) => x.id),
    calendar: d.events.filter((x: any) => inRange(x.starts_at, p.from, p.to)).map((x: any) => x.id),
    dq_leads_no_source: leads.filter((x: any) => !x.source).map((x: any) => x.id), dq_leads_no_manager: leads.filter((x: any) => !x.assigned_to).map((x: any) => x.id),
    dq_calls_unlinked: calls.filter((x: any) => !x.lead_id && !x.client_id && !x.order_id).map((x: any) => x.id), dq_measurements_no_surveyor: meas.filter((x: any) => !x.surveyor_id).map((x: any) => x.id),
    dq_estimates_no_order: d.estimates.filter((x: any) => inRange(x.created_at, p.from, p.to) && !x.order_id).map((x: any) => x.id), dq_orders_no_amount: orders.filter((x: any) => !n(x.amount_total)).map((x: any) => x.id), dq_orders_no_source: orders.filter((x: any) => !x.source).map((x: any) => x.id),
  };
  return { metricIds };
}