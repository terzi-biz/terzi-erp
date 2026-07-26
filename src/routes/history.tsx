import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, ExternalLink, CalendarPlus, X, Pencil, History as HistoryIcon, CheckCircle2, GitBranch } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatUah } from "@/lib/screed-calc";
import {
  listEstimates, deleteEstimate, updateEstimateStatus, scheduleEstimate,
  updateEstimateFields, listEstimateAudit,
  approveEstimate, listEstimateVersions, forkEstimateFromVersion,
  ESTIMATE_STATUSES, STATUS_LABELS,
} from "@/lib/estimates.functions";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [
    { title: "Історія кошторисів — TERZI" },
    { name: "description", content: "Всі збережені кошториси TERZI: перегляд, редагування, зміна статусу, планування у календарі." },
    { property: "og:title", content: "Історія кошторисів — TERZI" },
    { property: "og:description", content: "Перегляд, редагування, зміна статусу та планування кошторисів TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: HistoryPage,
});

interface EstimateRow {
  id: string;
  number: string;
  created_at: string;
  module: string;
  status: string;
  client_name: string | null;
  address: string | null;
  area: number | null;
  total_client: number;
  margin_percent: number;
  manager_display: string | null;
  schedule_start_at: string | null;
  duration_override_days: number | null;
  duration_days: number | null;
}

const MODULE_LABEL: Record<string, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж",
};

const STATUS_CLS: Record<string, string> = {
  preliminary: "bg-muted text-muted-foreground",
  afterMeasure: "bg-warning/15 text-warning",
  final: "bg-primary/15 text-primary",
  inWork: "bg-blue-500/15 text-blue-700",
  done: "bg-success/15 text-success",
  refused: "bg-destructive/15 text-destructive",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  archived: "bg-muted text-muted-foreground",
};

