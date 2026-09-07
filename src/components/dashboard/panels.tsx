/**
 * Інтерактивні панелі приладової панелі: зведення по показнику (drill-down),
 * задачі на сьогодні/прострочені та автопідбір зв'язку «лід → клієнт».
 * Розрахунки не дублюються: дані беруться з серверних функцій аналітики й CRM.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAnalyticsDrilldown } from "@/lib/analytics.functions";
import { listTasks, upsertTask } from "@/lib/crm.functions";
import { suggestLeadClientMatches, linkLeadToClient } from "@/lib/lead-match.functions";
import { Check, Link2, Plus, AlertTriangle, CalendarClock } from "lucide-react";

const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const money = (n: number) => nf.format(Math.round(n)) + " ₴";
const dateFmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export type DrilldownMetric =
  | "leads" | "qualified" | "measurements" | "estimates" | "contracts" | "orders" | "payments" | "calls_missed"
  | "dq_leads_no_source" | "dq_leads_no_manager" | "dq_calls_unlinked" | "dq_measurements_no_surveyor"
  | "dq_estimates_no_order" | "dq_orders_no_amount";

/* ---------------- Drill-down ---------------- */

export function DrilldownDialog({
  metric, title, from, to, onClose,
}: { metric: DrilldownMetric | null; title: string; from: string; to: string; onClose: () => void }) {
  const fn = useServerFn(getAnalyticsDrilldown);
  const { data, isLoading } = useQuery({
    queryKey: ["dash", "drilldown", metric, from, to],
    queryFn: () => fn({ data: { metric: metric as DrilldownMetric, from, to, limit: 200 } }),
    enabled: !!metric,
  });
  const rows = (data ?? []) as Array<{ id: string; title: string; subtitle: string | null; date: string | null; amount: number | null; href: string | null }>;

  return (
    <Dialog open={!!metric} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Період: {from} — {to}. Показано до 200 записів.</p>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Завантаження…</div>
          ) : !rows.length ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Немає записів за період</div>
          ) : (
            <table className="w-full text-[12px]">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.title}</div>
                      {r.subtitle ? <div className="text-[11px] text-muted-foreground">{r.subtitle}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">{dateFmt(r.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{r.amount ? money(r.amount) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {r.href ? <Link to={r.href} className="text-[11px] font-semibold text-primary">Відкрити</Link> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Задачі ---------------- */

const todayIso = () => new Date().toISOString().slice(0, 10);

export function TasksPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const saveFn = useServerFn(upsertTask);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayIso());

  const { data } = useQuery({ queryKey: ["dash", "tasks"], queryFn: () => listFn({ data: {} }) });
  const tasks = (Array.isArray(data) ? data : []) as any[];

  const { today, overdue } = useMemo(() => {
    const t = todayIso();
    const open = tasks.filter((x) => x.status === "open" && x.due_at);
    return {
      today: open.filter((x) => String(x.due_at).slice(0, 10) === t),
      overdue: open.filter((x) => String(x.due_at).slice(0, 10) < t),
    };
  }, [tasks]);

  const save = useMutation({
    mutationFn: (v: { title: string; due_at: string }) =>
      saveFn({ data: { title: v.title, kind: "call", due_at: `${v.due_at}T09:00:00.000Z`, priority: "normal", status: "open" } }),
    onSuccess: () => {
      setTitle("");
      toast.success("Задачу створено");
      qc.invalidateQueries({ queryKey: ["dash", "tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити задачу"),
  });

  const done = useMutation({
    mutationFn: (t: any) => saveFn({ data: { id: t.id, title: t.title, kind: t.kind ?? "call", due_at: t.due_at, priority: t.priority ?? "normal", status: "done" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dash", "tasks"] }),
  });

  const Row = ({ t, tone }: { t: any; tone: "today" | "over" }) => (
    <div className="flex items-center gap-2 border-b border-border/60 py-1.5 text-[12px] last:border-0">
      <button
        onClick={() => done.mutate(t)}
        title="Виконано"
        className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Check className="h-3 w-3" />
      </button>
      <span className="flex-1 truncate">{t.title}</span>
      <span className={`shrink-0 text-[11px] ${tone === "over" ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
        {dateFmt(t.due_at)}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) save.mutate({ title: title.trim(), due_at: due }); }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Нова задача…"
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-[12px]"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
        />
        <button type="submit" disabled={save.isPending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-60">
          <Plus className="h-3.5 w-3.5" /> Додати
        </button>
      </form>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Прострочені ({overdue.length})
        </div>
        {overdue.length ? overdue.slice(0, 6).map((t) => <Row key={t.id} t={t} tone="over" />)
          : <div className="py-1 text-[12px] text-muted-foreground">Прострочених задач немає</div>}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> На сьогодні ({today.length})
        </div>
        {today.length ? today.slice(0, 6).map((t) => <Row key={t.id} t={t} tone="today" />)
          : <div className="py-1 text-[12px] text-muted-foreground">На сьогодні задач немає</div>}
      </div>
    </div>
  );
}

/* ---------------- Автопідбір зв'язку ліда ---------------- */

export function LeadMatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestLeadClientMatches);
  const linkFn = useServerFn(linkLeadToClient);

  const { data, isLoading } = useQuery({
    queryKey: ["dash", "lead-match"],
    queryFn: () => suggestFn({ data: { limit: 40, min_score: 20 } }),
    enabled: open,
  });

  const link = useMutation({
    mutationFn: (v: { lead_id: string; client_id: string }) => linkFn({ data: v }),
    onSuccess: () => {
      toast.success("Ліда прив'язано до клієнта");
      qc.invalidateQueries({ queryKey: ["dash", "lead-match"] });
      qc.invalidateQueries({ queryKey: ["dash", "overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося прив'язати"),
  });

  const rows = ((data ?? []) as any[]).filter((r) => r.candidates.length);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Автопідбір: лід → клієнт</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Збіги за телефоном, іменем, адресою та напрямком. Автоматична прив'язка не виконується — підтвердіть кандидата.
        </p>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Пошук кандидатів…</div>
          ) : !rows.length ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Кандидатів не знайдено</div>
          ) : rows.map((r) => (
            <div key={r.lead_id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[13px] font-bold">{r.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[r.phone, r.address, r.direction, r.source].filter(Boolean).join(" · ") || "без деталей"}
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {r.candidates.map((c: any) => (
                  <div key={c.client_id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold">{c.client_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {c.reasons.map((x: any) => x.note).join(" · ")}
                      </div>
                    </div>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{c.score}%</span>
                    <button
                      onClick={() => link.mutate({ lead_id: r.lead_id, client_id: c.client_id })}
                      disabled={link.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-60"
                    >
                      <Link2 className="h-3 w-3" /> Прив'язати
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
