/**
 * Картка заміру: призначення замірника, життєвий цикл статусу, результат заміру
 * і перехід у кошторис. Тільки презентація — уся логіка в measurements.functions.ts.
 */
import { useEffect, useState } from "react";
import {
  CalendarClock, CheckCircle2, ExternalLink, FileSpreadsheet, MapPin,
  Ruler, User, X, RotateCcw, Ban,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  MEASUREMENT_STATUS_LABELS,
  type MeasurementStatus,
} from "@/lib/measurement-status";
import { crmButton, crmButtonOutline, crmInput } from "@/components/crm/CrmUi";

export const MEASUREMENT_STATUS_TONE: Record<MeasurementStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  assigned: "bg-sky-100 text-sky-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-900",
  completed: "bg-emerald-100 text-emerald-800",
  canceled: "bg-rose-100 text-rose-800",
  rescheduled: "bg-orange-100 text-orange-900",
};

/** Основний ланцюг життєвого циклу (canceled / rescheduled — окремі дії). */
const FLOW: MeasurementStatus[] = ["planned", "assigned", "confirmed", "in_progress", "completed"];

const MEASUREMENT_TYPE_LABELS: Record<string, string> = {
  primary: "Первинний",
  repeat: "Повторний",
  control: "Контрольний",
  as_built: "Виконавчий",
};