function HistoryPage() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listEstimates);
  const del = useServerFn(deleteEstimate);
  const setStatus = useServerFn(updateEstimateStatus);
  const setSchedule = useServerFn(scheduleEstimate);
  const editFields = useServerFn(updateEstimateFields);
  const approve = useServerFn(approveEstimate);
  const forkFn = useServerFn(forkEstimateFromVersion);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["estimates"], queryFn: () => list(), enabled: !!user,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Видалено"); qc.invalidateQueries({ queryKey: ["estimates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => setStatus({ data: v as any }),
    onSuccess: () => {
      toast.success("Статус оновлено");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const scheduleMut = useMutation({
    mutationFn: (v: { id: string; startAtISO: string | null; durationDays: number | null }) =>
      setSchedule({ data: v }),
    onSuccess: () => {
      toast.success("Додано в календар");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["ops"] });
      qc.invalidateQueries({ queryKey: ["estimate-audit"] });
      setScheduleFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editMut = useMutation({
    mutationFn: (v: Record<string, any>) => editFields({ data: v as any }),
    onSuccess: () => {
      toast.success("Зміни збережено");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate-audit"] });
      setEditFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const approveMut = useMutation({
    mutationFn: (v: { id: string; note?: string; kind?: "approved" | "production" }) => approve({ data: v as any }),
    onSuccess: () => {
      toast.success("Версію створено");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate-versions"] });
      qc.invalidateQueries({ queryKey: ["estimate-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const forkMut = useMutation({
    mutationFn: (version_id: string) => forkFn({ data: { version_id } }),
    onSuccess: () => {
      toast.success("Копію створено як нову чернетку");
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [scheduleFor, setScheduleFor] = useState<EstimateRow | null>(null);
  const [editFor, setEditFor] = useState<EstimateRow | null>(null);
  const [logFor, setLogFor] = useState<EstimateRow | null>(null);
  const [versionsFor, setVersionsFor] = useState<EstimateRow | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-2xl md:text-3xl font-black mb-4 md:mb-6">{t("history")}</h1>
      <div className="panel scroll-x max-h-[calc(100vh-180px)] overflow-y-auto">
        <table className="w-full text-sm min-w-[1100px] sticky-thead">
          <thead className="bg-secondary text-secondary-foreground text-xs uppercase tracking-wider">

            <tr>
              <th className="text-left p-3">№</th>
              <th className="text-left p-3">Дата</th>
              <th className="text-left p-3">Модуль</th>
              <th className="text-left p-3">Клієнт</th>
              <th className="text-left p-3">Адреса</th>
              <th className="text-left p-3">Менеджер</th>
              <th className="text-left p-3">Статус</th>
              <th className="text-right p-3">Площа</th>
              <th className="text-right p-3">Сума</th>
              <th className="text-right p-3">Маржа</th>
              <th className="text-left p-3">Календар</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">Завантаження…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">Поки немає кошторисів</td></tr>
            )}
            {(rows as EstimateRow[]).map((e) => {
              const cls = STATUS_CLS[e.status] ?? "bg-secondary";
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{e.number}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString("uk-UA")}</td>
                  <td className="p-3">{MODULE_LABEL[e.module] ?? e.module}</td>
                  <td className="p-3">{e.client_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{e.address || "—"}</td>
                  <td className="p-3 text-xs">{e.manager_display || "—"}</td>
                  <td className="p-3">
                    <select
                      value={e.status}
                      onChange={(ev) => statusMut.mutate({ id: e.id, status: ev.target.value })}
                      className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded border border-border ${cls} outline-none`}
                    >
                      {ESTIMATE_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-right">{e.area ?? "—"} м²</td>
                  <td className="p-3 text-right font-bold text-primary whitespace-nowrap">{formatUah(Number(e.total_client))}</td>
                  <td className="p-3 text-right">{Number(e.margin_percent || 0).toFixed(1)}%</td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    {e.schedule_start_at
                      ? <span className="text-foreground">{new Date(e.schedule_start_at).toLocaleDateString("uk-UA")}
                          {(e.duration_override_days || e.duration_days) ? ` · ${e.duration_override_days || e.duration_days} дн` : ""}
                        </span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link
                        to={"/" + e.module as any}
                        search={{ estimate: e.id } as any}
                        className="p-1.5 rounded hover:bg-secondary text-primary"
                        title="Відкрити / редагувати"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => setEditFor(e)}
                        className="p-1.5 rounded hover:bg-secondary text-foreground"
                        title="Редагувати"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setScheduleFor(e)}
                        className="p-1.5 rounded hover:bg-secondary text-foreground"
                        title="Додати в календар"
                      >
                        <CalendarPlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setLogFor(e)}
                        className="p-1.5 rounded hover:bg-secondary text-foreground"
                        title="Журнал змін"
                      >
                        <HistoryIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => confirm(`Видалити ${e.number}?`) && delMut.mutate(e.id)}
                        className="p-1.5 rounded hover:bg-secondary text-destructive"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scheduleFor && (
        <ScheduleDialog
          row={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSubmit={(startISO, days) => scheduleMut.mutate({ id: scheduleFor.id, startAtISO: startISO, durationDays: days })}
          onClear={() => scheduleMut.mutate({ id: scheduleFor.id, startAtISO: null, durationDays: null })}
          pending={scheduleMut.isPending}
        />
      )}

      {editFor && (
        <EditDialog
          row={editFor}
          onClose={() => setEditFor(null)}
          onSubmit={(patch, note) => editMut.mutate({ id: editFor.id, ...patch, note })}
          pending={editMut.isPending}
        />
      )}

      {logFor && (
        <AuditLogDialog row={logFor} onClose={() => setLogFor(null)} />
      )}
    </div>
  );
}

function ScheduleDialog({
  row, onClose, onSubmit, onClear, pending,
}: {
  row: EstimateRow;
  onClose: () => void;
  onSubmit: (iso: string, days: number) => void;
  onClear: () => void;
  pending: boolean;
}) {
  const initialDate = row.schedule_start_at
    ? new Date(row.schedule_start_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate);
  const [days, setDays] = useState<number>(Number(row.duration_override_days || row.duration_days || 1));
  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4" onClick={onClose}>
      <div className="panel p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">Додати в календар</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          <div><b>{row.number}</b> · {row.client_name || "—"}</div>
          <div>{row.address || ""}</div>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Дата початку</span>
            <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Тривалість (днів)</span>
            <input type="number" min={1} step={1} className={inp} value={days}
              onChange={(e) => setDays(Number(e.target.value) || 1)} />
          </label>
        </div>
        <div className="mt-5 flex justify-between gap-2">
          <button onClick={onClear} disabled={pending}
            className="px-3 py-2 rounded bg-secondary text-xs font-semibold text-destructive disabled:opacity-50">
            Прибрати з календаря
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded bg-secondary text-xs font-semibold">Скасувати</button>
            <button
              disabled={pending || !date || !days}
              onClick={() => onSubmit(new Date(date + "T09:00:00").toISOString(), days)}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type EditPatch = {
  number?: string;
  client_name?: string | null;
  client_phone?: string | null;
  address?: string | null;
  manager?: string | null;
  area?: number | null;
  thickness_cm?: number | null;
  total_client?: number;
};

function EditDialog({
  row, onClose, onSubmit, pending,
}: {
  row: EstimateRow;
  onClose: () => void;
  onSubmit: (patch: EditPatch, note: string) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    number: row.number,
    client_name: row.client_name ?? "",
    address: row.address ?? "",
    area: row.area != null ? String(row.area) : "",
    total_client: String(row.total_client ?? 0),
  });
  const [note, setNote] = useState("");
  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4" onClick={onClose}>
      <div className="panel p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">Редагувати кошторис</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block md:col-span-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Номер</span>
            <input className={inp} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
          </label>
          <label className="block md:col-span-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Площа, м²</span>
            <input type="number" min={0} step="0.01" className={inp} value={f.area}
              onChange={(e) => setF({ ...f, area: e.target.value })} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Клієнт</span>
            <input className={inp} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Адреса</span>
            <input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </label>
          <label className="block md:col-span-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Сума клієнту, ₴</span>
            <input type="number" min={0} step="0.01" className={inp} value={f.total_client}
              onChange={(e) => setF({ ...f, total_client: e.target.value })} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Коментар до змін (журнал)</span>
            <input className={inp} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Опційно: причина правки" />
          </label>
        </div>
        <div className="text-[11px] text-muted-foreground mt-3">
          Позиції та розрахунок редагуйте у калькуляторі (кнопка «Відкрити»). Тут — лише мета-дані.
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded bg-secondary text-xs font-semibold">Скасувати</button>
          <button
            disabled={pending || !f.number.trim()}
            onClick={() => {
              const patch: EditPatch = {
                number: f.number.trim(),
                client_name: f.client_name.trim() || null,
                address: f.address.trim() || null,
                area: f.area === "" ? null : Number(f.area),
                total_client: Number(f.total_client) || 0,
              };
              onSubmit(patch, note.trim());
            }}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditLogDialog({ row, onClose }: { row: EstimateRow; onClose: () => void }) {
  const loadLog = useServerFn(listEstimateAudit);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["estimate-audit", row.id],
    queryFn: () => loadLog({ data: { estimate_id: row.id } }),
  });

  const ACTION_LABEL: Record<string, string> = {
    created: "Створено",
    updated: "Оновлено",
    edited_in_history: "Редагування в історії",
    status_changed: "Зміна статусу",
    scheduled: "Заплановано",
    schedule_cleared: "Знято з календаря",
    deleted: "Видалено",
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4" onClick={onClose}>
      <div className="panel p-6 max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">Журнал змін · {row.number}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="text-center text-muted-foreground py-6">Завантаження…</div>}
          {!isLoading && entries.length === 0 && (
            <div className="text-center text-muted-foreground py-6">Змін ще не було</div>
          )}
          <ul className="space-y-3">
            {(entries as any[]).map((r) => (
              <li key={r.id} className="border border-border rounded p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">{ACTION_LABEL[r.action] ?? r.action}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("uk-UA")} · {r.actor_name || "—"}
                  </span>
                </div>
                {r.changes && Object.keys(r.changes).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(r.changes).map(([k, v]: [string, any]) => {
                      if (k === "note") {
                        return <div key={k} className="text-xs italic text-muted-foreground">Коментар: {String(v)}</div>;
                      }
                      if (v && typeof v === "object" && "from" in v && "to" in v) {
                        return (
                          <div key={k} className="text-xs">
                            <span className="text-muted-foreground">{k}:</span>{" "}
                            <span className="line-through text-destructive/70">{fmtVal(v.from)}</span>{" → "}
                            <span className="text-success font-semibold">{fmtVal(v.to)}</span>
                          </div>
                        );
                      }
                      return <div key={k} className="text-xs"><span className="text-muted-foreground">{k}:</span> {fmtVal(v)}</div>;
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try { return new Date(v).toLocaleString("uk-UA"); } catch { return v; }
    }
    return v;
  }
  return JSON.stringify(v);
}
