/**
 * Блок «Планування» у внутрішній вкладці кошторису.
 * Авто-розрахунок тривалості + ручне коригування + синхронізація з Google Calendar.
 */
import { useState, useMemo } from "react";
import { Calendar, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { syncEstimateToCalendar, deleteEstimateEvent } from "@/lib/gcal.functions";
import { calcDuration, type ModuleKey } from "@/lib/duration-calc";

interface Props {
  estimateId?: string;
  module: ModuleKey;
  area: number;
  layers?: number;
  initial?: {
    startAt?: string | null;
    durationDays?: number | null;
    durationOverride?: number | null;
    gcalEventId?: string | null;
    gcalSyncedAt?: string | null;
  };
}

export function SchedulePanel({ estimateId, module, area, layers, initial }: Props) {
  const auto = useMemo(() => calcDuration({ module, area, layers }), [module, area, layers]);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(initial?.startAt?.slice(0, 10) ?? today);
  const [override, setOverride] = useState<string>(
    initial?.durationOverride != null ? String(initial.durationOverride) : "",
  );
  const [busy, setBusy] = useState<"idle" | "sync" | "del">("idle");
  const [msg, setMsg] = useState<string>("");
  const [eventId, setEventId] = useState<string | null>(initial?.gcalEventId ?? null);

  const days = override.trim() ? Math.max(1, Number(override) || auto.days) : auto.days;

  const sync = useServerFn(syncEstimateToCalendar);
  const del = useServerFn(deleteEstimateEvent);

  async function onSync() {
    if (!estimateId) {
      setMsg("Спершу збережіть кошторис у БД");
      return;
    }
    setBusy("sync"); setMsg("");
    try {
      const res = await sync({ data: {
        estimateId,
        startAt: new Date(startDate + "T08:00:00").toISOString(),
        durationDays: days,
        calendarId: "primary",
      } });
      setEventId(res.eventId);
      setMsg("Подію синхронізовано ✓");
    } catch (e) {
      setMsg(`Помилка: ${(e as Error).message}`);
    } finally { setBusy("idle"); }
  }

  async function onDelete() {
    if (!estimateId) return;
    setBusy("del"); setMsg("");
    try {
      await del({ data: { estimateId } });
      setEventId(null);
      setMsg("Подію видалено з календаря");
    } catch (e) {
      setMsg(`Помилка: ${(e as Error).message}`);
    } finally { setBusy("idle"); }
  }

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <Calendar className="w-4 h-4 text-primary" /> Планування виконання
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Дата початку</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Тривалість (авто), дн.</span>
          <input value={auto.days} disabled
            className="bg-secondary/50 border border-border rounded px-2 py-1.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{auto.reason}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Коригування, дн. (опц.)</span>
          <input value={override} onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={String(auto.days)}
            className="bg-background border border-border rounded px-2 py-1.5" />
        </label>
      </div>

      <div className="text-xs text-muted-foreground">
        Підсумкова тривалість: <b className="text-foreground">{days} дн.</b> ·
        Закінчення: <b className="text-foreground">{new Date(new Date(startDate).getTime() + (days - 1) * 86400000).toLocaleDateString("uk-UA")}</b>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onSync} disabled={busy !== "idle" || !estimateId}
          className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {busy === "sync" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {eventId ? "Оновити подію в Google Calendar" : "Створити подію в Google Calendar"}
        </button>
        {eventId && (
          <button onClick={onDelete} disabled={busy !== "idle"}
            className="px-3 py-2 rounded bg-destructive/15 text-destructive text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            <Trash2 className="w-3 h-3" /> Видалити з календаря
          </button>
        )}
      </div>

      {!estimateId && <div className="text-[11px] text-amber-600">⚠ Спершу збережіть кошторис, потім синхронізуйте подію.</div>}
      {msg && <div className="text-[11px] text-muted-foreground">{msg}</div>}
      {eventId && <div className="text-[10px] text-muted-foreground font-mono">event_id: {eventId}</div>}
    </div>
  );
}
