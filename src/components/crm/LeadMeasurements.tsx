/**
 * Блок «Заміри» в картці ліда. Джерело — order_measurements (канонічна сутність);
 * заміри з календаря, сторінки замірів і картки ліда відображаються тут однаково.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock, Plus, Loader2, Ruler } from "lucide-react";
import {
  listLeadMeasurements, listMeasurementTargets, saveMeasurementResult,
  scheduleMeasurement, setMeasurementStatus,
} from "@/lib/measurements.functions";
import { MEASUREMENT_STATUSES, MEASUREMENT_STATUS_LABELS, type MeasurementStatus } from "@/lib/measurement-status";
import { MeasurementCard, MeasurementStatusBadge, type MeasurementCardRow } from "@/components/crm/MeasurementCard";

const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function LeadMeasurements({
  leadId, orderId, clientName, address,
}: { leadId: string; orderId?: string | null; clientName?: string | null; address?: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listLeadMeasurements);
  const targetsFn = useServerFn(listMeasurementTargets);
  const scheduleFn = useServerFn(scheduleMeasurement);
  const statusFn = useServerFn(setMeasurementStatus);
  const resultFn = useServerFn(saveMeasurementResult);

  const key = ["crm", "lead-measurements", leadId];
  const { data: rows = [], isLoading } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { lead_id: leadId } }) });
  const { data: targets } = useQuery({ queryKey: ["measurement-targets"], queryFn: () => targetsFn({ data: { q: "" } }) });
  const employees = (targets?.employees ?? []) as { id: string; name: string }[];

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ when: "", employee_id: "", address: address ?? "", notes: "", done: false, area: "" });
  const [cardId, setCardId] = useState<string | null>(null);
  const card = (rows as any[]).find((r) => r.id === cardId) as MeasurementCardRow | undefined;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["measurements"] });
    qc.invalidateQueries({ queryKey: ["crm", "lead-card", leadId] });
  };

  const create = useMutation({
    mutationFn: () => scheduleFn({ data: {
      title: `Замір${clientName ? ` · ${clientName}` : ""}`,
      starts_at: new Date(form.when).toISOString(),
      duration_min: 60,
      event_type: "measure_primary",
      address: form.address || null,
      client_name: clientName ?? null,
      employee_id: form.employee_id || null,
      lead_id: leadId,
      order_id: orderId ?? null,
      description: form.notes || null,
      area: form.area === "" ? null : Number(form.area),
      already_done: form.done,
    } }),
    onSuccess: () => {
      toast.success(form.done ? "Проведений замір внесено" : "Замір заплановано і додано в календар");
      setAdding(false); setForm({ when: "", employee_id: "", address: address ?? "", notes: "", done: false, area: "" });
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити замір"),
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; status: MeasurementStatus; surveyor_id?: string | null; scheduled_at?: string | null }) => statusFn({ data: p }),
    onSuccess: () => { refresh(); toast.success("Замір оновлено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const saveResult = useMutation({
    mutationFn: (p: any) => resultFn({ data: {
      id: p.id,
      area: p.area === "" || p.area == null ? null : Number(p.area),
      perimeter: p.perimeter === "" || p.perimeter == null ? null : Number(p.perimeter),
      notes: p.notes || null, address: p.address || null, complete: Boolean(p.complete),
    } }),
    onSuccess: (_r, p: any) => { refresh(); toast.success(p.complete ? "Замір завершено" : "Результат збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти результат"),
  });

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2 font-display text-sm font-bold"><Ruler className="h-4 w-4" /> Заміри ({(rows as any[]).length})</div>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Додати замір
        </button>
      </div>

      {adding ? (
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs"><span className="text-muted-foreground">Дата і час (можна минулу)</span>
            <input type="datetime-local" className={inp} value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></label>
          <label className="space-y-1 text-xs"><span className="text-muted-foreground">Замірник</span>
            <select className={inp} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Не призначено</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="space-y-1 text-xs sm:col-span-2"><span className="text-muted-foreground">Адреса</span>
            <input className={inp} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="space-y-1 text-xs"><span className="text-muted-foreground">Площа, м² (якщо відома)</span>
            <input type="number" className={inp} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs">
            <input type="checkbox" checked={form.done} onChange={(e) => setForm({ ...form, done: e.target.checked })} />
            Замір вже проведено
          </label>
          <label className="space-y-1 text-xs sm:col-span-2"><span className="text-muted-foreground">Коментар</span>
            <textarea rows={2} className={inp} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => setAdding(false)} className="rounded-md border border-border px-3 py-1.5 text-xs">Скасувати</button>
            <button disabled={!form.when || create.isPending} onClick={() => create.mutate()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Зберегти замір
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="text-sm text-muted-foreground">Завантаження…</div> : null}
      {!isLoading && !(rows as any[]).length ? <div className="py-3 text-center text-sm text-muted-foreground">Замірів ще немає</div> : null}

      <div className="space-y-2">
        {(rows as any[]).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
            <button onClick={() => setCardId(r.id)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{fmt(r.measured_at ?? r.scheduled_at ?? r.created_at)}</span>
                <MeasurementStatusBadge status={r.status} />
                {r.area != null ? <span className="text-xs text-muted-foreground">{r.area} м²</span> : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.surveyor_name ?? "замірник не призначений"} · {r.address ?? r.order_address ?? "адреса не вказана"}
                {r.order_number ? ` · замовлення ${r.order_number}` : ""}
              </div>
            </button>
            <select value={r.status} onChange={(e) => patch.mutate({ id: r.id, status: e.target.value as MeasurementStatus })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs" aria-label="Статус заміру">
              {MEASUREMENT_STATUSES.map((s) => <option key={s} value={s}>{MEASUREMENT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        ))}
      </div>

      {card ? (
        <MeasurementCard
          row={card}
          employees={employees}
          busy={patch.isPending || saveResult.isPending}
          onClose={() => setCardId(null)}
          onStatus={(status) => patch.mutate({ id: card.id, status })}
          onAssign={(p) => patch.mutate({
            id: card.id,
            status: (p.surveyor_id && card.status === "planned" ? "assigned" : card.status) as MeasurementStatus,
            surveyor_id: p.surveyor_id, scheduled_at: p.scheduled_at,
          })}
          onResult={(p) => saveResult.mutate({ id: card.id, ...p })}
          onEstimate={() => navigate({ to: "/crm/measurements" })}
        />
      ) : null}
    </section>
  );
}
