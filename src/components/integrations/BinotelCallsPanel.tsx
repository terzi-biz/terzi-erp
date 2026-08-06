import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Clock, PhoneIncoming, PhoneMissed, RefreshCw, Search } from "lucide-react";
import { listBinotelCalls, syncBinotelCallHistory } from "@/lib/binotel.functions";
import { BinotelCallDialog } from "@/components/integrations/BinotelCallDialog";

const card = "rounded-xl border border-border bg-card p-4";
const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const btn = "rounded-md border border-border px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50";

const DISPOSITIONS = [
  { v: "all", l: "Усі диспозиції" },
  { v: "answered", l: "Відповіли" },
  { v: "transferred", l: "Переведені" },
  { v: "missed", l: "Пропущені" },
  { v: "busy", l: "Зайнято" },
  { v: "failed", l: "Помилка" },
  { v: "cancelled", l: "Скасовані" },
  { v: "voicemail", l: "Голосова пошта" },
  { v: "voicemail_with_message", l: "З повідомленням" },
  { v: "online", l: "Онлайн" },
  { v: "unknown", l: "Невідомі" },
];

const SLA = [
  { v: "all", l: "Усі SLA" },
  { v: "no_task", l: "Без задачі" },
  { v: "in_sla", l: "У межах SLA" },
  { v: "overdue", l: "Прострочено SLA" },
  { v: "done", l: "Відпрацьовано" },
];

