import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Filter, Plus, Pencil, Trash2, X } from "lucide-react";
import { getOperationsSchedule, listManagers } from "@/lib/operations.functions";
import { listBookings, upsertBooking, deleteBooking } from "@/lib/bookings.functions";
import { BRIGADES, findBrigade } from "@/lib/brigades";

export const Route = createFileRoute("/operations")({
  component: OperationsPage,
});

const MODULES = [
  { key: "screed", label: "Стяжка", color: "bg-blue-500/15 border-blue-500/40 text-blue-700" },
  { key: "roofing", label: "Покрівля", color: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700" },
  { key: "insulation", label: "Утеплення", color: "bg-amber-500/15 border-amber-500/40 text-amber-800" },
  { key: "demolition", label: "Демонтаж", color: "bg-rose-500/15 border-rose-500/40 text-rose-700" },
] as const;

const STATUSES = ["preliminary", "afterMeasure", "final", "inWork", "done", "refused", "draft", "sent", "approved", "archived"] as const;
const STATUS_LABEL: Record<string, string> = {
  preliminary: "Поперед.", afterMeasure: "Після заміру", final: "Фінал.",
  inWork: "В роботі", done: "Завершено", refused: "Відмова",
  draft: "Чернетка", sent: "Надіслано", approved: "Затв.", archived: "Архів",
};

function getMonday(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay() || 7; // Sun=7
  x.setDate(x.getDate() - (dow - 1));
  return x;
}

function OperationsPage() {
  const [weekStart, setWeekStart] = useState<Date>(getMonday());
  const [managerId, setManagerId] = useState<string>("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);

  const getSchedule = useServerFn(getOperationsSchedule);
  const getManagers = useServerFn(listManagers);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const { data: managers = [] } = useQuery({
    queryKey: ["managers"],
    queryFn: () => getManagers(),
  });

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["ops", weekStart.toISOString(), managerId, statuses.join(",")],
    queryFn: () => getSchedule({ data: {
      weekStartISO: weekStart.toISOString(),
      managerId: managerId || null,
      statuses,
    } }),
  });

  // ---- Brigade bookings ----
  const qc = useQueryClient();
  const fetchBookings = useServerFn(listBookings);
  const saveBooking = useServerFn(upsertBooking);
  const removeBooking = useServerFn(deleteBooking);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d;
  }, [weekStart]);

  const bookingsKey = ["bookings", weekStart.toISOString()];
  const { data: bookings = [] } = useQuery({
    queryKey: bookingsKey,
    queryFn: () => fetchBookings({ data: { fromISO: weekStart.toISOString(), toISO: weekEnd.toISOString() } }),
  });

  const [editor, setEditor] = useState<null | {
    id?: string; brigade_key: string; date: string;
    title: string; client: string; address: string; notes: string;
  }>(null);

  const saveMut = useMutation({
    mutationFn: (input: any) => saveBooking({ data: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: bookingsKey }); setEditor(null); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => removeBooking({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingsKey }),
  });

  function openNew(brigadeKey: string, date: Date) {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setEditor({ brigade_key: brigadeKey, date: iso, title: "", client: "", address: "", notes: "" });
  }
  function openEdit(b: any) {
    setEditor({
      id: b.id, brigade_key: b.brigade_key, date: b.date,
      title: b.title ?? "", client: b.client ?? "", address: b.address ?? "", notes: b.notes ?? "",
    });
  }

  const cellRows = MODULES.filter((m) => !hiddenModules.includes(m.key));

  function shift(d: number) {
    const x = new Date(weekStart); x.setDate(x.getDate() + d * 7); setWeekStart(x);
  }

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <CalIcon className="w-5 h-5 text-primary" /> Операційний календар
          </h1>
          <div className="text-xs text-muted-foreground mt-1">
            План виконання робіт по всіх модулях. Тиждень: {weekStart.toLocaleDateString("uk-UA")} – {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("uk-UA")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-2 rounded bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setWeekStart(getMonday())} className="px-3 py-2 rounded bg-secondary text-xs font-semibold">Сьогодні</button>
          <button onClick={() => shift(1)} className="p-2 rounded bg-secondary"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground font-semibold uppercase tracking-wide">
          <Filter className="w-3 h-3" /> Фільтри:
        </div>
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5">
          <option value="">Усі менеджери</option>
          {managers.map((m: any) => (
            <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => {
            const on = statuses.includes(s);
            return (
              <button key={s} onClick={() => setStatuses((p) => on ? p.filter((x) => x !== s) : [...p, s])}
                className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider font-semibold ${on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border"}`}>
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1 ml-auto">
          {MODULES.map((m) => {
            const hidden = hiddenModules.includes(m.key);
            return (
              <button key={m.key} onClick={() => setHiddenModules((p) => hidden ? p.filter((x) => x !== m.key) : [...p, m.key])}
                className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider font-semibold ${hidden ? "opacity-40 bg-secondary border-border" : `${m.color} border`}`}>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="panel overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-secondary/60">
              <th className="text-left p-2 w-32 border-b border-border">Модуль</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="text-left p-2 border-b border-border min-w-[120px]">
                  <div className="font-bold">{["Пн","Вт","Ср","Чт","Пт","Сб","Нд"][(d.getDay() + 6) % 7]}</div>
                  <div className="text-[10px] text-muted-foreground">{d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cellRows.map((m) => (
              <tr key={m.key} className="border-b border-border">
                <td className={`p-2 align-top font-bold uppercase text-[11px] tracking-wider`}>
                  <span className={`inline-block px-2 py-1 rounded border ${m.color}`}>{m.label}</span>
                </td>
                {days.map((d) => {
                  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
                  const items = (rows as any[]).filter((r) => r.module === m.key
                    && new Date(r.schedule_start_at) <= dayEnd
                    && new Date(r.schedule_end_at) >= dayStart);
                  return (
                    <td key={d.toISOString()} className="p-1.5 align-top border-l border-border min-h-[80px]">
                      <div className="space-y-1">
                        {items.length === 0 && <div className="text-[10px] text-muted-foreground/40">—</div>}
                        {items.map((r) => (
                          <Link key={r.id} to="/history"
                            className={`block p-1.5 rounded border ${m.color} hover:shadow-md transition-shadow`}>
                            <div className="font-bold text-[11px] truncate">{r.client_name || "Клієнт"}</div>
                            <div className="text-[10px] truncate">{r.address || "—"}</div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[9px] uppercase tracking-wider">{STATUS_LABEL[r.status] ?? r.status}</span>
                              {r.area && <span className="text-[9px] font-mono">{r.area} м²</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Brigade planning grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm md:text-base font-black uppercase tracking-wider">План бригад</h2>
          <div className="text-[10px] text-muted-foreground">Натисни «+» у клітинці щоб додати запис</div>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-secondary/60">
                <th className="text-left p-2 w-40 border-b border-border">Бригада</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="text-left p-2 border-b border-border min-w-[120px]">
                    <div className="font-bold">{["Пн","Вт","Ср","Чт","Пт","Сб","Нд"][(d.getDay() + 6) % 7]}</div>
                    <div className="text-[10px] text-muted-foreground">{d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BRIGADES.map((b) => (
                <tr key={b.key} className="border-b border-border">
                  <td className="p-2 align-top">
                    <span className={`inline-block px-2 py-1 rounded border font-bold text-[11px] uppercase tracking-wider ${b.color}`}>{b.label}</span>
                  </td>
                  {days.map((d) => {
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const cell = (bookings as any[]).filter((x) => x.brigade_key === b.key && x.date === iso);
                    return (
                      <td key={iso} className="p-1.5 align-top border-l border-border">
                        <div className="space-y-1">
                          {cell.map((x) => (
                            <div key={x.id} className={`p-1.5 rounded border ${b.color} group relative`}>
                              <div className="font-bold text-[11px] truncate">{x.title}</div>
                              {x.client && <div className="text-[10px] truncate">{x.client}</div>}
                              {x.address && <div className="text-[10px] truncate opacity-80">{x.address}</div>}
                              <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
                                <button onClick={() => openEdit(x)} className="p-0.5 rounded bg-background/70 hover:bg-background"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => { if (confirm("Видалити запис?")) delMut.mutate(x.id); }} className="p-0.5 rounded bg-background/70 hover:bg-background text-red-600"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => openNew(b.key, d)}
                            className="w-full flex items-center justify-center gap-1 p-1 rounded border border-dashed border-border text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition">
                            <Plus className="w-3 h-3" /> додати
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isFetching && <div className="text-xs text-muted-foreground">Завантаження…</div>}

      {/* Editor modal */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditor(null)}>
          <div className="panel p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-black uppercase tracking-wider text-sm">
                {editor.id ? "Редагувати запис" : "Новий запис"}
              </div>
              <button onClick={() => setEditor(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {findBrigade(editor.brigade_key)?.label} · {new Date(editor.date).toLocaleDateString("uk-UA")}
            </div>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Назва / опис робіт *</div>
              <input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5" placeholder="напр. Стяжка 120 м²" />
            </label>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Клієнт</div>
              <input value={editor.client} onChange={(e) => setEditor({ ...editor, client: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5" />
            </label>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Адреса</div>
              <input value={editor.address} onChange={(e) => setEditor({ ...editor, address: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5" />
            </label>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Нотатки</div>
              <textarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 min-h-[60px]" />
            </label>
            <div className="flex justify-between gap-2 pt-2">
              {editor.id ? (
                <button onClick={() => { if (confirm("Видалити запис?")) { delMut.mutate(editor.id!); setEditor(null); } }}
                  className="px-3 py-1.5 rounded border border-red-500/50 text-red-600 text-xs font-semibold">Видалити</button>
              ) : <span />}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setEditor(null)} className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold">Скасувати</button>
                <button
                  disabled={!editor.title.trim() || saveMut.isPending}
                  onClick={() => saveMut.mutate({
                    id: editor.id,
                    brigade_key: editor.brigade_key,
                    date: editor.date,
                    title: editor.title.trim(),
                    client: editor.client.trim() || null,
                    address: editor.address.trim() || null,
                    notes: editor.notes.trim() || null,
                  })}
                  className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                  Зберегти
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
