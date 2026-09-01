import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Users, Target, PhoneCall, Inbox, AlertTriangle, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listLeads, listTasks, listRequests, listCalls, listPipelines } from "@/lib/crm.functions";

export const Route = createFileRoute("/crm/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "CRM — панель продажів TERZI" },
    { name: "description", content: "Показники CRM TERZI: ліди у роботі, конверсія, звернення, дзвінки та прострочені задачі." },
    { property: "og:title", content: "CRM — панель продажів TERZI" },
    { property: "og:description", content: "Ліди, воронка продажів, звернення, дзвінки та задачі TERZI в одному місці." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CrmDashboard,
});

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n) + " ₴";

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


function CrmDashboard() {
  const leadsFn = useServerFn(listLeads);
  const tasksFn = useServerFn(listTasks);
  const reqFn = useServerFn(listRequests);
  const callsFn = useServerFn(listCalls);
  const pipeFn = useServerFn(listPipelines);

  const { data: leads = [] } = useQuery({ queryKey: ["crm", "leads"], queryFn: () => leadsFn() });
  const { data: tasks = [] } = useQuery({ queryKey: ["crm", "tasks"], queryFn: () => tasksFn() });
  const { data: requests = [] } = useQuery({ queryKey: ["crm", "requests"], queryFn: () => reqFn() });
  const { data: calls = [] } = useQuery({ queryKey: ["crm", "calls"], queryFn: () => callsFn() });
  const { data: pipe } = useQuery({ queryKey: ["crm", "pipelines"], queryFn: () => pipeFn() });

  const stats = useMemo(() => {
    const open = (leads as any[]).filter((l) => l.status === "open");
    const won = (leads as any[]).filter((l) => l.status === "won");
    const lost = (leads as any[]).filter((l) => l.status === "lost");
    const closed = won.length + lost.length;
    const now = Date.now();
    const overdue = (tasks as any[]).filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now);
    const pipeline = open.reduce((s, l) => s + Number(l.budget || 0), 0);
    const wonSum = won.reduce((s, l) => s + Number(l.budget || 0), 0);
    return {
      open: open.length,
      pipeline,
      wonSum,
      conversion: closed ? Math.round((won.length / closed) * 100) : 0,
      overdue: overdue.length,
      newRequests: (requests as any[]).filter((r) => r.status === "new").length,
      calls: (calls as any[]).length,
    };
  }, [leads, tasks, requests, calls]);

  const byStage = useMemo(() => {
    const stages = (pipe?.stages ?? []) as any[];
    return stages.map((s) => ({
      ...s,
      count: (leads as any[]).filter((l) => l.stage_id === s.id).length,
      sum: (leads as any[]).filter((l) => l.stage_id === s.id).reduce((a, l) => a + Number(l.budget || 0), 0),
    }));
  }, [pipe, leads]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">CRM</h1>
            <p className="text-sm text-muted-foreground">Воронка продажів, звернення, дзвінки та задачі</p>
          </div>
          <div className="flex gap-2">
            <Link to="/crm/leads" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Воронка лідів</Link>
            <Link to="/crm/contacts" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Контакти</Link>
            <Link to="/crm/requests" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Звернення</Link>
            <Link to="/crm/calls" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Дзвінки</Link>
            <Link to="/crm/tasks" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Задачі</Link>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={Target} label="Ліди в роботі" value={String(stats.open)} />
          <Kpi icon={TrendingUp} label="Сума воронки" value={money(stats.pipeline)} />
          <Kpi icon={TrendingUp} label="Виграно" value={money(stats.wonSum)} tone="good" />
          <Kpi icon={Users} label="Конверсія" value={`${stats.conversion}%`} hint="Виграні / закриті" />
          <Kpi icon={Inbox} label="Нові звернення" value={String(stats.newRequests)} />
          <Kpi icon={AlertTriangle} label="Прострочені задачі" value={String(stats.overdue)} tone={stats.overdue ? "warn" : "default"} />
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold mb-3">Розподіл по етапах</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byStage.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color || "var(--color-primary)" }} />
                  {s.name}
                </span>
                <span className="text-sm font-semibold">{s.count} · {money(s.sum)}</span>
              </div>
            ))}
            {!byStage.length ? <div className="text-sm text-muted-foreground">Немає етапів</div> : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-bold mb-3"><Inbox className="w-4 h-4" /> Останні звернення</div>
            <div className="space-y-2">
              {(requests as any[]).slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <span className="truncate">{r.subject || r.contact_name || r.channel}</span>
                  <span className="text-xs text-muted-foreground">{r.channel}</span>
                </div>
              ))}
              {!requests.length ? <div className="text-sm text-muted-foreground">Звернень поки немає</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-bold mb-3"><PhoneCall className="w-4 h-4" /> Останні дзвінки</div>
            <div className="space-y-2">
              {(calls as any[]).slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <span className="truncate">{c.direction === "inbound" ? c.from_number : c.to_number}</span>
                  <span className="text-xs text-muted-foreground">{Math.round((c.duration_sec || 0) / 60)} хв</span>
                </div>
              ))}
              {!calls.length ? <div className="text-sm text-muted-foreground">Дзвінків поки немає (потрібна інтеграція телефонії)</div> : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