const SLA_LABEL: Record<string, { l: string; c: string }> = {
  not_applicable: { l: "—", c: "text-muted-foreground" },
  no_task: { l: "Без задачі", c: "text-amber-600" },
  in_sla: { l: "У межах SLA", c: "text-blue-600" },
  overdue: { l: "Прострочено", c: "text-destructive" },
  done: { l: "Відпрацьовано", c: "text-emerald-600" },
};

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtSec = (n: number | null) => {
  const s = Number(n ?? 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function BinotelCallsPanel() {
  const queryClient = useQueryClient();
  const fn = useServerFn(listBinotelCalls);
  const syncHistoryFn = useServerFn(syncBinotelCallHistory);
  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [from, setFrom] = useState(isoDay(weekAgo));
  const [to, setTo] = useState(isoDay(today));
  const [generalCallId, setGeneralCallId] = useState("");
  const [disposition, setDisposition] = useState("all");
  const [direction, setDirection] = useState("all");
  const [sla, setSla] = useState<"all" | "no_task" | "in_sla" | "overdue" | "done">("all");
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [syncDays, setSyncDays] = useState(7);

  const filters = useMemo(
    () => ({
      from: from ? `${from}T00:00:00` : null,
      to: to ? `${to}T23:59:59` : null,
      generalCallId: generalCallId.trim() || null,
      disposition,
      direction,
      sla,
      limit: 300,
    }),
    [from, to, generalCallId, disposition, direction, sla],
  );

  const q = useQuery({
    queryKey: ["binotel", "calls", filters],
    queryFn: () => fn({ data: filters }),
  });
  const syncHistory = useMutation({
    mutationFn: () => syncHistoryFn({ data: { days: syncDays } }),
    onSuccess: (result) => {
      toast.success(`Binotel: отримано ${result.received}, оброблено ${result.applied}${result.failed ? `, помилок ${result.failed}` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["binotel"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не вдалося синхронізувати Binotel"),
  });

  const stats = (q.data as any)?.stats ?? { total: 0, inbound: 0, outbound: 0, missed: 0, answered: 0, overdue: 0, noTask: 0, avgDuration: 0, avgWait: 0 };
  const items = ((q.data as any)?.items ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<PhoneIncoming className="h-4 w-4" />} label="Усього дзвінків" value={stats.total} hint={`Вхідні ${stats.inbound} · Вихідні ${stats.outbound}`} />
        <Kpi icon={<PhoneMissed className="h-4 w-4" />} label="Пропущені" value={stats.missed} hint={`Відповіли ${stats.answered}`} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Прострочено SLA" value={stats.overdue} hint={`Без задачі ${stats.noTask}`} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Середня розмова" value={fmtSec(stats.avgDuration)} hint={`Очікування ${fmtSec(stats.avgWait)}`} />
      </div>

      <div className={`${card} grid gap-3 md:grid-cols-3 lg:grid-cols-6`}>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">Період з</span>
          <input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">по</span>
          <input type="date" className={inp} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">generalCallID</span>
          <input className={inp} placeholder="Напр. 1234567890" value={generalCallId} onChange={(e) => setGeneralCallId(e.target.value)} />
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">Диспозиція</span>
          <select className={inp} value={disposition} onChange={(e) => setDisposition(e.target.value)}>
            {DISPOSITIONS.map((d) => (
              <option key={d.v} value={d.v}>
                {d.l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">Напрямок</span>
          <select className={inp} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="all">Усі</option>
            <option value="inbound">Вхідні</option>
            <option value="outbound">Вихідні</option>
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span className="text-muted-foreground">SLA</span>
          <select className={inp} value={sla} onChange={(e) => setSla(e.target.value as any)}>
            {SLA.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Search className="h-4 w-4" /> Знайдено: {items.length}
        </p>
        <div className="flex items-center gap-2">
          <select className={`${inp} w-auto`} value={syncDays} onChange={(event) => setSyncDays(Number(event.target.value))} aria-label="Період синхронізації Binotel">
            <option value={1}>1 день</option>
            <option value={7}>7 днів</option>
            <option value={14}>14 днів</option>
            <option value={31}>31 день</option>
          </select>
          <button className={btn} onClick={() => syncHistory.mutate()} disabled={syncHistory.isPending}>
            <RefreshCw className={`h-4 w-4 ${syncHistory.isPending ? "animate-spin" : ""}`} /> Синхронізувати Binotel
          </button>
          <button className={btn} onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Оновити
          </button>
        </div>
      </div>

      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Час</th>
              <th className="px-3 py-2 text-left">Напрямок</th>
              <th className="px-3 py-2 text-left">Номер / клієнт</th>
              <th className="px-3 py-2 text-left">АТС</th>
              <th className="px-3 py-2 text-left">Менеджер</th>
              <th className="px-3 py-2 text-left">Диспозиція</th>
              <th className="px-3 py-2 text-right">Очік.</th>
              <th className="px-3 py-2 text-right">Розмова</th>
              <th className="px-3 py-2 text-left">SLA</th>
              <th className="px-3 py-2 text-left">generalCallID</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  Завантаження…
                </td>
              </tr>
            )}
            {!q.isLoading && !items.length && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  Дзвінків за обраними фільтрами не знайдено
                </td>
              </tr>
            )}
            {items.map((c) => {
              const s = SLA_LABEL[c.sla_status] ?? SLA_LABEL.not_applicable!;
              return (
                <tr
                  key={c.id}
                  className={`border-t border-border ${c.external_id ? "cursor-pointer hover:bg-secondary/60" : ""}`}
                  onClick={() => c.external_id && setOpenCallId(String(c.external_id))}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(c.started_at)}</td>
                  <td className="px-3 py-2">{c.direction === "inbound" ? "Вхідний" : "Вихідний"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.contact_name ?? (c.direction === "inbound" ? c.from_number : c.to_number) ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone_norm ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{c.pbx_number_name ?? c.pbx_number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.employee_name ?? (c.internal_number ? `вн. ${c.internal_number}` : "—")}</td>
                  <td className="px-3 py-2">
                    <span className={c.is_missed ? "text-destructive font-semibold" : ""}>{c.disposition_raw ?? c.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtSec(c.wait_seconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtSec(c.duration_sec)}</td>
                  <td className={`px-3 py-2 text-xs font-semibold ${s.c}`}>
                    {s.l}
                    {c.task_due_at && c.sla_status !== "not_applicable" ? <div className="font-normal text-muted-foreground">до {fmtDate(c.task_due_at)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{c.external_id ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {q.error ? <p className="text-sm text-destructive">{(q.error as any)?.message ?? "Помилка завантаження"}</p> : null}

      {openCallId ? <BinotelCallDialog generalCallId={openCallId} onClose={() => setOpenCallId(null)} /> : null}
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
