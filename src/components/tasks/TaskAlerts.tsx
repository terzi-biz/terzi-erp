/** Нагадування по задачах: дзвіночок у шапці/боковій панелі та блок на дашборді. */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, Clock, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { listMyTaskAlerts } from "@/lib/crm.functions";

const STATE: Record<string, { label: string; cls: string }> = {
  overdue: { label: "Прострочено", cls: "text-destructive" },
  remind: { label: "Нагадування", cls: "text-warning" },
  today: { label: "Сьогодні", cls: "text-primary" },
  later: { label: "Пізніше", cls: "text-muted-foreground" },
};
const PR: Record<string, string> = { low: "Низький", normal: "Звичайний", high: "Високий", critical: "Критичний" };
const fmt = (v: string | null) => v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "без строку";

export function useTaskAlerts() {
  const fn = useServerFn(listMyTaskAlerts);
  return useQuery({ queryKey: ["crm", "task-alerts"], queryFn: () => fn(), refetchInterval: 60_000, staleTime: 30_000, retry: false });
}

function Row({ t }: { t: any }) {
  const s = STATE[t.state] ?? STATE.later;
  return (
    <Link to="/crm/tasks" className="block rounded-md border border-border p-2 text-xs hover:border-primary">
      <div className="flex items-center justify-between gap-2"><b className="truncate">{t.title}</b><span className={`shrink-0 text-[10px] font-semibold ${s.cls}`}>{s.label}</span></div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{fmt(t.due_at)} · {PR[t.priority] ?? t.priority}</div>
    </Link>
  );
}

/** Дзвіночок: лічильник + випадаючий список; спливаюче повідомлення про нові нагадування. */
export function TaskBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const q = useTaskAlerts();
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const alerts = (q.data?.alerts ?? []) as any[];
  useEffect(() => {
    for (const a of alerts) {
      if (a.state === "remind" && !seen.current.has(a.id)) { if (seen.current.size || q.dataUpdatedAt) toast.info(`Нагадування: ${a.title}`); }
      seen.current.add(a.id);
    }
  }, [alerts, q.dataUpdatedAt]);
  const n = alerts.length;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Задачі: ${n}`} title="Мої задачі"
        className={`relative grid h-9 w-9 place-items-center rounded-md ${tone === "dark" ? "hover:bg-white/10" : "text-foreground/70 hover:bg-muted"}`}>
        <Bell className="h-[18px] w-[18px]" />
        {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[18px] text-destructive-foreground">{n > 99 ? "99+" : n}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(320px,90vw)] rounded-lg border border-border bg-card p-3 text-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between text-sm font-bold">Мої задачі <Link to="/crm/tasks" onClick={() => setOpen(false)} className="text-xs font-semibold text-primary">Усі →</Link></div>
            <div className="max-h-80 space-y-1.5 overflow-auto">
              {n ? alerts.map((t) => <Row key={t.id} t={t} />) : <p className="py-3 text-center text-xs text-muted-foreground">Термінових задач немає</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Блок «Мої задачі» на дашборді. */
export function TaskAlertsCard() {
  const q = useTaskAlerts();
  const d = q.data;
  return (
    <div className="crm-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-black"><ListTodo className="h-4 w-4" /> Мої задачі</h3>
        <Link to="/crm/tasks" className="text-xs font-semibold text-primary">Відкрити →</Link>
      </div>
      {q.isLoading ? <p className="mt-3 text-xs text-muted-foreground">Завантаження…</p> : q.isError ? <p className="mt-3 text-xs text-muted-foreground">Немає доступу до задач</p> : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-border p-2"><small className="flex items-center gap-1 text-[10px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />Прострочені</small><b className="text-sm text-destructive">{d?.counts.overdue ?? 0}</b></div>
            <div className="rounded-md border border-border p-2"><small className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />Сьогодні</small><b className="text-sm">{(d?.counts.today ?? 0) + (d?.counts.remind ?? 0)}</b></div>
            <div className="rounded-md border border-border p-2"><small className="block text-[10px] text-muted-foreground">Відкриті</small><b className="text-sm">{d?.counts.open ?? 0}</b></div>
          </div>
          <div className="mt-3 space-y-1.5">
            {[...(d?.alerts ?? []), ...(d?.upcoming ?? [])].slice(0, 6).map((t: any) => <Row key={t.id} t={t} />)}
            {!d?.counts.open && <p className="text-xs text-muted-foreground">Відкритих задач немає</p>}
          </div>
        </>
      )}
    </div>
  );
}
