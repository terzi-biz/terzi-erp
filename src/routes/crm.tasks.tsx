import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, X, Trash2, CheckCircle2, AlertTriangle, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listTasks, upsertTask, deleteTask } from "@/lib/crm.functions";

export const Route = createFileRoute("/crm/tasks")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Задачі — CRM TERZI" },
    { name: "description", content: "Задачі та прострочені активності менеджерів TERZI: дзвінки, зустрічі, заміри." },
    { property: "og:title", content: "Задачі — CRM TERZI" },
    { property: "og:description", content: "Контроль прострочених задач і планових активностей у CRM TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: TasksPage,
});

const KINDS: Record<string, string> = { call: "Дзвінок", meeting: "Зустріч", measure: "Замір", email: "Лист", other: "Інше" };
const PRIORITY: Record<string, string> = { low: "Низький", normal: "Звичайний", high: "Високий", critical: "Критичний" };
const empty = { id: "", title: "", kind: "call", description: "", due_at: "", priority: "normal", status: "open" };

function TasksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const saveFn = useServerFn(upsertTask);
  const delFn = useServerFn(deleteTask);
  const { data = [] } = useQuery({ queryKey: ["crm", "tasks"], queryFn: () => listFn() });
  const [tab, setTab] = useState<"overdue" | "today" | "open" | "done">("overdue");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const now = Date.now();
  const groups = useMemo(() => {
    const arr = data as any[];
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return {
      overdue: arr.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now),
      today: arr.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() >= now && new Date(t.due_at).getTime() <= endOfDay.getTime()),
      open: arr.filter((t) => t.status === "open"),
      done: arr.filter((t) => t.status !== "open"),
    };
  }, [data, now]);

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: {
      id: p.id || undefined, title: p.title, kind: p.kind, description: p.description || null,
      due_at: p.due_at ? new Date(p.due_at).toISOString() : null, priority: p.priority, status: p.status,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm"] }); setOpen(false); setForm(empty); toast.success("Задачу збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm"] }); toast.success("Задачу видалено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка видалення"),
  });

  const rows = groups[tab];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><ListTodo className="w-6 h-6" /> Задачі</h1>
            <p className="text-sm text-muted-foreground">Прострочені та планові активності</p>
          </div>
          <button onClick={() => { setForm(empty); setOpen(true); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2">
            <Plus className="w-4 h-4" /> Нова задача
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {([["overdue", `Прострочені (${groups.overdue.length})`], ["today", `Сьогодні (${groups.today.length})`], ["open", `Відкриті (${groups.open.length})`], ["done", `Завершені (${groups.done.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
        </div>

        <div className="space-y-2">
          {rows.map((t: any) => {
            const overdue = t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now;
            return (
              <div key={t.id} className={`rounded-xl border bg-card p-3 flex items-start gap-3 ${overdue ? "border-destructive/50" : "border-border"}`}>
                <button title="Завершити" onClick={() => save.mutate({ ...t, due_at: t.due_at ? t.due_at.slice(0, 16) : "", status: t.status === "open" ? "done" : "open" })}
                  className={`mt-0.5 ${t.status === "done" ? "text-primary" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{KINDS[t.kind] ?? t.kind}</span>
                    <span>· {PRIORITY[t.priority]}</span>
                    {t.due_at ? <span className={overdue ? "text-destructive font-semibold flex items-center gap-1" : ""}>
                      {overdue ? <AlertTriangle className="w-3 h-3" /> : null}
                      {new Date(t.due_at).toLocaleString("uk-UA")}
                    </span> : null}
                  </div>
                  {t.description ? <div className="text-xs text-muted-foreground mt-1">{t.description}</div> : null}
                </div>
                <button onClick={() => { setForm({ ...empty, ...t, due_at: t.due_at ? t.due_at.slice(0, 16) : "" }); setOpen(true); }}
                  className="text-xs font-semibold px-2 py-1">Ред.</button>
                <button onClick={() => remove.mutate(t.id)} className="p-1 text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {!rows.length ? <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Задач немає</div> : null}
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-md bg-card rounded-t-2xl md:rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold">{form.id ? "Редагувати задачу" : "Нова задача"}</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Назва</span>
              <input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Тип</span>
                <select className={inp} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Пріоритет</span>
                <select className={inp} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Дедлайн</span>
              <input type="datetime-local" className={inp} value={form.due_at ?? ""} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Опис</span>
              <textarea rows={3} className={inp} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
              <button disabled={save.isPending || !form.title.trim()} onClick={() => save.mutate(form)}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Зберегти</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
