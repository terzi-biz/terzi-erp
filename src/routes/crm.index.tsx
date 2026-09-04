import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Users, Target, PhoneCall, Ruler, AlertTriangle, TrendingUp, ListTodo } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listLeads, listTasks, listCalls, listPipelines } from "@/lib/crm.functions";
import { listMeasurements } from "@/lib/measurements.functions";

export const Route = createFileRoute("/crm/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "CRM — панель продажів TERZI" },
    { name: "description", content: "Показники CRM TERZI: ліди у роботі, воронка, заміри, дзвінки та прострочені задачі." },
    { property: "og:title", content: "CRM — панель продажів TERZI" },
    { property: "og:description", content: "Ліди, воронка продажів, заміри, дзвінки та задачі TERZI в одному місці." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CrmDashboard,
});

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n) + " ₴";
const pctText = (v: number | null) => (v == null ? "немає даних" : `${v}%`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const STAGE_PALETTE = ["#99ccfd", "#ffce5a", "#ffdc7f", "#deff81", "#87f2c0", "#fd9b98", "#ccc8f9", "#f9deff"];

function Kpi({ icon: Icon, label, value, hint, tone = "default" }: { icon: any; label: string; value: string; hint?: string; tone?: "default" | "warn" | "good" }) {
  const toneCls = tone === "warn" ? "text-destructive" : tone === "good" ? "text-success" : "text-primary";
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${toneCls}`} /> {label}
      </div>
      <div className="mt-2 text-[26px] leading-none font-black tracking-tight">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div> : null}
    </div>
  );
}

type Tab = "funnel" | "measurements" | "activity";

function CrmDashboard() {
  const leadsFn = useServerFn(listLeads);
  const tasksFn = useServerFn(listTasks);
  const callsFn = useServerFn(listCalls);
  const pipeFn = useServerFn(listPipelines);
  const measFn = useServerFn(listMeasurements);

  const [tab, setTab] = useState<Tab>("funnel");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return iso(d); });
  const [to, setTo] = useState(() => iso(new Date()));

  const { data: leads = [] } = useQuery({ queryKey: ["crm", "leads"], queryFn: () => leadsFn() });
  const { data: tasks = [] } = useQuery({ queryKey: ["crm", "tasks"], queryFn: () => tasksFn() });
  const { data: calls = [] } = useQuery({ queryKey: ["crm", "calls"], queryFn: () => callsFn() });
  const { data: pipe } = useQuery({ queryKey: ["crm", "pipelines"], queryFn: () => pipeFn() });
  const { data: meas } = useQuery({
    queryKey: ["crm", "measurements", from, to],
    queryFn: () => measFn({ data: { from, to } }),
  });

  const stats = useMemo(() => {
    const open = (leads as any[]).filter((l) => l.status === "open");
    const won = (leads as any[]).filter((l) => l.status === "won");
    const lost = (leads as any[]).filter((l) => l.status === "lost");
    const closed = won.length + lost.length;
    const now = Date.now();
    const overdue = (tasks as any[]).filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now);
    return {
      open: open.length,
      pipeline: open.reduce((s, l) => s + Number(l.budget || 0), 0),
      wonSum: won.reduce((s, l) => s + Number(l.budget || 0), 0),
      conversion: closed ? Math.round((won.length / closed) * 100) : 0,
      overdue: overdue.length,
      calls: (calls as any[]).length,
    };
  }, [leads, tasks, calls]);

  const byStage = useMemo(() => {
    const stages = (pipe?.stages ?? []) as any[];
    return stages.map((s) => ({
      ...s,
      count: (leads as any[]).filter((l) => l.stage_id === s.id).length,
      sum: (leads as any[]).filter((l) => l.stage_id === s.id).reduce((a, l) => a + Number(l.budget || 0), 0),
    }));
  }, [pipe, leads]);

  const funnel = meas?.funnel ?? null;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">CRM</h1>
            <p className="text-sm text-muted-foreground">Воронка продажів, заміри, дзвінки та задачі</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/crm/leads" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Воронка лідів</Link>
            <Link to="/crm/measurements" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Заміри</Link>
            <Link to="/crm/calls" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Дзвінки</Link>
            <Link to="/crm/tasks" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Задачі</Link>
            <Link to="/clients" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Клієнти</Link>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={Target} label="Ліди в роботі" value={String(stats.open)} />
          <Kpi icon={TrendingUp} label="Сума воронки" value={money(stats.pipeline)} />
          <Kpi icon={TrendingUp} label="Виграно" value={money(stats.wonSum)} tone="good" />
          <Kpi icon={Users} label="Конверсія" value={`${stats.conversion}%`} hint="Виграні / закриті" />
          <Kpi icon={Ruler} label="Заміри за період" value={funnel ? String(funnel.measurements) : "—"} hint={funnel ? `лід → замір ${pctText(funnel.leadToMeasure)}` : undefined} />
          <Kpi icon={AlertTriangle} label="Прострочені задачі" value={String(stats.overdue)} tone={stats.overdue ? "warn" : "default"} />
        </div>

        <div className="flex items-center gap-2 flex-wrap border-b border-border">
          {([["funnel", "Воронка"], ["measurements", "Заміри і конверсія"], ["activity", "Активність"]] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
          {tab === "measurements" ? (
            <div className="ml-auto flex items-center gap-2 pb-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
              <span className="text-xs text-muted-foreground">—</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
            </div>
          ) : null}
        </div>

        {tab === "funnel" ? (
          <div className="rounded-md border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
            <div className="text-sm font-bold mb-3">Воронка по етапах</div>
            <div className="space-y-1.5">
              {byStage.map((s, i) => {
                const max = Math.max(1, ...byStage.map((x) => x.count));
                const color = s.color || STAGE_PALETTE[i % STAGE_PALETTE.length];
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-[12px] font-semibold">{s.name}</div>
                    <div className="flex-1 h-7 rounded-sm bg-muted/50 overflow-hidden">
                      <div className="h-full flex items-center px-2 text-[11px] font-bold text-[#22303f] transition-all"
                        style={{ width: `${Math.max(6, (s.count / max) * 100)}%`, backgroundColor: color }}>
                        {s.count}
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right text-[12px] font-semibold">{money(s.sum)}</div>
                  </div>
                );
              })}
              {!byStage.length ? <div className="text-sm text-muted-foreground">Немає етапів</div> : null}
            </div>
          </div>
        ) : null}

        {tab === "measurements" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-card p-4 lg:col-span-2 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
              <div className="flex items-center gap-2 text-sm font-bold mb-3"><Ruler className="w-4 h-4" /> Конверсія лід → замір → договір</div>
              {funnel ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                  <Kpi icon={Target} label="Ліди" value={String(funnel.leads)} />
                  <Kpi icon={Ruler} label="Заміри" value={String(funnel.measurements)} hint={`лід → замір ${pctText(funnel.leadToMeasure)}`} />
                  <Kpi icon={TrendingUp} label="Договори" value={String(funnel.contracts)} hint={`замір → договір ${pctText(funnel.measureToContract)}`} tone="good" />
                  <Kpi icon={Users} label="Лід → договір" value={pctText(funnel.leadToContract)} />
                  <Kpi icon={AlertTriangle} label="План без факту" value={String(funnel.plannedWithoutFact)} tone={funnel.plannedWithoutFact ? "warn" : "default"} />
                  <Kpi icon={AlertTriangle} label="Факт без події" value={String(funnel.factsWithoutEvent)} tone={funnel.factsWithoutEvent ? "warn" : "default"} />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Немає даних за період</div>
              )}
            </div>
            <div className="rounded-md border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
              <div className="flex items-center gap-2 text-sm font-bold mb-3"><ListTodo className="w-4 h-4" /> Найближчі заміри</div>
              <div className="space-y-2">
                {(meas?.planned ?? []).slice(0, 8).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0">
                    <span className="truncate">{p.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(p.starts_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                {!(meas?.planned ?? []).length ? <div className="text-sm text-muted-foreground">Замірів у календарі немає</div> : null}
              </div>
              <Link to="/crm/measurements" className="mt-3 inline-block text-xs font-semibold text-primary">Відкрити календар замірів →</Link>
            </div>
          </div>
        ) : null}

        {tab === "activity" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
              <div className="flex items-center gap-2 text-sm font-bold mb-3"><PhoneCall className="w-4 h-4" /> Останні дзвінки</div>
              <div className="space-y-2">
                {(calls as any[]).slice(0, 8).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                    <span className="truncate">{c.direction === "inbound" ? c.from_number : c.to_number}</span>
                    <span className="text-xs text-muted-foreground">{Math.round((c.duration_sec || 0) / 60)} хв</span>
                  </div>
                ))}
                {!calls.length ? <div className="text-sm text-muted-foreground">Дзвінків поки немає (потрібна інтеграція телефонії)</div> : null}
              </div>
              <Link to="/crm/calls" className="mt-3 inline-block text-xs font-semibold text-primary">Аналітика дзвінків →</Link>
            </div>
            <div className="rounded-md border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.12)]">
              <div className="flex items-center gap-2 text-sm font-bold mb-3"><ListTodo className="w-4 h-4" /> Прострочені задачі</div>
              <div className="space-y-2">
                {(tasks as any[])
                  .filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < Date.now())
                  .slice(0, 8)
                  .map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0">
                      <span className="truncate">{t.title}</span>
                      <span className="text-xs text-destructive shrink-0">{new Date(t.due_at).toLocaleDateString("uk-UA")}</span>
                    </div>
                  ))}
                {!stats.overdue ? <div className="text-sm text-muted-foreground">Прострочених задач немає</div> : null}
              </div>
              <Link to="/crm/tasks" className="mt-3 inline-block text-xs font-semibold text-primary">Усі задачі →</Link>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
