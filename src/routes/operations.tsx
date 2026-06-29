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

const STATUSES = ["draft", "sent", "approved", "inWork", "done", "refused", "archived"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "Чернетка", sent: "Надіслано", approved: "Затв.",
  inWork: "В роботі", done: "Завершено", refused: "Відмова", archived: "Архів",
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

      {isFetching && <div className="text-xs text-muted-foreground">Завантаження…</div>}
    </div>
  );
}