export function MeasurementStatusBadge({ status }: { status: string }) {
  const s = status as MeasurementStatus;
  return (
    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${MEASUREMENT_STATUS_TONE[s] ?? "bg-muted"}`}>
      {MEASUREMENT_STATUS_LABELS[s] ?? status}
    </span>
  );
}

/** Кроковий індикатор статусу з переходом по кліку. */
export function MeasurementStepper({
  status, onPick, disabled,
}: { status: string; onPick: (s: MeasurementStatus) => void; disabled?: boolean }) {
  const idx = FLOW.indexOf(status as MeasurementStatus);
  const off = status === "canceled" || status === "rescheduled";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FLOW.map((s, i) => {
        const done = !off && idx >= 0 && i <= idx;
        const current = !off && i === idx;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              current
                ? "border-primary bg-primary text-primary-foreground"
                : done
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40",
            ].join(" ")}
          >
            {done && !current ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : null}
            {MEASUREMENT_STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

const fmtDT = (v?: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const toLocalInput = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export interface MeasurementCardRow {
  id: string;
  status: string;
  type: string | null;
  scheduled_at: string | null;
  measured_at: string | null;
  created_at: string | null;
  area: number | null;
  perimeter: number | null;
  notes: string | null;
  address: string | null;
  surveyor_id: string | null;
  surveyor_name: string | null;
  order_id: string | null;
  order_number: string | null;
  order_name: string | null;
  order_address: string | null;
  client_id: string | null;
  lead_id: string | null;
  converted: boolean;
}

export function MeasurementCard({
  row, employees, busy, onClose, onStatus, onAssign, onResult, onEstimate,
}: {
  row: MeasurementCardRow;
  employees: { id: string; name: string }[];
  busy?: boolean;
  onClose: () => void;
  onStatus: (status: MeasurementStatus) => void;
  onAssign: (p: { surveyor_id: string | null; scheduled_at: string | null }) => void;
  onResult: (p: { area: string; perimeter: string; address: string; notes: string; complete: boolean }) => void;
  onEstimate: () => void;
}) {
  const [surveyor, setSurveyor] = useState(row.surveyor_id ?? "");
  const [when, setWhen] = useState(toLocalInput(row.scheduled_at));
  const [res, setRes] = useState({
    area: row.area == null ? "" : String(row.area),
    perimeter: row.perimeter == null ? "" : String(row.perimeter),
    address: row.address ?? "",
    notes: row.notes ?? "",
  });

  useEffect(() => {
    setSurveyor(row.surveyor_id ?? "");
    setWhen(toLocalInput(row.scheduled_at));
    setRes({
      area: row.area == null ? "" : String(row.area),
      perimeter: row.perimeter == null ? "" : String(row.perimeter),
      address: row.address ?? "",
      notes: row.notes ?? "",
    });
  }, [row.id, row.surveyor_id, row.scheduled_at, row.area, row.perimeter, row.address, row.notes]);

  const overdue = row.scheduled_at && new Date(row.scheduled_at).getTime() < Date.now()
    && !["completed", "canceled"].includes(row.status);

  const title = row.order_name || row.address || row.order_address || "Замір";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card md:max-w-2xl md:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MeasurementStatusBadge status={row.status} />
              <span className="text-[11px] font-semibold text-muted-foreground">
                {MEASUREMENT_TYPE_LABELS[row.type ?? "primary"] ?? "Замір"}
              </span>
              {overdue ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">прострочено</span> : null}
            </div>
            <div className="mt-1 truncate text-lg font-bold">{title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.order_number ? `${row.order_number} · ` : ""}{fmtDT(row.scheduled_at ?? row.created_at)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрити" className="shrink-0 rounded-md p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <section className="space-y-2">
            <SectionTitle icon={CheckCircle2}>Статус заміру</SectionTitle>
            <MeasurementStepper status={row.status} onPick={onStatus} disabled={busy} />
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => onStatus("rescheduled")}
                className={`${crmButtonOutline} h-8 text-xs`}>
                <RotateCcw className="h-3.5 w-3.5" /> Перенести
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus("canceled")}
                className={`${crmButtonOutline} h-8 text-xs text-rose-700`}>
                <Ban className="h-3.5 w-3.5" /> Скасувати замір
              </button>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <SectionTitle icon={User}>Призначення</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Замірник</span>
                <select className={crmInput} value={surveyor} onChange={(e) => setSurveyor(e.target.value)}>
                  <option value="">Не призначено</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Дата й час</span>
                <input type="datetime-local" className={crmInput} value={when} onChange={(e) => setWhen(e.target.value)} />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAssign({
                surveyor_id: surveyor || null,
                scheduled_at: when ? new Date(when).toISOString() : null,
              })}
              className={`${crmButton} h-9 text-xs`}
            >
              <CalendarClock className="h-4 w-4" /> Зберегти призначення
            </button>
            <p className="text-[11px] text-muted-foreground">
              Зміна синхронізується з подією в календарі заміру.
            </p>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <SectionTitle icon={Ruler}>Результат заміру</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Площа, м²">
                <input type="number" min={0} step="0.01" className={crmInput} value={res.area}
                  onChange={(e) => setRes({ ...res, area: e.target.value })} />
              </Labeled>
              <Labeled label="Периметр, м">
                <input type="number" min={0} step="0.01" className={crmInput} value={res.perimeter}
                  onChange={(e) => setRes({ ...res, perimeter: e.target.value })} />
              </Labeled>
            </div>
            <Labeled label="Адреса">
              <input className={crmInput} value={res.address} onChange={(e) => setRes({ ...res, address: e.target.value })} />
            </Labeled>
            <Labeled label="Нотатки">
              <textarea className="min-h-[90px] w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                value={res.notes} onChange={(e) => setRes({ ...res, notes: e.target.value })} />
            </Labeled>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => onResult({ ...res, complete: false })}
                className={`${crmButtonOutline} h-9 text-xs`}>Зберегти чернетку</button>
              <button type="button" disabled={busy} onClick={() => onResult({ ...res, complete: true })}
                className={`${crmButton} h-9 text-xs`}>
                <CheckCircle2 className="h-4 w-4" /> Завершити замір
              </button>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <SectionTitle icon={MapPin}>Зв'язки</SectionTitle>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Замовлення" value={
                row.order_id ? (
                  <Link to="/orders/$id" params={{ id: row.order_id }} className="inline-flex items-center gap-1 font-semibold text-primary">
                    {row.order_number ?? "Відкрити"} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : "не прив'язано"
              } />
              <Row label="Клієнт" value={
                row.client_id ? (
                  <Link to="/clients/$id" params={{ id: row.client_id }} className="inline-flex items-center gap-1 font-semibold text-primary">
                    Картка клієнта <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : "не прив'язано"
              } />
              <Row label="Лід" value={row.lead_id ? "прив'язано" : "—"} />
              <Row label="Виконано" value={fmtDT(row.measured_at)} />
              <Row label="Договір" value={row.converted ? "так" : "ні"} />
              <Row label="Адреса об'єкта" value={row.address ?? row.order_address ?? "—"} />
            </dl>
          </section>

          <button
            type="button"
            disabled={busy || row.status !== "completed"}
            onClick={onEstimate}
            className={`${crmButton} w-full`}
          >
            <FileSpreadsheet className="h-4 w-4" /> Створити кошторис із заміру
          </button>
          {row.status !== "completed" ? (
            <p className="text-center text-[11px] text-muted-foreground">Кошторис доступний після завершення заміру.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" /> {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
