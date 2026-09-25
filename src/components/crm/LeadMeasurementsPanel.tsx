/**
 * Секція «Заміри» у картці ліда: список, статус, результат, планування.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Plus, Ruler, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  listMeasurementTargets,
  saveMeasurementResult,
  scheduleMeasurement,
  setMeasurementStatus,
} from "@/lib/measurements.functions";
import {
  MEASUREMENT_STATUSES,
  MEASUREMENT_STATUS_LABELS,
  type MeasurementStatus,
} from "@/lib/measurement-status";
import type { LeadMeasurement } from "@/lib/crm/board.server";

const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const lbl = "text-[11px] uppercase tracking-wider text-muted-foreground";

type LeadLike = {
  id: string;
  title?: string | null;
  address?: string | null;
  client_name?: string | null;
  client_id?: string | null;
  order_id?: string | null;
  area?: number | null;
};

export function LeadMeasurementsPanel({
  leadId,
  lead,
  measurements,
}: {
  leadId: string;
  lead: LeadLike | null;
  measurements: LeadMeasurement[];
}) {
  const qc = useQueryClient();
  const scheduleFn = useServerFn(scheduleMeasurement);
  const statusFn = useServerFn(setMeasurementStatus);
  const resultFn = useServerFn(saveMeasurementResult);
  const targetsFn = useServerFn(listMeasurementTargets);

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({
    title: "Замір",
    starts_at: "",
    duration_min: 60,
    event_type: "measure_primary",
    employee_id: "",
    address: lead?.address ?? "",
  });

  const { data: targets } = useQuery({
    queryKey: ["measurement-targets"],
    queryFn: () => targetsFn({ data: { q: "" } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm", "lead-card", leadId] });
    qc.invalidateQueries({ queryKey: ["measurements"] });
    qc.invalidateQueries({ queryKey: ["cal-events"] });
  };

  const schedule = useMutation({
    mutationFn: () =>
      scheduleFn({
        data: {
          title: form.title || `Замір — ${lead?.title ?? ""}`.trim(),
          starts_at: new Date(form.starts_at).toISOString(),
          duration_min: Number(form.duration_min) || 60,
          event_type: form.event_type,
          address: form.address || lead?.address || null,
          client_name: lead?.client_name ?? null,
          client_id: lead?.client_id ?? null,
          area: lead?.area ?? null,
          employee_id: form.employee_id || null,
          order_id: lead?.order_id ?? null,
          lead_id: leadId,
        },
      }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Замір заплановано");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося запланувати замір"),
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; status: MeasurementStatus; surveyor_id?: string | null }) =>
      statusFn({ data: p }),
    onSuccess: () => {
      invalidate();
      toast.success("Статус заміру оновлено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const saveResult = useMutation({
    mutationFn: (p: any) =>
      resultFn({
        data: {
          id: p.id,
          area: p.area === "" || p.area == null ? null : Number(p.area),
          perimeter: p.perimeter === "" || p.perimeter == null ? null : Number(p.perimeter),
          notes: p.notes || null,
          address: p.address || null,
          complete: true,
        },
      }),
    onSuccess: () => {
      invalidate();
      setResult(null);
      toast.success("Результат заміру збережено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти результат"),
  });

  const fmt = (v?: string | null) =>
    v
      ? new Date(v).toLocaleString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2 font-display text-sm font-bold">
          <Ruler className="h-4 w-4 text-primary" /> Заміри
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {measurements.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm((f) => ({
              ...f,
              address: lead?.address ?? f.address,
              title: `Замір — ${lead?.title ?? ""}`.trim() || "Замір",
            }));
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Запланувати замір
        </button>
      </div>

      {measurements.length ? (
        <div className="divide-y divide-border/60">
          {measurements.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {fmt(m.scheduled_at)} · {m.surveyor_name ?? "замірник не призначений"}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {m.address ?? "адреса не вказана"}
                  {m.area != null ? ` · ${m.area} м²` : ""}
                  {m.event_id ? "" : " · без події календаря"}
                </div>
              </div>
              <select
                value={m.status}
                onChange={(e) =>
                  patch.mutate({ id: m.id, status: e.target.value as MeasurementStatus })
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
              >
                {MEASUREMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MEASUREMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select
                value={m.surveyor_id ?? ""}
                onChange={(e) => {
                  const surveyor_id = e.target.value || null;
                  const status = (
                    surveyor_id && m.status === "planned" ? "assigned" : m.status
                  ) as MeasurementStatus;
                  patch.mutate({ id: m.id, status, surveyor_id });
                }}
                className="max-w-[140px] rounded-md border border-border bg-background px-2 py-1 text-xs"
                title="Замірник"
              >
                <option value="">Замірник…</option>
                {(targets?.employees ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setResult({
                    id: m.id,
                    area: m.area ?? "",
                    perimeter: "",
                    notes: m.notes ?? "",
                    address: m.address ?? "",
                  })
                }
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
              >
                Результат
              </button>
              {m.event_id ? (
                <Link
                  to="/operations"
                  search={{ cal: "measure" } as any}
                  className="text-muted-foreground hover:text-primary"
                  title="Календар замірів"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3 text-center text-sm text-muted-foreground">Замірів ще немає</div>
      )}


      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
          <div className="w-full space-y-3 rounded-t-2xl border border-border bg-card p-4 md:max-w-md md:rounded-2xl">
            <div className="font-bold">Запланувати замір</div>
            <label className="block space-y-1">
              <span className={lbl}>Назва</span>
              <input
                className={inp}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={lbl}>Дата й час</span>
                <input
                  type="datetime-local"
                  className={inp}
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className={lbl}>Хв</span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  className={inp}
                  value={form.duration_min}
                  onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) || 60 })}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className={lbl}>Замірник</span>
              <select
                className={inp}
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              >
                <option value="">Не призначено</option>
                {(targets?.employees ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Адреса</span>
              <input
                className={inp}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-border py-2 text-sm font-semibold"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={schedule.isPending || !form.starts_at}
                onClick={() => schedule.mutate()}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {schedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Зберегти
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
          <div className="w-full space-y-3 rounded-t-2xl border border-border bg-card p-4 md:max-w-md md:rounded-2xl">
            <div className="font-bold">Результат заміру</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={lbl}>Площа, м²</span>
                <input
                  type="number"
                  className={inp}
                  value={result.area}
                  onChange={(e) => setResult({ ...result, area: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className={lbl}>Периметр, м</span>
                <input
                  type="number"
                  className={inp}
                  value={result.perimeter}
                  onChange={(e) => setResult({ ...result, perimeter: e.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className={lbl}>Адреса</span>
              <input
                className={inp}
                value={result.address}
                onChange={(e) => setResult({ ...result, address: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Нотатки</span>
              <textarea
                className={`${inp} min-h-[80px]`}
                value={result.notes}
                onChange={(e) => setResult({ ...result, notes: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-1 rounded-md border border-border py-2 text-sm font-semibold"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={saveResult.isPending}
                onClick={() => saveResult.mutate(result)}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Зберегти й закрити
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
