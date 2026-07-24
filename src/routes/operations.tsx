import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Filter, Plus, Pencil, Trash2, X, Users, LayoutGrid } from "lucide-react";
import { getOperationsSchedule, listManagers } from "@/lib/operations.functions";
import { listBookings, upsertBooking, deleteBooking } from "@/lib/bookings.functions";
import { BRIGADES, findBrigade } from "@/lib/brigades";

export const Route = createFileRoute("/operations")({
  component: OperationsPage,
  head: () => ({
    meta: [
      { title: "Операційний календар · TERZI" },
      { name: "description", content: "План бригад і кошторисів по тижнях" },
    ],
  }),
});

const MODULES = [
  { key: "screed",     label: "Стяжка",    color: "bg-blue-50 border-blue-200 text-blue-800",        dot: "bg-blue-500" },
  { key: "roofing",    label: "Покрівля",  color: "bg-orange-50 border-orange-200 text-orange-800",  dot: "bg-orange-500" },
  { key: "insulation", label: "Утеплення", color: "bg-amber-50 border-amber-200 text-amber-800",     dot: "bg-amber-500" },
  { key: "demolition", label: "Демонтаж",  color: "bg-rose-50 border-rose-200 text-rose-800",        dot: "bg-rose-500" },
] as const;

const STATUSES = ["preliminary", "afterMeasure", "final", "inWork", "done", "refused", "draft", "sent", "approved", "archived"] as const;
const STATUS_LABEL: Record<string, string> = {
  preliminary: "Поперед.", afterMeasure: "Після заміру", final: "Фінал.",
  inWork: "В роботі", done: "Завершено", refused: "Відмова",
  draft: "Чернетка", sent: "Надіслано", approved: "Затв.", archived: "Архів",
};

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function getMonday(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay() || 7;
  x.setDate(x.getDate() - (dow - 1));
  return x;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const today = new Date();

  const { data: managers = [] } = useQuery({ queryKey: ["managers"], queryFn: () => getManagers() });

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["ops", weekStart.toISOString(), managerId, statuses.join(",")],
    queryFn: () => getSchedule({ data: {
      weekStartISO: weekStart.toISOString(),
      managerId: managerId || null,
      statuses,
    } }),
  });

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

  const weekRangeLabel = `${weekStart.toLocaleDateString("uk-UA", { day: "2-digit", month: "long" })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" })}`;

  // KPIs
  const totalEstimates = (rows as any[]).length;
  const totalBookings = (bookings as any[]).length;
  const activeBrigades = new Set((bookings as any[]).map((b) => b.brigade_key)).size;

  return (
    <div className="p-3 sm:p-4 md:p-8 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:flex md:flex-wrap md:items-end md:justify-between md:gap-4">
        <div className="min-w-0">
          <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Планування</div>
          <h1 className="text-lg sm:text-2xl md:text-3xl font-black flex items-center gap-2 md:gap-3 mt-1">
            <span className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <CalIcon className="w-4 h-4 md:w-5 md:h-5" />
            </span>
            <span className="truncate">Операційний календар</span>
          </h1>
          <div className="text-xs md:text-sm text-muted-foreground mt-1 capitalize truncate">{weekRangeLabel}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-4 pr-4 mr-2 border-r border-border text-xs">
            <div><div className="text-muted-foreground">Кошториси</div><div className="font-black text-lg text-foreground leading-none mt-0.5">{totalEstimates}</div></div>
            <div><div className="text-muted-foreground">Заплановано</div><div className="font-black text-lg text-foreground leading-none mt-0.5">{totalBookings}</div></div>
            <div><div className="text-muted-foreground">Бригад</div><div className="font-black text-lg text-foreground leading-none mt-0.5">{activeBrigades}/{BRIGADES.length}</div></div>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border bg-panel shadow-sm overflow-hidden">
            <button onClick={() => shift(-1)} className="p-2 hover:bg-secondary transition"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setWeekStart(getMonday())} className="px-2 md:px-3 py-2 text-[11px] md:text-xs font-semibold border-x border-border hover:bg-secondary transition whitespace-nowrap">Цей тиждень</button>
            <button onClick={() => shift(1)} className="p-2 hover:bg-secondary transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Mobile KPI strip */}
      <div className="lg:hidden grid grid-cols-3 gap-2 text-center">
        <div className="panel px-2 py-2"><div className="text-[10px] uppercase text-muted-foreground">Кошториси</div><div className="font-black text-base">{totalEstimates}</div></div>
        <div className="panel px-2 py-2"><div className="text-[10px] uppercase text-muted-foreground">Заплановано</div><div className="font-black text-base">{totalBookings}</div></div>
        <div className="panel px-2 py-2"><div className="text-[10px] uppercase text-muted-foreground">Бригад</div><div className="font-black text-base">{activeBrigades}/{BRIGADES.length}</div></div>
      </div>


      {/* Filters */}
      <div className="panel p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" /> Фільтри
        </div>
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)}
          className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs hover:border-primary/40 transition">
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
                className={`px-2 py-1 rounded-md border text-[10px] uppercase tracking-wider font-semibold transition ${on ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
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
                className={`px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition ${hidden ? "opacity-40 bg-background border-border" : `${m.color}`}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule grid — estimates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider inline-flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" /> Кошториси у графіку
          </h2>
          <div className="text-[11px] text-muted-foreground">Клікайте картку, щоб відкрити в історії</div>
        </div>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0 min-w-[960px]">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 w-40 border-b border-border bg-secondary/40 sticky left-0 z-10">Модуль</th>
                  {days.map((d) => {
                    const isToday = isSameDay(d, today);
                    return (
                      <th key={d.toISOString()} className={`text-left px-3 py-2.5 border-b border-border min-w-[130px] ${isToday ? "bg-primary/5" : "bg-secondary/40"}`}>
                        <div className={`text-[10px] uppercase tracking-widest ${isToday ? "text-primary font-black" : "text-muted-foreground font-semibold"}`}>
                          {DOW[(d.getDay() + 6) % 7]}
                        </div>
                        <div className={`text-sm mt-0.5 ${isToday ? "font-black text-primary" : "font-bold text-foreground"}`}>
                          {d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {cellRows.map((m, ri) => (
                  <tr key={m.key} className={ri % 2 ? "bg-secondary/20" : ""}>
                    <td className="px-3 py-2 align-top border-b border-border sticky left-0 bg-inherit z-10">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider ${m.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                        {m.label}
                      </span>
                    </td>
                    {days.map((d) => {
                      const isToday = isSameDay(d, today);
                      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
                      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
                      const items = (rows as any[]).filter((r) => r.module === m.key
                        && new Date(r.schedule_start_at) <= dayEnd
                        && new Date(r.schedule_end_at) >= dayStart);
                      return (
                        <td key={d.toISOString()} className={`px-2 py-2 align-top border-b border-l border-border min-h-[84px] ${isToday ? "bg-primary/[0.03]" : ""}`}>
                          <div className="space-y-1.5">
                            {items.length === 0 && <div className="text-[10px] text-muted-foreground/40 italic">—</div>}
                            {items.map((r) => (
                              <Link key={r.id} to="/history"
                                className={`block p-2 rounded-md border ${m.color} hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                                <div className="font-bold text-[11px] truncate text-foreground">{r.client_name || "Клієнт"}</div>
                                <div className="text-[10px] truncate text-muted-foreground">{r.address || "—"}</div>
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-current/10">
                                  <span className="text-[9px] uppercase tracking-wider opacity-70">{STATUS_LABEL[r.status] ?? r.status}</span>
                                  {r.area && <span className="text-[9px] font-mono font-bold">{r.area} м²</span>}
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
        </div>
      </section>

      {/* Brigade planning grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> План бригад
          </h2>
          <div className="text-[11px] text-muted-foreground">Натисніть «+» у клітинці щоб додати запис</div>
        </div>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0 min-w-[960px]">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 w-44 border-b border-border bg-secondary/40 sticky left-0 z-10">Бригада</th>
                  {days.map((d) => {
                    const isToday = isSameDay(d, today);
                    return (
                      <th key={d.toISOString()} className={`text-left px-3 py-2.5 border-b border-border min-w-[130px] ${isToday ? "bg-primary/5" : "bg-secondary/40"}`}>
                        <div className={`text-[10px] uppercase tracking-widest ${isToday ? "text-primary font-black" : "text-muted-foreground font-semibold"}`}>
                          {DOW[(d.getDay() + 6) % 7]}
                        </div>
                        <div className={`text-sm mt-0.5 ${isToday ? "font-black text-primary" : "font-bold text-foreground"}`}>
                          {d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {BRIGADES.map((b, ri) => (
                  <tr key={b.key} className={ri % 2 ? "bg-secondary/20" : ""}>
                    <td className="px-3 py-2 align-top border-b border-border sticky left-0 bg-inherit z-10">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-bold text-[11px] uppercase tracking-wider ${b.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
                        {b.label}
                      </span>
                    </td>
                    {days.map((d) => {
                      const isToday = isSameDay(d, today);
                      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      const cell = (bookings as any[]).filter((x) => x.brigade_key === b.key && x.date === iso);
                      return (
                        <td key={iso} className={`px-2 py-2 align-top border-b border-l border-border ${isToday ? "bg-primary/[0.03]" : ""}`}>
                          <div className="space-y-1.5">
                            {cell.map((x) => (
                              <div key={x.id} className={`p-2 rounded-md border ${b.color} group relative hover:shadow-md transition-all`}>
                                <div className="font-bold text-[11px] truncate text-foreground">{x.title}</div>
                                {x.client && <div className="text-[10px] truncate text-muted-foreground">{x.client}</div>}
                                {x.address && <div className="text-[10px] truncate opacity-70">{x.address}</div>}
                                <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={() => openEdit(x)} className="p-1 rounded bg-background/80 border border-border hover:bg-background shadow-sm"><Pencil className="w-3 h-3" /></button>
                                  <button onClick={() => { if (confirm("Видалити запис?")) delMut.mutate(x.id); }} className="p-1 rounded bg-background/80 border border-border hover:bg-background text-destructive shadow-sm"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            ))}
                            <button onClick={() => openNew(b.key, d)}
                              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition">
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
      </section>

      {isFetching && <div className="text-xs text-muted-foreground">Завантаження…</div>}

      {editor && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditor(null)}>
          <div className="panel p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-black uppercase tracking-wider text-sm">
                {editor.id ? "Редагувати запис" : "Новий запис"}
              </div>
              <button onClick={() => setEditor(null)} className="p-1 rounded hover:bg-secondary"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${findBrigade(editor.brigade_key)?.color ?? ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${findBrigade(editor.brigade_key)?.dot ?? "bg-muted"}`} />
                {findBrigade(editor.brigade_key)?.label}
              </span>
              · {new Date(editor.date).toLocaleDateString("uk-UA", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Назва / опис робіт *</div>
              <input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 focus:border-primary outline-none" placeholder="напр. Стяжка 120 м²" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <div className="font-semibold mb-1">Клієнт</div>
                <input value={editor.client} onChange={(e) => setEditor({ ...editor, client: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 focus:border-primary outline-none" />
              </label>
              <label className="block text-xs">
                <div className="font-semibold mb-1">Адреса</div>
                <input value={editor.address} onChange={(e) => setEditor({ ...editor, address: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 focus:border-primary outline-none" />
              </label>
            </div>
            <label className="block text-xs">
              <div className="font-semibold mb-1">Нотатки</div>
              <textarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 min-h-[70px] focus:border-primary outline-none" />
            </label>
            <div className="flex justify-between gap-2 pt-2 border-t border-border">
              {editor.id ? (
                <button onClick={() => { if (confirm("Видалити запис?")) { delMut.mutate(editor.id!); setEditor(null); } }}
                  className="px-3 py-1.5 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10 transition">Видалити</button>
              ) : <span />}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setEditor(null)} className="px-3 py-1.5 rounded-md bg-secondary text-xs font-semibold hover:bg-secondary/70 transition">Скасувати</button>
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
                  className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:shadow-md disabled:opacity-50 transition">
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
