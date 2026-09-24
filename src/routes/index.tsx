import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePersistedState } from "@/lib/usePersistedState";
import { getAnalyticsDrilldown, getAnalyticsOverview } from "@/lib/analytics.functions";
import { getFinanceOverview } from "@/lib/finance/finmap.functions";
import { TasksPanel } from "@/components/dashboard/panels";
import { ActionDrawer, EmptyState, FunnelCard, ManagementInsight, MetricCard, SectionShell } from "@/components/dashboard/control-center";
import { FinmapSyncStatus } from "@/components/finance/FinmapSyncStatus";
import { PayrollKpiCard } from "@/components/dashboard/PayrollKpiCard";
import { ReconciliationPanel } from "@/components/dashboard/ReconciliationPanel";
import { Button } from "@/components/ui/button";
import { BarChart3, CalendarDays, ChevronDown, ChevronRight, CircleAlert, ClipboardList, FileText, Filter, Handshake, Megaphone, PhoneCall, Plus, RefreshCw, Ruler, Target, Users, Wallet, Wrench } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "CEO Control Center — TERZI ERP" },
    { name: "description", content: "Операційний центр власника TERZI: продажі, команда, маркетинг, роботи та фінанси в одному узгодженому зрізі." },
    { property: "og:title", content: "CEO Control Center — TERZI ERP" },
    { property: "og:description", content: "Узгоджені KPI TERZI від ліда до замовлення, операцій і фактичних фінансів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Dashboard,
});

