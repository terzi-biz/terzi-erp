import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, X, Trash2, CheckCircle2, AlertTriangle, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listTasks, upsertTask, deleteTask } from "@/lib/crm.functions";
import { listCrmStaff } from "@/lib/crm/board.functions";

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
const empty: any = { id: "", title: "", kind: "call", description: "", due_at: "", remind_at: "", priority: "normal", status: "open", assigned_to: "", co_assignees: [] as string[] };
const REMIND: [string, string][] = [["", "Без нагадування"], ["0", "У момент дедлайну"], ["15", "За 15 хв"], ["60", "За 1 год"], ["1440", "За 1 день"], ["custom", "Своя дата"]];
const toLocal = (v?: string | null) => { if (!v) return ""; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function TasksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const saveFn = useServerFn(upsertTask);
  const delFn = useServerFn(deleteTask);
  const { data = [] } = useQuery({ queryKey: ["crm", "tasks"], queryFn: () => listFn() });
  const staffFn = useServerFn(listCrmStaff);
  const { data: staffRaw } = useQuery({ queryKey: ["crm", "staff"], queryFn: () => staffFn(), staleTime: 300_000 });
  const staff = ((staffRaw as any[]) ?? []).map((u: any) => ({ id: u.user_id ?? u.id, name: u.display_name ?? u.name ?? u.email ?? "—" })).filter((u) => u.id);
  const nameOf = (id?: string | null) => staff.find((u) => u.id === id)?.name ?? "";
  const [remindMode, setRemindMode] = useState("");
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
      assigned_to: p.assigned_to || undefined, co_assignees: p.co_assignees ?? [],
      remind_at: p._remind === undefined ? (p.remind_at ? new Date(p.remind_at).toISOString() : null) : p._remind,
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
          <button onClick={() => { setForm(empty); setRemindMode(""); setOpen(true); }}
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
                <button title="Завершити" onClick={() => save.mutate({ ...t, due_at: toLocal(t.due_at), remind_at: toLocal(t.remind_at), status: t.status === "open" ? "done" : "open" })}
                  className={`mt-0.5 ${t.status === "done" ? "text-primary" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{KINDS[t.kind] ?? t.kind}</span>
                    <span>· {PRIORITY[t.priority]}</span>
                    {t.assigned_to && nameOf(t.assigned_to) ? <span>· {nameOf(t.assigned_to)}</span> : null}
                    {t.co_assignees?.length ? <span>· +{t.co_assignees.length} співвик.</span> : null}
                    {t.remind_at ? <span>· 🔔 {new Date(t.remind_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> : null}
                    {t.due_at ? <span className={overdue ? "text-destructive font-semibold flex items-center gap-1" : ""}>
                      {overdue ? <AlertTriangle className="w-3 h-3" /> : null}
                      {new Date(t.due_at).toLocaleString("uk-UA")}
                    </span> : null}
                  </div>
                  {t.description ? <div className="text-xs text-muted-foreground mt-1">{t.description}</div> : null}
                </div>
                <button onClick={() => { setForm({ ...empty, ...t, due_at: toLocal(t.due_at), remind_at: toLocal(t.remind_at), co_assignees: t.co_assignees ?? [] }); setRemindMode(t.remind_at ? "custom" : ""); setOpen(true); }}
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
          <div className="w-full md:max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-t-2xl md:rounded-2xl border border-border p-4 space-y-3">
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
              <span className="text-xs font-semibold text-muted-foreground">Нагадування</span>
              <select className={inp} value={remindMode} onChange={(e) => setRemindMode(e.target.value)}>
                {REMIND.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {remindMode === "custom" && <input type="datetime-local" className={inp} value={form.remind_at ?? ""} onChange={(e) => setForm({ ...form, remind_at: e.target.value })} />}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Відповідальний</span>
              <select className={inp} value={form.assigned_to ?? ""} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">Я</option>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Співвиконавці</span>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                {staff.filter((u) => u.id !== form.assigned_to).map((u) => {
                  const on = (form.co_assignees ?? []).includes(u.id);
                  return <button type="button" key={u.id} onClick={() => setForm({ ...form, co_assignees: on ? form.co_assignees.filter((x: string) => x !== u.id) : [...(form.co_assignees ?? []), u.id] })}
                    className={`rounded-full border px-2 py-1 text-[11px] ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{u.name}</button>;
                })}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Опис</span>
              <textarea rows={3} className={inp} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
              <button disabled={save.isPending || !form.title.trim()} onClick={() => {
                  let r: string | null = null;
                  if (remindMode === "custom") r = form.remind_at ? new Date(form.remind_at).toISOString() : null;
                  else if (remindMode !== "" && form.due_at) r = new Date(new Date(form.due_at).getTime() - Number(remindMode) * 60000).toISOString();
                  save.mutate({ ...form, _remind: r });
                }}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Зберегти</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
