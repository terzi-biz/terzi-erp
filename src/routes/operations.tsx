import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Filter, Plus, Trash2, X, Users,
  Search, AlertTriangle, Bell, ListChecks, HardHat, Check, Play, Clock, MapPin, Building2, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { getOperationsSchedule } from "@/lib/operations.functions";
import { listBookings, upsertBooking, deleteBooking } from "@/lib/bookings.functions";
import { BRIGADES, findBrigade } from "@/lib/brigades";
import {
  listCalendarEvents, upsertCalendarEvent, deleteCalendarEvent,
  moveCalendarEvent, setCalendarEventStatus, listEmployees, listCalendarObjects,
} from "@/lib/calendar.functions";
import {
  DIRECTIONS, EVENT_TYPES, EVENT_CATEGORIES, EVENT_STATUSES, PRIORITIES, DEPARTMENTS,
  eventColor, eventTypeLabel, statusLabel, categoryOfType, departmentLabel,
} from "@/lib/calendar-taxonomy";

export const Route = createFileRoute("/operations")({
  component: OperationsPage,
  head: () => ({
    meta: [
      { title: "Операційний календар TERZI — планування робіт і працівників" },
      { name: "description", content: "Планування замірів, робіт, працівників і ресурсів TERZI: тижнева сітка, бригади, події співробітників, конфлікти та нагадування." },
      { property: "og:title", content: "Операційний календар TERZI" },
      { property: "og:description", content: "Планування замірів, робіт, працівників і ресурсів TERZI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ViewMode = "day" | "week" | "month" | "agenda" | "crews" | "employees";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00–20:00
const HOUR_PX = 56;

function getMonday(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay() || 7; x.setDate(x.getDate() - (dow - 1)); return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localInput(iso: string) {
  const d = new Date(iso);
  return `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Ev {
  id: string; title: string; event_type: string; category: string; direction: string | null;
  status: string; priority: string; starts_at: string; ends_at: string; all_day: boolean;
  address: string | null; client_name: string | null; area: number | null; description: string | null;
  employee_id: string | null; crew_key: string | null; object_id: string | null;
  estimate_id: string | null; responsible_user_id: string | null; participants: string[] | null;
}

function OperationsPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"queue" | "reminders" | "conflicts">("queue");
  const [openEvent, setOpenEvent] = useState<Ev | null>(null);
  const [editor, setEditor] = useState<Partial<Ev> | null>(null);
  const [bookingEditor, setBookingEditor] = useState<any>(null);

  const [f, setF] = useState<{ employeeId: string; department: string; crewKey: string; direction: string; category: string; status: string; priority: string; mine: boolean; overdue: boolean }>(
    { employeeId: "", department: "", crewKey: "", direction: "", category: "", status: "", priority: "", mine: false, overdue: false },
  );

  useEffect(() => { if (isMobile && view === "week") setView("agenda"); }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setDSearch(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const weekStart = useMemo(() => getMonday(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  const range = useMemo(() => {
    if (view === "day" || view === "agenda") {
      const from = new Date(selectedDay); from.setHours(0, 0, 0, 0);
      return { from, to: addDays(from, 1) };
    }
    if (view === "month") {
      const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      return { from, to };
    }
    return { from: weekStart, to: addDays(weekStart, 7) };
  }, [view, selectedDay, anchor, weekStart]);

  const fetchEvents = useServerFn(listCalendarEvents);
  const fetchEmployees = useServerFn(listEmployees);
  const fetchObjects = useServerFn(listCalendarObjects);
  const fetchBookings = useServerFn(listBookings);
  const getSchedule = useServerFn(getOperationsSchedule);
  const saveEvent = useServerFn(upsertCalendarEvent);
  const removeEvent = useServerFn(deleteCalendarEvent);
  const moveEvent = useServerFn(moveCalendarEvent);
  const changeStatus = useServerFn(setCalendarEventStatus);
  const saveBooking = useServerFn(upsertBooking);
  const removeBooking = useServerFn(deleteBooking);

  const eventsKey = ["cal-events", range.from.toISOString(), range.to.toISOString(), f.employeeId, f.crewKey, f.direction, f.category, f.status, dSearch];
  const { data: rawEvents = [], isLoading } = useQuery({
    queryKey: eventsKey,
    enabled: !!user,
    queryFn: () => fetchEvents({ data: {
      fromISO: range.from.toISOString(), toISO: range.to.toISOString(),
      employeeId: f.employeeId || null, crewKey: f.crewKey || null,
      directions: f.direction ? [f.direction] : [],
      categories: f.category ? [f.category] : [],
      statuses: f.status ? [f.status] : [],
      search: dSearch || null,
    } }),
  });

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => fetchEmployees(), enabled: !!user });
  const { data: objects = [] } = useQuery({ queryKey: ["cal-objects"], queryFn: () => fetchObjects(), enabled: !!user });

  const bookingsKey = ["bookings", weekStart.toISOString()];
  const { data: bookings = [] } = useQuery({
    queryKey: bookingsKey, enabled: !!user,
    queryFn: () => fetchBookings({ data: { fromISO: weekStart.toISOString(), toISO: addDays(weekStart, 6).toISOString() } }),
  });
  const { data: estimateRows = [] } = useQuery({
    queryKey: ["ops-estimates", weekStart.toISOString()], enabled: !!user,
    queryFn: () => getSchedule({ data: { weekStartISO: weekStart.toISOString(), managerId: null, statuses: [] } }),
  });

  const empById = useMemo(() => {
    const m = new Map<string, any>();
    (employees as any[]).forEach((e) => m.set(e.user_id, e));
    return m;
  }, [employees]);

  const events: Ev[] = useMemo(() => {
    let list = (rawEvents as any[]) as Ev[];
    if (f.priority) list = list.filter((e) => e.priority === f.priority);
    if (f.mine && user) list = list.filter((e) => e.employee_id === user.id || e.responsible_user_id === user.id || (e.participants ?? []).includes(user.id));
    if (f.overdue) list = list.filter((e) => e.status !== "done" && e.status !== "cancelled" && new Date(e.ends_at) < new Date());
    if (f.department) list = list.filter((e) => empById.get(e.employee_id ?? "")?.department === f.department);
    return list;
  }, [rawEvents, f, user, empById]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cal-events"] });
    qc.invalidateQueries({ queryKey: bookingsKey });
  };

  const saveMut = useMutation({
    mutationFn: (p: any) => saveEvent({ data: p }),
    onSuccess: () => { invalidate(); setEditor(null); toast.success("Подію збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => removeEvent({ data: { id } }),
    onSuccess: () => { invalidate(); setOpenEvent(null); toast.success("Подію видалено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка видалення"),
  });
  const moveMut = useMutation({
    mutationFn: (p: any) => moveEvent({ data: p }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося перенести"),
  });
  const statusMut = useMutation({
    mutationFn: (p: { id: string; status: string }) => changeStatus({ data: p }),
    onSuccess: (row: any) => { invalidate(); setOpenEvent((p) => (p ? { ...p, status: row.status } : p)); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося змінити статус"),
  });
  const bookingMut = useMutation({
    mutationFn: (p: any) => saveBooking({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: bookingsKey }); setBookingEditor(null); toast.success("План бригади збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const bookingDelMut = useMutation({
    mutationFn: (id: string) => removeBooking({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: bookingsKey }); setBookingEditor(null); },
  });

  // ---------- KPI ----------
  const kpis = useMemo(() => {
    const now = new Date();
    const todayEvents = events.filter((e) => sameDay(new Date(e.starts_at), now));
    const measures = todayEvents.filter((e) => e.category === "measure");
    const crewsBusy = new Set((bookings as any[]).map((b) => b.brigade_key)).size;
    const activeObjects = new Set(events.map((e) => e.object_id).filter(Boolean)).size;
    const overdue = events.filter((e) => e.status !== "done" && e.status !== "cancelled" && new Date(e.ends_at) < now).length;
    const load = BRIGADES.length ? Math.round((crewsBusy / BRIGADES.length) * 100) : 0;
    const output = (estimateRows as any[]).reduce((s, r) => s + (Number(r.area) || 0), 0);
    return [
      { label: "Заміри сьогодні", value: String(measures.length), plan: "План: 15", tone: measures.length >= 15 ? "good" : "warn" },
      { label: "Бригади в роботі", value: `${crewsBusy}/${BRIGADES.length}`, plan: "Активні бригади", tone: crewsBusy > 0 ? "good" : "muted" },
      { label: "Активні об'єкти", value: String(activeObjects), plan: "Цього тижня", tone: "muted" },
      { label: "Завантаження", value: `${load}%`, plan: load > 90 ? "Високе" : load > 40 ? "Оптимальне" : "Низьке", tone: load > 90 ? "warn" : "good" },
      { label: "Виробіток за тиждень", value: `${Math.round(output)} м²`, plan: "За кошторисами", tone: "muted" },
      { label: "Прострочені події", value: String(overdue), plan: overdue ? "Критично" : "Немає", tone: overdue ? "bad" : "good" },
    ];
  }, [events, bookings, estimateRows]);

  // ---------- Конфлікти ----------
  const conflicts = useMemo(() => {
    const out: { text: string; ev: Ev }[] = [];
    const byRes = new Map<string, Ev[]>();
    events.forEach((e) => {
      const keys = [e.employee_id ? `emp:${e.employee_id}` : null, e.crew_key ? `crew:${e.crew_key}` : null].filter(Boolean) as string[];
      keys.forEach((k) => byRes.set(k, [...(byRes.get(k) ?? []), e]));
    });
    byRes.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      for (let i = 1; i < sorted.length; i++) {
        if (new Date(sorted[i].starts_at) < new Date(sorted[i - 1].ends_at)) {
          const who = key.startsWith("emp:")
            ? empById.get(key.slice(4))?.display_name ?? "Співробітник"
            : findBrigade(key.slice(5))?.label ?? "Бригада";
          out.push({ text: `${who}: перетин «${sorted[i - 1].title}» і «${sorted[i].title}»`, ev: sorted[i] });
        }
      }
    });
    events.forEach((e) => {
      if (!e.employee_id && !e.crew_key) out.push({ text: `Немає відповідального: «${e.title}»`, ev: e });
      else if (e.status !== "done" && e.status !== "cancelled" && new Date(e.ends_at) < new Date()) out.push({ text: `Прострочено: «${e.title}»`, ev: e });
    });
    return out.slice(0, 30);
  }, [events, empById]);

  const conflictIds = useMemo(() => new Set(conflicts.map((c) => c.ev.id)), [conflicts]);

  const shift = (n: number) => {
    if (view === "day" || view === "agenda") { const d = addDays(selectedDay, n); setSelectedDay(d); setAnchor(d); }
    else if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));
    else setAnchor(addDays(anchor, n * 7));
  };
  const goToday = () => { setAnchor(new Date()); setSelectedDay(new Date()); };

  const periodLabel = view === "month"
    ? anchor.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })
    : view === "day" || view === "agenda"
      ? selectedDay.toLocaleDateString("uk-UA", { weekday: "long", day: "2-digit", month: "long" })
      : `${weekStart.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" })}`;

  const newEvent = (date?: Date, hour?: number, extra?: Partial<Ev>) => {
    const base = date ? new Date(date) : new Date(selectedDay);
    base.setHours(hour ?? 9, 0, 0, 0);
    const end = new Date(base); end.setHours(base.getHours() + 1);
    setEditor({
      title: "", event_type: "measure_primary", category: "measure", direction: null,
      status: "planned", priority: "normal", all_day: false,
      starts_at: base.toISOString(), ends_at: end.toISOString(),
      employee_id: user?.id ?? null, ...extra,
    });
  };

  const activeChips = [
    f.employeeId && { k: "employeeId", label: empById.get(f.employeeId)?.display_name ?? "Співробітник" },
    f.department && { k: "department", label: departmentLabel(f.department) },
    f.crewKey && { k: "crewKey", label: findBrigade(f.crewKey)?.label ?? f.crewKey },
    f.direction && { k: "direction", label: DIRECTIONS.find((d) => d.key === f.direction)?.label ?? f.direction },
    f.category && { k: "category", label: EVENT_CATEGORIES.find((c) => c.key === f.category)?.label ?? f.category },
    f.status && { k: "status", label: statusLabel(f.status) },
    f.priority && { k: "priority", label: PRIORITIES.find((p) => p.key === f.priority)?.label ?? f.priority },
    f.mine && { k: "mine", label: "Тільки мої" },
    f.overdue && { k: "overdue", label: "Тільки прострочені" },
  ].filter(Boolean) as { k: string; label: string }[];

  const clearChip = (k: string) =>
    setF((p) => ({ ...p, [k]: k === "mine" || k === "overdue" ? false : "" }));

  return (
    <div className="min-h-screen bg-terzi-midnight text-terzi-ivory">
      <div className="mx-auto max-w-[1800px] px-3 pb-28 pt-3 sm:px-4 md:px-6 md:pb-10">
        <TopBar
          periodLabel={periodLabel}
          view={view} setView={setView}
          onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={goToday}
          search={search} setSearch={setSearch}
          onFilters={() => setFiltersOpen(true)}
          onNewMeasure={() => newEvent(selectedDay, 9, { event_type: "measure_primary", category: "measure", title: "Замір" })}
          onNewEvent={() => newEvent(selectedDay)}
          onNewTask={() => newEvent(selectedDay, 10, { event_type: "household", category: "finance", title: "Задача" })}
          isMobile={isMobile}
        />

        {/* KPI */}
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar md:grid md:grid-cols-3 md:gap-3 xl:grid-cols-6">
          {kpis.slice(0, isMobile ? 3 : 6).map((k) => (
            <div key={k.label}
              className="min-w-[46%] shrink-0 rounded-xl border border-white/10 bg-terzi-blue/40 p-3 shadow-lg shadow-black/20 md:min-w-0">
              <div className="truncate text-[10px] uppercase tracking-widest text-terzi-steel/70">{k.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-xl font-black ${k.tone === "bad" ? "text-red-400" : k.tone === "warn" ? "text-terzi-gold" : "text-terzi-ivory"}`}>{k.value}</span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-terzi-steel/60">{k.plan}</div>
            </div>
          ))}
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeChips.map((c) => (
              <button key={c.k} onClick={() => clearChip(c.k)}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-terzi-gold/40 bg-terzi-gold/10 px-3 text-[11px] font-semibold text-terzi-gold">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {/* Mobile date strip */}
        {isMobile && view !== "month" && (
          <DateStrip days={days} selected={selectedDay} onSelect={(d) => { setSelectedDay(d); setAnchor(d); }} />
        )}

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            {isLoading && <div className="rounded-xl border border-white/10 bg-terzi-blue/30 p-6 text-sm text-terzi-steel/70">Завантаження подій…</div>}

            {!isLoading && (view === "week" || view === "day") && !isMobile && (
              <WeekGrid
                days={view === "day" ? [selectedDay] : days}
                events={events}
                conflictIds={conflictIds}
                onOpen={setOpenEvent}
                onCreate={(d, h) => newEvent(d, h)}
                onMove={(id, start, end) => moveMut.mutate({ id, starts_at: start, ends_at: end })}
              />
            )}

            {!isLoading && (view === "agenda" || ((view === "week" || view === "day") && isMobile)) && (
              <AgendaList
                date={selectedDay}
                events={events.filter((e) => sameDay(new Date(e.starts_at), selectedDay))}
                onOpen={setOpenEvent}
              />
            )}

            {!isLoading && view === "month" && (
              <MonthGrid anchor={anchor} events={events} onPick={(d) => { setSelectedDay(d); setAnchor(d); setView(isMobile ? "agenda" : "day"); }} />
            )}

            {!isLoading && view === "employees" && (
              <EmployeesGrid
                employees={(employees as any[]).filter((e) => e.is_active !== false && (!f.department || e.department === f.department))}
                days={days} events={events} onOpen={setOpenEvent}
                onCreate={(empId, d) => newEvent(d, 9, { employee_id: empId })}
              />
            )}

            {!isLoading && view === "crews" && (
              <CrewsGrid
                days={days} bookings={bookings as any[]} events={events}
                onCell={(brigadeKey, d, existing) => setBookingEditor(existing ?? {
                  brigade_key: brigadeKey, date: ymd(d), title: "", client: "", address: "", notes: "",
                })}
              />
            )}
          </div>

          {/* Right panel (desktop) */}
          <aside className="hidden space-y-3 xl:block">
            <SidePanel
              tab={panelTab} setTab={setPanelTab}
              events={events} conflicts={conflicts} empById={empById} onOpen={setOpenEvent}
            />
          </aside>
        </div>
      </div>

      {/* Mobile bottom nav + FAB */}
      {isMobile && (
        <>
          <button onClick={() => newEvent(selectedDay)} aria-label="Створити подію"
            className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-terzi-gold text-terzi-carbon shadow-xl shadow-black/40">
            <Plus className="h-6 w-6" />
          </button>
          <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-terzi-carbon/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            {([
              { k: "agenda", label: "Порядок", icon: ListChecks },
              { k: "day", label: "День", icon: CalIcon },
              { k: "crews", label: "Бригади", icon: HardHat },
              { k: "employees", label: "Працівники", icon: Users },
            ] as const).map((m) => (
              <button key={m.k} onClick={() => setView(m.k as ViewMode)}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${view === m.k ? "text-terzi-gold" : "text-terzi-steel/70"}`}>
                <m.icon className="h-4 w-4" />{m.label}
              </button>
            ))}
            <button onClick={() => setFiltersOpen(true)}
              className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-terzi-steel/70">
              <Filter className="h-4 w-4" />Фільтри
            </button>
          </nav>
        </>
      )}

      {filtersOpen && (
        <FiltersSheet
          f={f} setF={setF} employees={employees as any[]} onClose={() => setFiltersOpen(false)}
          onReset={() => setF({ employeeId: "", department: "", crewKey: "", direction: "", category: "", status: "", priority: "", mine: false, overdue: false })}
        />
      )}

      {openEvent && (
        <EventSheet
          ev={openEvent} empById={empById}
          onClose={() => setOpenEvent(null)}
          onEdit={() => { setEditor(openEvent); setOpenEvent(null); }}
          onDelete={() => delMut.mutate(openEvent.id)}
          onStatus={(s) => statusMut.mutate({ id: openEvent.id, status: s })}
        />
      )}

      {editor && (
        <EventEditor
          value={editor} employees={employees as any[]} objects={objects as any[]}
          onClose={() => setEditor(null)}
          onSave={(payload) => saveMut.mutate(payload)}
          saving={saveMut.isPending}
        />
      )}

      {bookingEditor && (
        <BookingEditor
          value={bookingEditor}
          onClose={() => setBookingEditor(null)}
          onSave={(v) => bookingMut.mutate(v)}
          onDelete={bookingEditor.id ? () => bookingDelMut.mutate(bookingEditor.id) : undefined}
        />
      )}
    </div>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar(props: {
  periodLabel: string; view: ViewMode; setView: (v: ViewMode) => void;
  onPrev: () => void; onNext: () => void; onToday: () => void;
  search: string; setSearch: (s: string) => void; onFilters: () => void;
  onNewMeasure: () => void; onNewEvent: () => void; onNewTask: () => void; isMobile: boolean;
}) {
  const views: { k: ViewMode; label: string }[] = [
    { k: "day", label: "День" }, { k: "week", label: "Тиждень" }, { k: "month", label: "Місяць" },
    { k: "agenda", label: "Порядок денний" }, { k: "crews", label: "Бригади" }, { k: "employees", label: "Працівники" },
  ];
  return (
    <header className="rounded-2xl border border-white/10 bg-terzi-blue/35 p-3 shadow-lg shadow-black/25 md:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-base font-black tracking-tight md:text-2xl">Операційний календар TERZI</h1>
          <p className="truncate text-[11px] text-terzi-steel/70 md:text-sm">Планування замірів, робіт, працівників і ресурсів</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center rounded-lg border border-white/10 bg-terzi-carbon/60 md:flex">
            <button onClick={props.onPrev} className="grid h-11 w-11 place-items-center hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={props.onToday} className="h-11 border-x border-white/10 px-3 text-xs font-semibold hover:bg-white/5">Сьогодні</button>
            <button onClick={props.onNext} className="grid h-11 w-11 place-items-center hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={props.onNewMeasure}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-terzi-gold/40 bg-terzi-gold/15 px-3 text-xs font-bold text-terzi-gold hover:bg-terzi-gold/25">
            <Plus className="h-4 w-4" />{props.isMobile ? "Замір" : "Додати замір"}
          </button>
          {!props.isMobile && (
            <>
              <button onClick={props.onNewEvent} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-terzi-gold px-3 text-xs font-bold text-terzi-carbon hover:brightness-110">
                <Plus className="h-4 w-4" />Створити подію
              </button>
              <button onClick={props.onNewTask} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/10 bg-terzi-carbon/60 px-3 text-xs font-semibold hover:bg-white/5">
                <ListChecks className="h-4 w-4" />Створити задачу
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:flex md:flex-wrap">
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-terzi-carbon/60 px-3 md:w-72">
          <Search className="h-4 w-4 shrink-0 text-terzi-steel/60" />
          <input value={props.search} onChange={(e) => props.setSearch(e.target.value)}
            placeholder="Пошук об'єктів, клієнтів, задач…"
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-terzi-steel/40" />
        </div>
        <button onClick={props.onFilters}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-terzi-carbon/60 px-3 text-xs font-semibold hover:bg-white/5">
          <Filter className="h-4 w-4" />Фільтри
        </button>
        <div className="col-span-2 flex items-center gap-2 md:hidden">
          <button onClick={props.onPrev} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-terzi-carbon/60"><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-terzi-carbon/60 px-3 py-2.5 text-center text-xs font-semibold capitalize">{props.periodLabel}</div>
          <button onClick={props.onNext} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-terzi-carbon/60"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={props.onToday} className="h-11 shrink-0 rounded-lg border border-white/10 bg-terzi-carbon/60 px-3 text-xs font-semibold">Сьогодні</button>
        </div>
        <div className="hidden text-sm font-semibold capitalize text-terzi-steel md:block md:ml-2">{props.periodLabel}</div>
        <div className="col-span-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 no-scrollbar md:ml-auto md:mx-0 md:px-0">
          {views.map((v) => (
            <button key={v.k} onClick={() => props.setView(v.k)}
              className={`min-h-[40px] shrink-0 rounded-lg px-3 text-xs font-semibold transition ${
                props.view === v.k ? "bg-terzi-gold text-terzi-carbon" : "border border-white/10 bg-terzi-carbon/60 text-terzi-steel hover:bg-white/5"}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/* ---------------- Mobile date strip ---------------- */

function DateStrip({ days, selected, onSelect }: { days: Date[]; selected: Date; onSelect: (d: Date) => void }) {
  return (
    <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
      {days.map((d) => {
        const active = sameDay(d, selected);
        const isToday = sameDay(d, new Date());
        return (
          <button key={d.toISOString()} onClick={() => onSelect(d)}
            className={`min-h-[56px] min-w-[52px] flex-1 rounded-xl border px-2 py-1.5 text-center transition ${
              active ? "border-terzi-gold bg-terzi-gold/15 text-terzi-gold" : "border-white/10 bg-terzi-blue/30 text-terzi-steel"}`}>
            <div className="text-[10px] uppercase tracking-wider">{DOW[(d.getDay() + 6) % 7]}</div>
            <div className={`text-base font-black ${isToday && !active ? "text-terzi-gold" : ""}`}>{d.getDate()}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Event visuals ---------------- */

function statusRing(status: string) {
  if (status === "overdue") return "ring-1 ring-red-500/70";
  if (status === "attention") return "ring-1 ring-yellow-400/70";
  if (status === "done") return "opacity-60";
  if (status === "cancelled") return "opacity-45 line-through";
  return "";
}

function StatusMark({ status }: { status: string }) {
  if (status === "confirmed") return <Check className="h-3 w-3 text-emerald-400" />;
  if (status === "in_progress") return <span className="h-2 w-2 animate-pulse rounded-full bg-terzi-gold" />;
  if (status === "done") return <Check className="h-3 w-3 text-terzi-steel/70" />;
  if (status === "overdue") return <AlertTriangle className="h-3 w-3 text-red-400" />;
  if (status === "attention") return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
  return <span className="h-2 w-2 rounded-full border border-terzi-steel/50" />;
}

function EventCard({ ev, compact, conflict, onOpen, draggable }: {
  ev: Ev; compact?: boolean; conflict?: boolean; onOpen: () => void; draggable?: boolean;
}) {
  const color = eventColor(ev.direction, ev.category);
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", ev.id)}
      onClick={onOpen}
      className={`w-full overflow-hidden rounded-lg border border-white/10 bg-terzi-carbon/80 p-2 text-left shadow shadow-black/30 transition hover:border-white/25 ${statusRing(ev.status)} ${conflict ? "ring-1 ring-red-500/60" : ""}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-terzi-ivory">{hhmm(ev.starts_at)}–{hhmm(ev.ends_at)}</span>
        <StatusMark status={ev.status} />
      </div>
      <div className="truncate text-[12px] font-semibold text-terzi-ivory">{ev.title}</div>
      {!compact && (
        <div className="mt-0.5 space-y-0.5 text-[10px] text-terzi-steel/70">
          <div className="truncate">{eventTypeLabel(ev.event_type)}</div>
          {ev.address && <div className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{ev.address}</div>}
          {ev.client_name && <div className="truncate">{ev.client_name}</div>}
          {ev.area ? <div className="truncate">{ev.area} м²</div> : null}
        </div>
      )}
    </button>
  );
}

/* ---------------- Week grid ---------------- */

function WeekGrid({ days, events, conflictIds, onOpen, onCreate, onMove }: {
  days: Date[]; events: Ev[]; conflictIds: Set<string>;
  onOpen: (e: Ev) => void; onCreate: (d: Date, h: number) => void;
  onMove: (id: string, startISO: string, endISO: string) => void;
}) {
  const nowRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const nowTop = (now.getHours() + now.getMinutes() / 60 - HOURS[0]) * HOUR_PX;

  const drop = (d: Date, hour: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    const dur = new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime();
    const start = new Date(d); start.setHours(hour, 0, 0, 0);
    onMove(id, start.toISOString(), new Date(start.getTime() + dur).toISOString());
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-terzi-blue/25">
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(150px, 1fr))` }}>
        <div className="sticky left-0 z-20 border-b border-r border-white/10 bg-terzi-blue/60 p-2 text-[10px] uppercase tracking-widest text-terzi-steel/60">Час</div>
        {days.map((d) => {
          const isToday = sameDay(d, now);
          return (
            <div key={d.toISOString()}
              className={`border-b border-l border-white/10 p-2 text-center ${isToday ? "bg-terzi-gold/10" : "bg-terzi-blue/50"}`}>
              <div className={`text-[10px] uppercase tracking-widest ${isToday ? "text-terzi-gold" : "text-terzi-steel/60"}`}>{DOW[(d.getDay() + 6) % 7]}</div>
              <div className={`text-sm font-black ${isToday ? "text-terzi-gold" : "text-terzi-ivory"}`}>
                {d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative max-h-[70vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(150px, 1fr))` }}>
          <div className="sticky left-0 z-10 bg-terzi-blue/40">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="border-b border-r border-white/5 px-2 pt-1 text-[10px] text-terzi-steel/50">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayEvents = events.filter((e) => sameDay(new Date(e.starts_at), d));
            const isToday = sameDay(d, now);
            return (
              <div key={d.toISOString()} className="relative border-l border-white/5">
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }}
                    onDragOver={(e) => e.preventDefault()} onDrop={drop(d, h)}
                    onDoubleClick={() => onCreate(d, h)}
                    className="border-b border-white/5 hover:bg-white/[0.03]" />
                ))}
                {isToday && nowTop > 0 && (
                  <div ref={nowRef} className="pointer-events-none absolute left-0 right-0 z-10 border-t border-terzi-gold" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-terzi-gold" />
                  </div>
                )}
                {dayEvents.map((ev) => {
                  const s = new Date(ev.starts_at); const e2 = new Date(ev.ends_at);
                  const top = (s.getHours() + s.getMinutes() / 60 - HOURS[0]) * HOUR_PX;
                  const height = Math.max(34, ((e2.getTime() - s.getTime()) / 3600000) * HOUR_PX - 4);
                  return (
                    <div key={ev.id} className="absolute left-1 right-1 z-[5]" style={{ top: Math.max(0, top), height }}>
                      <EventCard ev={ev} compact={height < 70} conflict={conflictIds.has(ev.id)} draggable onOpen={() => onOpen(ev)} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Agenda ---------------- */

function AgendaList({ date, events, onOpen }: { date: Date; events: Ev[]; onOpen: (e: Ev) => void }) {
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-terzi-blue/20 p-8 text-center text-sm text-terzi-steel/60">
        На {date.toLocaleDateString("uk-UA", { day: "2-digit", month: "long" })} подій немає
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {sorted.map((ev) => (
        <div key={ev.id} className="flex gap-2">
          <div className="w-12 shrink-0 pt-2 text-right text-[11px] font-bold text-terzi-steel/70">{hhmm(ev.starts_at)}</div>
          <div className="min-w-0 flex-1"><EventCard ev={ev} onOpen={() => onOpen(ev)} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Month ---------------- */

function MonthGrid({ anchor, events, onPick }: { anchor: Date; events: Ev[]; onPick: (d: Date) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = getMonday(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-terzi-blue/25">
      <div className="grid grid-cols-7 border-b border-white/10 bg-terzi-blue/50">
        {DOW.map((d) => <div key={d} className="p-2 text-center text-[10px] uppercase tracking-widest text-terzi-steel/60">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const items = events.filter((e) => sameDay(new Date(e.starts_at), d));
          const other = d.getMonth() !== anchor.getMonth();
          return (
            <button key={d.toISOString()} onClick={() => onPick(d)}
              className={`min-h-[86px] border-b border-l border-white/5 p-1.5 text-left align-top ${other ? "opacity-40" : ""} ${sameDay(d, new Date()) ? "bg-terzi-gold/10" : ""}`}>
              <div className="text-[11px] font-bold">{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((e) => (
                  <div key={e.id} className="truncate rounded px-1 text-[10px]" style={{ background: `${eventColor(e.direction, e.category)}22`, borderLeft: `2px solid ${eventColor(e.direction, e.category)}` }}>
                    {hhmm(e.starts_at)} {e.title}
                  </div>
                ))}
                {items.length > 3 && <div className="text-[10px] text-terzi-steel/60">+{items.length - 3}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Employees ---------------- */

function EmployeesGrid({ employees, days, events, onOpen, onCreate }: {
  employees: any[]; days: Date[]; events: Ev[];
  onOpen: (e: Ev) => void; onCreate: (empId: string, d: Date) => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    employees.forEach((e) => {
      const k = e.department ?? "other";
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return Array.from(m.entries());
  }, [employees]);

  if (!employees.length) {
    return <div className="rounded-2xl border border-dashed border-white/15 bg-terzi-blue/20 p-8 text-center text-sm text-terzi-steel/60">Немає активних співробітників у довіднику</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-terzi-blue/25">
      <div className="scroll-x overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid border-b border-white/10 bg-terzi-blue/50" style={{ gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))` }}>
            <div className="sticky left-0 z-10 bg-terzi-blue/70 p-2 text-[10px] uppercase tracking-widest text-terzi-steel/60">Співробітник</div>
            {days.map((d) => (
              <div key={d.toISOString()} className={`border-l border-white/5 p-2 text-center text-[11px] font-bold ${sameDay(d, new Date()) ? "text-terzi-gold" : "text-terzi-steel"}`}>
                {DOW[(d.getDay() + 6) % 7]} {d.getDate()}
              </div>
            ))}
          </div>
          {groups.map(([dep, list]) => {
            const open = !collapsed.includes(dep);
            return (
              <div key={dep}>
                <button onClick={() => setCollapsed((p) => open ? [...p, dep] : p.filter((x) => x !== dep))}
                  className="flex w-full items-center gap-2 border-b border-white/10 bg-terzi-carbon/50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-terzi-gold">
                  <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
                  {departmentLabel(dep)} · {list.length}
                </button>
                {open && list.map((emp) => {
                  const empEvents = events.filter((e) => e.employee_id === emp.user_id);
                  return (
                    <div key={emp.user_id} className="grid border-b border-white/5" style={{ gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))` }}>
                      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-terzi-blue/40 p-2">
                        {emp.avatar_url
                          ? <img src={emp.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                          : <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-terzi-gold/20 text-[11px] font-bold text-terzi-gold">{(emp.display_name || emp.email || "?").slice(0, 1).toUpperCase()}</div>}
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold">{emp.display_name || emp.email}</div>
                          <div className="truncate text-[10px] text-terzi-steel/60">{emp.position || departmentLabel(emp.department)} · {empEvents.length} под.</div>
                        </div>
                      </div>
                      {days.map((d) => {
                        const items = empEvents.filter((e) => sameDay(new Date(e.starts_at), d));
                        return (
                          <div key={d.toISOString()} onDoubleClick={() => onCreate(emp.user_id, d)}
                            className="min-h-[54px] space-y-1 border-l border-white/5 p-1">
                            {items.map((e) => <EventCard key={e.id} ev={e} compact onOpen={() => onOpen(e)} />)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Crews ---------------- */

function CrewsGrid({ days, bookings, events, onCell }: {
  days: Date[]; bookings: any[]; events: Ev[];
  onCell: (brigadeKey: string, d: Date, existing?: any) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-terzi-blue/25">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-terzi-gold">Планування бригад</h2>
        <span className="text-[10px] text-terzi-steel/60">Подвійний клік по клітинці — додати</span>
      </div>
      <div className="scroll-x overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid border-b border-white/10 bg-terzi-blue/50" style={{ gridTemplateColumns: `190px repeat(7, minmax(110px, 1fr)) 110px` }}>
            <div className="sticky left-0 z-10 bg-terzi-blue/70 p-2 text-[10px] uppercase tracking-widest text-terzi-steel/60">Бригада</div>
            {days.map((d) => (
              <div key={d.toISOString()} className={`border-l border-white/5 p-2 text-center text-[11px] font-bold ${sameDay(d, new Date()) ? "text-terzi-gold" : "text-terzi-steel"}`}>
                {DOW[(d.getDay() + 6) % 7]} {d.getDate()}
              </div>
            ))}
            <div className="border-l border-white/5 p-2 text-center text-[10px] uppercase tracking-widest text-terzi-steel/60">Статус</div>
          </div>
          {BRIGADES.map((b) => {
            const own = bookings.filter((x) => x.brigade_key === b.key);
            const load = Math.round((own.length / 7) * 100);
            const crewEvents = events.filter((e) => e.crew_key === b.key);
            return (
              <div key={b.key} className="grid border-b border-white/5" style={{ gridTemplateColumns: `190px repeat(7, minmax(110px, 1fr)) 110px` }}>
                <div className="sticky left-0 z-10 min-w-0 bg-terzi-blue/40 p-2">
                  <div className="truncate text-[12px] font-semibold">{b.label}</div>
                  <div className="truncate text-[10px] text-terzi-steel/60">{b.module === "screed" ? "Стяжка" : "Покрівля"} · {own.length} днів</div>
                </div>
                {days.map((d) => {
                  const item = own.find((x) => x.date === ymd(d));
                  const evs = crewEvents.filter((e) => sameDay(new Date(e.starts_at), d));
                  return (
                    <div key={d.toISOString()} onDoubleClick={() => onCell(b.key, d, item)}
                      className="min-h-[54px] space-y-1 border-l border-white/5 p-1">
                      {item && (
                        <button onClick={() => onCell(b.key, d, item)}
                          className="w-full rounded-md border border-white/10 bg-terzi-carbon/80 p-1.5 text-left text-[10px]"
                          style={{ borderLeft: `3px solid ${b.module === "screed" ? "#3FB950" : "#A855F7"}` }}>
                          <div className="truncate font-semibold text-terzi-ivory">{item.title}</div>
                          {item.address && <div className="truncate text-terzi-steel/60">{item.address}</div>}
                        </button>
                      )}
                      {evs.map((e) => <div key={e.id} className="truncate rounded px-1 text-[10px] text-terzi-steel/70">{hhmm(e.starts_at)} {e.title}</div>)}
                      {!item && !evs.length && <div className="text-[10px] text-terzi-steel/25">—</div>}
                    </div>
                  );
                })}
                <div className="border-l border-white/5 p-2 text-center text-[10px] font-semibold">
                  <span className={load > 85 ? "text-red-400" : load > 40 ? "text-emerald-400" : "text-terzi-steel/60"}>
                    {load > 85 ? "Високе" : load > 40 ? "Оптимальне" : "Помірне"}
                  </span>
                  <div className="mt-1 h-1 rounded bg-white/10">
                    <div className="h-1 rounded bg-terzi-gold" style={{ width: `${Math.min(100, load)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Side panel ---------------- */

function SidePanel({ tab, setTab, events, conflicts, empById, onOpen }: {
  tab: "queue" | "reminders" | "conflicts"; setTab: (t: "queue" | "reminders" | "conflicts") => void;
  events: Ev[]; conflicts: { text: string; ev: Ev }[]; empById: Map<string, any>; onOpen: (e: Ev) => void;
}) {
  const now = new Date();
  const queue = events.filter((e) => new Date(e.ends_at) >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 12);
  const reminders = events.filter((e) => ["call", "call_repeat", "estimate_send", "prepayment", "supplier_payment", "work_start", "daily_standup"].includes(e.event_type)).slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/10 bg-terzi-blue/30">
      <div className="flex border-b border-white/10">
        {([["queue", "Черга", ListChecks], ["reminders", "Нагадування", Bell], ["conflicts", "Конфлікти", AlertTriangle]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-[11px] font-bold ${tab === k ? "border-b-2 border-terzi-gold text-terzi-gold" : "text-terzi-steel/60"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>
      <div className="max-h-[62vh] space-y-2 overflow-y-auto p-2">
        {tab === "queue" && (queue.length ? queue.map((e) => (
          <button key={e.id} onClick={() => onOpen(e)} className="w-full rounded-lg border border-white/10 bg-terzi-carbon/70 p-2 text-left"
            style={{ borderLeft: `3px solid ${eventColor(e.direction, e.category)}` }}>
            <div className="flex items-center justify-between text-[11px] font-bold"><span>{hhmm(e.starts_at)}</span><StatusMark status={e.status} /></div>
            <div className="truncate text-[12px]">{e.title}</div>
            <div className="truncate text-[10px] text-terzi-steel/60">
              {empById.get(e.employee_id ?? "")?.display_name ?? "Без відповідального"}{e.address ? ` · ${e.address}` : ""}
            </div>
          </button>
        )) : <Empty text="Черга порожня" />)}

        {tab === "reminders" && (reminders.length ? reminders.map((e) => (
          <button key={e.id} onClick={() => onOpen(e)} className="w-full rounded-lg border border-white/10 bg-terzi-carbon/70 p-2 text-left">
            <div className="text-[11px] font-bold text-terzi-gold">{hhmm(e.starts_at)} · {eventTypeLabel(e.event_type)}</div>
            <div className="truncate text-[12px]">{e.title}</div>
          </button>
        )) : <Empty text="Нагадувань немає" />)}

        {tab === "conflicts" && (conflicts.length ? conflicts.map((c, i) => (
          <button key={i} onClick={() => onOpen(c.ev)} className="w-full rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-left text-[11px] text-red-200">
            {c.text}
          </button>
        )) : <Empty text="Конфліктів немає" />)}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-[11px] text-terzi-steel/50">{text}</div>;
}

/* ---------------- Sheets ---------------- */

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-white/10 bg-terzi-midnight text-terzi-ivory shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="truncate text-sm font-black">{title}</h3>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

const fieldCls = "w-full rounded-lg border border-white/10 bg-terzi-carbon/70 px-3 py-2.5 text-sm text-terzi-ivory outline-none focus:border-terzi-gold/60";
const labelCls = "mb-1 block text-[10px] uppercase tracking-widest text-terzi-steel/60";

function FiltersSheet({ f, setF, employees, onClose, onReset }: {
  f: any; setF: (fn: any) => void; employees: any[]; onClose: () => void; onReset: () => void;
}) {
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Sheet title="Фільтри" onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onReset} className="min-h-[44px] flex-1 rounded-lg border border-white/10 text-sm font-semibold">Скинути</button>
          <button onClick={onClose} className="min-h-[44px] flex-1 rounded-lg bg-terzi-gold text-sm font-bold text-terzi-carbon">Застосувати</button>
        </div>
      }>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Співробітник</label>
          <select className={fieldCls} value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}>
            <option value="">Усі</option>
            {employees.map((e) => <option key={e.user_id} value={e.user_id}>{e.display_name || e.email}</option>)}
          </select></div>
        <div><label className={labelCls}>Відділ</label>
          <select className={fieldCls} value={f.department} onChange={(e) => set("department", e.target.value)}>
            <option value="">Усі</option>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Бригада</label>
          <select className={fieldCls} value={f.crewKey} onChange={(e) => set("crewKey", e.target.value)}>
            <option value="">Усі</option>
            {BRIGADES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Напрямок робіт</label>
          <select className={fieldCls} value={f.direction} onChange={(e) => set("direction", e.target.value)}>
            <option value="">Усі</option>
            {DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Категорія події</label>
          <select className={fieldCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Усі</option>
            {EVENT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Статус</label>
          <select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Усі</option>
            {EVENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Пріоритет</label>
          <select className={fieldCls} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">Усі</option>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select></div>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={f.mine} onChange={(e) => set("mine", e.target.checked)} /> Тільки мої події
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={f.overdue} onChange={(e) => set("overdue", e.target.checked)} /> Тільки прострочені
          </label>
        </div>
      </div>
    </Sheet>
  );
}

function EventSheet({ ev, empById, onClose, onEdit, onDelete, onStatus }: {
  ev: Ev; empById: Map<string, any>; onClose: () => void; onEdit: () => void; onDelete: () => void; onStatus: (s: string) => void;
}) {
  const emp = empById.get(ev.employee_id ?? "");
  return (
    <Sheet title={ev.title} onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onStatus("confirmed")} className="min-h-[44px] flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300">Підтвердити</button>
          <button onClick={() => onStatus("in_progress")} className="min-h-[44px] flex-1 rounded-lg border border-terzi-gold/40 bg-terzi-gold/10 px-3 text-xs font-bold text-terzi-gold"><Play className="mr-1 inline h-3 w-3" />Почати</button>
          <button onClick={() => onStatus("done")} className="min-h-[44px] flex-1 rounded-lg border border-white/10 px-3 text-xs font-bold">Завершити</button>
          <button onClick={() => onStatus("cancelled")} className="min-h-[44px] flex-1 rounded-lg border border-white/10 px-3 text-xs font-semibold text-terzi-steel/70">Скасувати</button>
          <button onClick={onEdit} className="min-h-[44px] flex-1 rounded-lg bg-terzi-gold px-3 text-xs font-bold text-terzi-carbon">Редагувати</button>
          <button onClick={onDelete} className="grid min-h-[44px] w-12 place-items-center rounded-lg border border-red-500/40 text-red-300"><Trash2 className="h-4 w-4" /></button>
        </div>
      }>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2 py-1 text-[11px] font-bold" style={{ background: `${eventColor(ev.direction, ev.category)}22`, color: eventColor(ev.direction, ev.category) }}>
            {eventTypeLabel(ev.event_type)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px]"><StatusMark status={ev.status} />{statusLabel(ev.status)}</span>
        </div>
        <Row icon={Clock} text={`${new Date(ev.starts_at).toLocaleDateString("uk-UA")} · ${hhmm(ev.starts_at)}–${hhmm(ev.ends_at)}`} />
        {ev.address && <Row icon={MapPin} text={ev.address} />}
        {ev.client_name && <Row icon={Users} text={ev.client_name} />}
        {ev.area ? <Row icon={Ruler} text={`${ev.area} м²`} /> : null}
        {emp && <Row icon={Users} text={`${emp.display_name || emp.email}${emp.position ? ` · ${emp.position}` : ""}`} />}
        {ev.crew_key && <Row icon={HardHat} text={findBrigade(ev.crew_key)?.label ?? ev.crew_key} />}
        {ev.description && <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-terzi-carbon/60 p-3 text-[13px] text-terzi-steel">{ev.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {ev.object_id && <Link to="/objects/$id" params={{ id: ev.object_id }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold"><Building2 className="h-3.5 w-3.5" />Відкрити об'єкт</Link>}
          {ev.estimate_id && <Link to="/history" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold">Кошторис</Link>}
          <Link to="/clients" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold">Клієнти</Link>
        </div>
      </div>
    </Sheet>
  );
}

function Row({ icon: Icon, text }: { icon: any; text: string }) {
  return <div className="flex items-center gap-2 text-[13px] text-terzi-steel"><Icon className="h-4 w-4 shrink-0 text-terzi-steel/60" /><span className="min-w-0 break-words">{text}</span></div>;
}

function EventEditor({ value, employees, objects, onClose, onSave, saving }: {
  value: Partial<Ev>; employees: any[]; objects: any[];
  onClose: () => void; onSave: (p: any) => void; saving: boolean;
}) {
  const [v, setV] = useState<any>({
    participants: [], priority: "normal", status: "planned", all_day: false, ...value,
  });
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));

  const submit = () => {
    if (!v.title?.trim()) { toast.error("Вкажіть назву події"); return; }
    if (new Date(v.ends_at) <= new Date(v.starts_at)) { toast.error("Час завершення має бути пізніше початку"); return; }
    onSave({
      id: v.id, title: v.title.trim(), event_type: v.event_type, category: categoryOfType(v.event_type),
      direction: v.direction || null, status: v.status, priority: v.priority,
      starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString(),
      all_day: !!v.all_day, description: v.description || null, address: v.address || null,
      zone: v.zone || null, client_name: v.client_name || null,
      area: v.area ? Number(v.area) : null,
      employee_id: v.employee_id || null, responsible_user_id: v.responsible_user_id || v.employee_id || null,
      manager_id: v.manager_id || null, participants: v.participants ?? [],
      crew_key: v.crew_key || null, object_id: v.object_id || null,
      client_id: v.client_id || null, estimate_id: v.estimate_id || null,
      reminders: v.reminders ?? [], checklist: v.checklist ?? [],
    });
  };

  return (
    <Sheet title={v.id ? "Редагувати подію" : "Нова подія"} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="min-h-[44px] flex-1 rounded-lg border border-white/10 text-sm font-semibold">Скасувати</button>
          <button onClick={submit} disabled={saving} className="min-h-[44px] flex-[2] rounded-lg bg-terzi-gold text-sm font-bold text-terzi-carbon disabled:opacity-60">
            {saving ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      }>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelCls}>Назва</label>
          <input className={fieldCls} value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Наприклад: Замір — стяжка, вул. Лісова 18А" /></div>
        <div><label className={labelCls}>Тип події</label>
          <select className={fieldCls} value={v.event_type} onChange={(e) => set("event_type", e.target.value)}>
            {EVENT_CATEGORIES.map((c) => (
              <optgroup key={c.key} label={c.label}>
                {EVENT_TYPES.filter((t) => t.category === c.key).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </optgroup>
            ))}
          </select></div>
        <div><label className={labelCls}>Напрямок робіт</label>
          <select className={fieldCls} value={v.direction ?? ""} onChange={(e) => set("direction", e.target.value)}>
            <option value="">—</option>
            {DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Початок</label>
          <input type="datetime-local" className={fieldCls} value={localInput(v.starts_at)} onChange={(e) => set("starts_at", new Date(e.target.value).toISOString())} /></div>
        <div><label className={labelCls}>Завершення</label>
          <input type="datetime-local" className={fieldCls} value={localInput(v.ends_at)} onChange={(e) => set("ends_at", new Date(e.target.value).toISOString())} /></div>
        <div><label className={labelCls}>Співробітник</label>
          <select className={fieldCls} value={v.employee_id ?? ""} onChange={(e) => set("employee_id", e.target.value)}>
            <option value="">—</option>
            {employees.map((e) => <option key={e.user_id} value={e.user_id}>{e.display_name || e.email}</option>)}
          </select></div>
        <div><label className={labelCls}>Бригада</label>
          <select className={fieldCls} value={v.crew_key ?? ""} onChange={(e) => set("crew_key", e.target.value)}>
            <option value="">—</option>
            {BRIGADES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className={labelCls}>Об'єкт</label>
          <select className={fieldCls} value={v.object_id ?? ""} onChange={(e) => {
            const o = objects.find((x) => x.id === e.target.value);
            setV((p: any) => ({ ...p, object_id: e.target.value || null, address: o?.address ?? p.address, client_id: o?.client_id ?? p.client_id }));
          }}>
            <option value="">—</option>
            {objects.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.name || o.address}</option>)}
          </select></div>
        <div><label className={labelCls}>Клієнт</label>
          <input className={fieldCls} value={v.client_name ?? ""} onChange={(e) => set("client_name", e.target.value)} /></div>
        <div><label className={labelCls}>Адреса</label>
          <input className={fieldCls} value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div><label className={labelCls}>Площа, м²</label>
          <input className={fieldCls} inputMode="decimal" value={v.area ?? ""} onChange={(e) => set("area", e.target.value)} /></div>
        <div><label className={labelCls}>Зона об'єкта</label>
          <input className={fieldCls} value={v.zone ?? ""} onChange={(e) => set("zone", e.target.value)} /></div>
        <div><label className={labelCls}>Пріоритет</label>
          <select className={fieldCls} value={v.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select></div>
        <div><label className={labelCls}>Статус</label>
          <select className={fieldCls} value={v.status} onChange={(e) => set("status", e.target.value)}>
            {EVENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className={labelCls}>Опис</label>
          <textarea rows={3} className={fieldCls} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
      </div>
    </Sheet>
  );
}

function BookingEditor({ value, onClose, onSave, onDelete }: {
  value: any; onClose: () => void; onSave: (v: any) => void; onDelete?: () => void;
}) {
  const [v, setV] = useState<any>({ ...value });
  const set = (k: string, val: any) => setV((p: any) => ({ ...p, [k]: val }));
  return (
    <Sheet title={`${findBrigade(v.brigade_key)?.label ?? "Бригада"} · ${v.date}`} onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onDelete && <button onClick={onDelete} className="grid min-h-[44px] w-12 place-items-center rounded-lg border border-red-500/40 text-red-300"><Trash2 className="h-4 w-4" /></button>}
          <button onClick={onClose} className="min-h-[44px] flex-1 rounded-lg border border-white/10 text-sm font-semibold">Скасувати</button>
          <button onClick={() => onSave({ id: v.id, brigade_key: v.brigade_key, date: v.date, title: v.title, client: v.client || null, address: v.address || null, notes: v.notes || null })}
            className="min-h-[44px] flex-[2] rounded-lg bg-terzi-gold text-sm font-bold text-terzi-carbon">Зберегти</button>
        </div>
      }>
      <div className="space-y-3">
        <div><label className={labelCls}>Об'єкт / роботи</label><input className={fieldCls} value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className={labelCls}>Клієнт</label><input className={fieldCls} value={v.client ?? ""} onChange={(e) => set("client", e.target.value)} /></div>
        <div><label className={labelCls}>Адреса</label><input className={fieldCls} value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div><label className={labelCls}>Примітка</label><textarea rows={3} className={fieldCls} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
    </Sheet>
  );
}