const iso = (date: Date) => date.toISOString().slice(0, 10);
const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const money = (value: number) => `${nf.format(Math.round(value))} ₴`;
const num = (value: number) => nf.format(value);
const pct = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}%`;
const noData = "Немає даних";
const delta = (current: number | null, previous: number | null) => current == null || previous == null || previous === 0 ? null : (current - previous) / previous * 100;
type RangeKey = "today" | "yesterday" | "d7" | "d30" | "month" | "prev_month" | "custom";
type Filters = { pipelineId: string; source: string; managerId: string; direction: string; orderId: string; status: string };
type Drill = { metric: string; title: string } | null;

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Сьогодні" }, { key: "yesterday", label: "Вчора" }, { key: "d7", label: "7 днів" },
  { key: "d30", label: "30 днів" }, { key: "month", label: "Цей місяць" }, { key: "prev_month", label: "Минулий" }, { key: "custom", label: "Період" },
];
function rangeFor(key: RangeKey) {
  const now = new Date(); const y = now.getUTCFullYear(); const m = now.getUTCMonth(); const day = now.getUTCDate();
  const back = (days: number) => new Date(Date.UTC(y, m, day - days));
  if (key === "today") return { from: iso(now), to: iso(now) };
  if (key === "yesterday") return { from: iso(back(1)), to: iso(back(1)) };
  if (key === "d7") return { from: iso(back(6)), to: iso(now) };
  if (key === "d30") return { from: iso(back(29)), to: iso(now) };
  if (key === "month") return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(now) };
  if (key === "prev_month") return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  return { from: iso(back(89)), to: iso(now) };
}
const selectClass = "h-10 min-w-0 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-panel";

function Dashboard() {
  const { user } = useAuth();
  const [rangeKey, setRangeKey] = usePersistedState<RangeKey>("terzi:dash:range", "month");
  const [custom, setCustom] = usePersistedState("terzi:dash:custom", rangeFor("custom"));
  const [filters, setFilters] = usePersistedState<Filters>("terzi:dash:filters", { pipelineId: "", source: "", managerId: "", direction: "", orderId: "", status: "" });
  const [drill, setDrill] = useState<Drill>(null);
  const { from, to } = useMemo(() => rangeKey === "custom" ? custom : rangeFor(rangeKey), [rangeKey, custom]);
  const request = { from, to, pipelineId: filters.pipelineId || null, source: filters.source || null, managerId: filters.managerId || null, direction: filters.direction || null, orderId: filters.orderId || null, status: filters.status || null };
  const overviewFn = useServerFn(getAnalyticsOverview);
  const drillFn = useServerFn(getAnalyticsDrilldown);
  const financeFn = useServerFn(getFinanceOverview);
  const overviewQuery = useQuery({ queryKey: ["dash", "overview", request], queryFn: () => overviewFn({ data: request }), enabled: !!user, retry: 1, throwOnError: false });
  const financeQuery = useQuery({ queryKey: ["dash", "finance", from, to], queryFn: () => financeFn({ data: { from, to, kind: "all", match_status: "all", limit: 1, offset: 0 } }), enabled: !!user, retry: false, throwOnError: false });
  const drillQuery = useQuery({ queryKey: ["dash", "drilldown", drill?.metric, request], queryFn: () => drillFn({ data: { ...request, metric: drill?.metric as any, limit: 200 } }), enabled: !!drill, retry: 1 });
  const cur = overviewQuery.data?.current as any; const prev = overviewQuery.data?.previous as any; const fin = financeQuery.data as any;
  const k = (key: string) => cur?.kpi?.[key] == null ? null : Number(cur.kpi[key]);
  const kp = (key: string) => prev?.kpi?.[key] == null ? null : Number(prev.kpi[key]);
  const openDrill = (metric: string, title: string) => setDrill({ metric, title });
  const resetFilters = () => setFilters({ pipelineId: "", source: "", managerId: "", direction: "", orderId: "", status: "" });
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const refs = cur?.refs ?? { pipelines: [], sources: [], managers: [], directions: [], orders: [], statuses: [] };
  const targetText = (metric: string) => cur?.targets?.[metric] == null ? "Ціль не налаштована" : `План ${num(Number(cur.targets[metric]))}`;
  const todayLabel = new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "short", year: "numeric" });

  return <main className="crm-workspace min-h-full">
    <div className="dashboard-page space-y-6">
      <header className="space-y-3">
        <div className="dashboard-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="h-6 w-6" /></span><div className="min-w-0"><p className="crm-eyebrow">Центр керування</p><h1 className="truncate text-2xl font-black md:text-3xl">CEO Dashboard</h1><p className="truncate text-xs text-muted-foreground md:text-sm">Оперативний стан компанії сьогодні</p></div></div>
          <Button variant="outline" className="h-12 shrink-0 gap-2 rounded-lg bg-card px-3" onClick={() => setRangeKey("today")}><CalendarDays className="h-4 w-4 text-primary" /><span className="hidden text-left sm:block"><b className="block text-xs">{todayLabel}</b><small className="text-muted-foreground">Europe/Kyiv</small></span><ChevronDown className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="dashboard-toolbar sticky top-16 z-20 -mx-1 space-y-2 px-2 py-2 md:top-14 md:mx-0">
          <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto pb-0.5">{RANGES.map((r) => <Button key={r.key} size="sm" variant={rangeKey === r.key ? "default" : "ghost"} onClick={() => setRangeKey(r.key)} className="shrink-0 rounded-lg">{r.label}</Button>)}</div>
          {rangeKey === "custom" ? <div className="grid grid-cols-2 gap-2"><input aria-label="Початок періоду" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={selectClass} /><input aria-label="Кінець періоду" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={selectClass} /></div> : null}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <select aria-label="Воронка" value={filters.pipelineId} onChange={(e) => setFilters({ ...filters, pipelineId: e.target.value })} className={selectClass}><option value="">Усі воронки</option>{refs.pipelines.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select aria-label="Джерело" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} className={selectClass}><option value="">Усі джерела</option>{refs.sources.map((x: string) => <option key={x}>{x}</option>)}</select>
            <select aria-label="Менеджер" value={filters.managerId} onChange={(e) => setFilters({ ...filters, managerId: e.target.value })} className={selectClass}><option value="">Усі менеджери</option>{refs.managers.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select aria-label="Напрямок" value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })} className={selectClass}><option value="">Усі напрямки</option>{refs.directions.map((x: string) => <option key={x}>{x}</option>)}</select>
            <select aria-label="Замовлення" value={filters.orderId} onChange={(e) => setFilters({ ...filters, orderId: e.target.value })} className={selectClass}><option value="">Усі замовлення</option>{refs.orders.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select aria-label="Статус" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={selectClass}><option value="">Усі статуси</option><option value="open">В роботі</option><option value="won">Виграно</option><option value="lost">Втрачено</option><option value="postponed">Відкладено</option></select>
            <Button variant="outline" size="sm" onClick={resetFilters} disabled={!activeFilters}><Filter />Скинути{activeFilters ? ` · ${activeFilters}` : ""}</Button>
          </div>
        </div>
      </header>

      {overviewQuery.isLoading ? <EmptyState text="Завантаження управлінського зведення…" /> : overviewQuery.isError || !cur ? <div className="crm-panel p-6 text-center"><CircleAlert className="mx-auto h-6 w-6 text-destructive" /><p className="mt-2 text-sm font-bold">Не вдалося завантажити зведення</p><Button variant="outline" size="sm" className="mt-3" onClick={() => overviewQuery.refetch()}><RefreshCw />Повторити</Button></div> : <>
        <SectionShell title="CEO зараз">
          <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={Target} label="Заявки" value={num(k("leads") ?? 0)} delta={delta(k("leads"), kp("leads"))} target={targetText("leads")} onClick={() => openDrill("leads", "Заявки")} />
            <MetricCard icon={Users} label="Кваліфіковані" value={num(k("qualified") ?? 0)} delta={delta(k("qualified"), kp("qualified"))} target={targetText("qualified")} onClick={() => openDrill("qualified", "Кваліфіковані ліди")} />
            <MetricCard icon={Ruler} label="Заміри" value={num(k("measurements_completed") ?? 0)} note={`Призначено ${num(k("measurements_scheduled") ?? 0)}`} delta={delta(k("measurements_completed"), kp("measurements_completed"))} onClick={() => openDrill("measurements_completed", "Виконані заміри")} />
            <MetricCard icon={FileText} label="Кошториси" value={num(k("estimates") ?? 0)} delta={delta(k("estimates"), kp("estimates"))} onClick={() => openDrill("estimates", "Кошториси")} />
            <MetricCard icon={Handshake} label="Продано" value={num(k("contracts") ?? 0)} tone="gold" delta={delta(k("contracts"), kp("contracts"))} target={targetText("contracts")} onClick={() => openDrill("contracts", "Продано / договори")} />
            <MetricCard icon={Wallet} label="Сума договорів" value={money(k("contract_value") ?? 0)} tone="gold" delta={delta(k("contract_value"), kp("contract_value"))} target={targetText("contract_value")} onClick={() => openDrill("contracts", "Сума договорів")} />
            <MetricCard icon={Wallet} label="Факт надходжень" value={fin ? money(fin.income) : noData} tone="success" note={financeQuery.isError ? "Немає доступу" : "Finmap"} />
            <MetricCard icon={Wallet} label="Факт прибутку" value={fin ? money(fin.grossProfit) : noData} tone={fin?.grossProfit < 0 ? "danger" : "success"} note={fin ? `Маржа ${pct(fin.margin)}` : "Finmap"} />
          </div>
          <div className="grid gap-3 lg:grid-cols-3"><div className="crm-panel p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><CircleAlert className="h-5 w-5 text-destructive" />Критичні сигнали</h3><span className="text-xs text-primary">Усі · {cur.alerts.length}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{cur.alerts.length ? cur.alerts.slice(0, 5).map((a: any) => <Button key={a.title} variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-left" onClick={() => openDrill(a.metric, a.title)}><span><b className="block text-xs">{a.title}</b><span className="text-[10px] text-muted-foreground">{a.action}</span></span><b className="text-destructive">{a.value}</b></Button>) : <EmptyState text="Критичних сигналів немає" />}</div></div><div className="crm-panel p-4 lg:col-span-2"><h3 className="text-sm font-black">Ключові висновки</h3><div className="mt-2 grid gap-1 md:grid-cols-2">{cur.insights.length ? cur.insights.map((x: any) => <ManagementInsight key={x.title} {...x} onClick={() => openDrill(x.metric, x.title)} />) : <EmptyState text="Недостатньо даних для висновків" />}</div></div></div>
          <PayrollKpiCard />
          <div className="crm-panel p-4"><div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><ClipboardList className="h-5 w-5 text-primary" />Мої задачі</h3><Button asChild variant="link" size="sm"><Link to="/crm/tasks">Усі задачі <ChevronRight /></Link></Button></div><TasksPanel /></div>
          <div className="crm-panel p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-black"><Plus className="h-5 w-5 text-primary" />Швидкі дії</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Button asChild><Link to="/crm/leads" search={{ focus: undefined, stage: undefined, manager: undefined }}><Users />Лід</Link></Button><Button asChild variant="secondary"><Link to="/crm/measurements"><Ruler />Замір</Link></Button><Button asChild variant="gold"><Link to="/calc"><FileText />Кошторис</Link></Button><Button asChild variant="outline"><Link to="/crm/tasks"><ClipboardList />Задача</Link></Button></div></div>
        </SectionShell>

        <SectionShell title="Продажі та контроль" action={<Button asChild variant="link" size="sm"><Link to="/crm/leads" search={{ focus: undefined, stage: undefined, manager: undefined }}>Воронка <ChevronRight /></Link></Button>}>
          <div className="grid gap-3 lg:grid-cols-3"><div className="lg:col-span-2"><FunnelCard stages={cur.funnel} onOpen={openDrill} /></div><div className="crm-panel p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Дзвінки</h3><PhoneCall className="h-4 w-4 text-primary" /></div><div className="mt-3 space-y-2 text-xs">{[["Всього", cur.telephony.total], ["Вхідні", cur.telephony.inbound], ["Вихідні", cur.telephony.outbound], ["Пропущені", cur.telephony.missed], ["Передзвонили", `${cur.telephony.missed_called_back} / ${cur.telephony.missed_unique}`]].map(([l, v]) => <div key={String(l)} className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">{l}</span><b>{v}</b></div>)}</div><Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openDrill("calls_missed", "Пропущені дзвінки")}>Перевірити пропущені</Button></div></div>
          <div className="crm-panel overflow-hidden"><div className="border-b border-border p-3"><h3 className="text-sm font-black">Менеджери</h3></div>{!cur.managers.length ? <div className="p-3"><EmptyState text="Немає даних за період" /></div> : <div className="divide-y divide-border">{cur.managers.slice(0, 10).map((m: any) => <div key={m.user_id ?? "none"} className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-4 px-3 py-2.5 text-xs"><b className="truncate">{m.name}</b><span><small className="block text-muted-foreground">Ліди</small>{m.leads}</span><span><small className="block text-muted-foreground">Якісні</small>{m.qualified}</span><span><small className="block text-muted-foreground">Продано</small>{m.contracts}</span></div>)}</div>}</div>
        </SectionShell>

        <SectionShell title="Маркетинг і конверсії" action={<Button asChild variant="link" size="sm"><Link to="/marketing/analytics">Аналітика <ChevronRight /></Link></Button>}>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><MetricCard icon={Megaphone} label="Витрати" value={money(k("marketing_spend") ?? 0)} note="UAH" /><MetricCard icon={Target} label="CPL" value={k("leads") ? money((k("marketing_spend") ?? 0) / Number(k("leads"))) : noData} /><MetricCard icon={Users} label="CPQL" value={k("qualified") ? money((k("marketing_spend") ?? 0) / Number(k("qualified"))) : noData} /><MetricCard icon={Handshake} label="CAC" value={k("contracts") ? money((k("marketing_spend") ?? 0) / Number(k("contracts"))) : noData} note="ROAS/ROMI — недостатньо даних" /></div>
          <div className="crm-panel overflow-hidden"><div className="border-b border-border p-3"><h3 className="text-sm font-black">Канали</h3></div>{!cur.sources.length ? <div className="p-3"><EmptyState text="Немає атрибутованих заявок" /></div> : <div className="divide-y divide-border">{cur.sources.sort((a: any, b: any) => b.leads - a.leads).map((s: any) => <Button key={s.source} variant="ghost" onClick={() => setFilters({ ...filters, source: s.source })} className="grid h-auto w-full grid-cols-[1fr_repeat(3,auto)] gap-4 rounded-none px-3 py-2.5 text-left text-xs"><b className="truncate">{s.source}</b><span><small className="block text-muted-foreground">Ліди</small>{s.leads}</span><span><small className="block text-muted-foreground">Якісні</small>{s.qualified}</span><span><small className="block text-muted-foreground">Продано</small>{s.contracts}</span></Button>)}</div>}</div>
        </SectionShell>

        <SectionShell title="Операції, бригади та календар">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><MetricCard icon={CalendarDays} label="Події" value={num(cur.calendar.count)} note="За вибраний період" onClick={() => openDrill("calendar", "Події календаря")} /><MetricCard icon={Wrench} label="Бригади" value={num(cur.operations.crews)} note={`${cur.operations.bookings} бронювань`} /><MetricCard icon={ClipboardList} label="Прострочені задачі" value={num(cur.tasks.overdue)} tone={cur.tasks.overdue ? "danger" : "success"} onClick={() => openDrill("tasks_overdue", "Прострочені задачі")} /><MetricCard icon={CircleAlert} label="Якість даних" value={num(Object.values(cur.data_quality).reduce((s: number, v: any) => s + Number(v ?? 0), 0))} tone="warning" note="Потребує перевірки" /></div>
          <div className="grid gap-3 lg:grid-cols-3"><div className="crm-panel p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Календар</h3><Button asChild variant="link" size="sm"><Link to="/operations">Відкрити</Link></Button></div><div className="mt-2 space-y-2">{cur.calendar.events.length ? cur.calendar.events.map((e: any) => <div key={e.id} className="border-b border-border pb-2 text-xs"><b>{e.title}</b><p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(e.starts_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></div>) : <EmptyState text="Подій немає" />}</div></div><div className="crm-panel p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Фінанси · Finmap</h3><Button asChild variant="link" size="sm"><Link to="/finance" search={{ tab: "overview" }}>Детально</Link></Button></div>{fin ? <div className="mt-3 space-y-2 text-xs">{[["Гроші на рахунках", money(fin.cashOnAccounts)], ["Доходи", money(fin.income)], ["Витрати", money(fin.expense)], ["Прибуток", money(fin.grossProfit)], ["Дебіторка", money(fin.receivable)], ["Кредиторка", money(fin.payable)]].map(([l, v]) => <div key={l} className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">{l}</span><b>{v}</b></div>)}</div> : <EmptyState text={financeQuery.isError ? "Немає доступу до фінансів" : "Фінансові дані недоступні"} />}</div><div className="crm-panel p-4"><h3 className="text-sm font-black">Якість даних</h3><div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(cur.data_quality).map(([key, value]: [string, any]) => <Button key={key} variant="outline" onClick={() => openDrill(key === "qualification_needs_review" ? "qualified" : `dq_${key.replace(/^dq_/, "")}`, key)} className="h-auto justify-start whitespace-normal p-2 text-left"><span><b className={Number(value) ? "text-warning" : "text-success"}>{value}</b><small className="mt-0.5 block text-[10px] text-muted-foreground">{key.replaceAll("_", " ")}</small></span></Button>)}</div></div></div>
          <div className="crm-panel p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Стан інтеграцій</h3><Button asChild variant="link" size="sm"><Link to="/integrations">Налаштування</Link></Button></div><div className="mt-3 grid gap-2 md:grid-cols-3">{cur.freshness.map((x: any) => <div key={x.provider} className="rounded-md border border-border p-2.5 text-xs"><div className="flex justify-between"><b>{x.name}</b><span className={x.error ? "text-destructive" : "text-success"}>{x.error ? "Помилка" : x.status}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{x.syncedAt ? new Date(x.syncedAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }) : "Немає успішної синхронізації"}</p></div>)}</div></div>
          <ReconciliationPanel />
          <div className="crm-panel p-4"><FinmapSyncStatus /></div>
        </SectionShell>
      </>}
    </div>
    <ActionDrawer open={!!drill} onOpenChange={(open) => { if (!open) setDrill(null); }} title={drill?.title ?? "Деталізація"} description={`${from} — ${to} · до 200 записів`} loading={drillQuery.isLoading} rows={(drillQuery.data ?? []) as any[]} />
  </main>;
}
