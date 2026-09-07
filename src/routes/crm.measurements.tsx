import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarClock, Ruler, Plus, X, AlertTriangle, Target, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  createEstimateFromMeasurement,
  listMeasurements,
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

export const Route = createFileRoute("/crm/measurements")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Заміри — CRM TERZI" },
    { name: "description", content: "Планування замірів, життєвий цикл замірника і конверсія лід → замір → договір у TERZI." },
    { property: "og:title", content: "Заміри — CRM TERZI" },
    { property: "og:description", content: "Календар замірів, замірники, план і факт, кошторис із заміру." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: MeasurementsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return iso(d); };
const fmtDT = (v?: string | null) => (v ? new Date(v).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const pctText = (v: number | null) => (v == null ? "немає даних" : `${v}%`);

const EVENT_TYPES = [
  ["measure_primary", "Первинний замір"],
  ["measure_repeat", "Повторний замір"],
  ["measure_control", "Контрольний замір"],
  ["measure_final", "Виконавчий замір"],
] as const;

const ESTIMATE_MODULES = [
  ["screed", "Стяжка"],
  ["roofing_pvc", "Покрівля ПВХ"],
  ["roofing_rub", "Покрівля наплавна"],
  ["insulation", "Утеплення"],
  ["demolition", "Демонтаж"],
] as const;

const STATUS_TONE: Record<MeasurementStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  assigned: "bg-sky-100 text-sky-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-900",
  completed: "bg-emerald-100 text-emerald-800",
  canceled: "bg-rose-100 text-rose-800",
  rescheduled: "bg-orange-100 text-orange-900",
};

const emptyForm = {
  title: "", starts_at: "", duration_min: 60, event_type: "measure_primary",
  address: "", client_name: "", employee_id: "", lead_id: "", order_id: "",
};

function MeasurementsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listMeasurements);
  const targetsFn = useServerFn(listMeasurementTargets);
  const scheduleFn = useServerFn(scheduleMeasurement);
  const statusFn = useServerFn(setMeasurementStatus);
  const resultFn = useServerFn(saveMeasurementResult);
  const estimateFn = useServerFn(createEstimateFromMeasurement);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(iso(new Date()));
  const [tab, setTab] = useState<"plan" | "fact">("plan");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [result, setResult] = useState<any>(null);
  const [estimateFor, setEstimateFor] = useState<{ id: string; module: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["measurements", from, to],
    queryFn: () => listFn({ data: { from, to } }),
  });
  const { data: targets } = useQuery({ queryKey: ["measurement-targets"], queryFn: () => targetsFn({ data: { q: "" } }) });

  const f = data?.funnel;
  const planned = data?.planned ?? [];
  const rows = data?.rows ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["measurements"] });

  const save = useMutation({
    mutationFn: (p: any) => scheduleFn({ data: {
      title: p.title || "Замір",
      starts_at: new Date(p.starts_at).toISOString(),
      duration_min: Number(p.duration_min) || 60,
      event_type: p.event_type,
      address: p.address || null,
      client_name: p.client_name || null,
      employee_id: p.employee_id || null,
      lead_id: p.lead_id || null,
      order_id: p.order_id || null,
    } }),
    onSuccess: () => { refresh(); setOpen(false); setForm(emptyForm); toast.success("Замір заплановано"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося запланувати замір"),
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; status: MeasurementStatus; surveyor_id?: string | null }) => statusFn({ data: p }),
    onSuccess: () => { refresh(); toast.success("Статус заміру оновлено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const saveResult = useMutation({
    mutationFn: (p: any) => resultFn({ data: {
      id: p.id,
      area: p.area === "" || p.area == null ? null : Number(p.area),
      perimeter: p.perimeter === "" || p.perimeter == null ? null : Number(p.perimeter),
      notes: p.notes || null,
      address: p.address || null,
      complete: true,
    } }),
    onSuccess: () => { refresh(); setResult(null); toast.success("Результат заміру збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти результат"),
  });

  const toEstimate = useMutation({
    mutationFn: (p: { id: string; module: string }) => estimateFn({ data: { measurement_id: p.id, module: p.module as any } }),
    onSuccess: (r: any) => {
      setEstimateFor(null);
      toast.success(`Кошторис ${r.number} створено`);
      navigate({ to: `/${r.module}`, search: { estimate: r.estimate_id } as any });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити кошторис"),
  });

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><Ruler className="w-6 h-6" /> Заміри</h1>
            <p className="text-sm text-muted-foreground">Життєвий цикл заміру, факт замірів і конверсія лід → замір → договір</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
            <button onClick={() => { setForm(emptyForm); setOpen(true); }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2">
              <Plus className="w-4 h-4" /> Запланувати замір
            </button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Ліди" value={String(f?.leads ?? 0)} />
          <Kpi label="Заміри (факт)" value={String(f?.measurements ?? 0)} />
          <Kpi label="Договори" value={String(f?.contracts ?? 0)} />
          <Kpi label="Лід → замір" value={pctText(f?.leadToMeasure ?? null)} />
          <Kpi label="Замір → договір" value={pctText(f?.measureToContract ?? null)} />
          <Kpi label="Лід → договір" value={pctText(f?.leadToContract ?? null)} />
        </div>

        {f && (f.overduePlanned > 0 || f.withoutSurveyor > 0) ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Потребує уваги: {f.overduePlanned} прострочених замірів без результату,
              {" "}{f.withoutSurveyor} без призначеного замірника.
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          {([["plan", `План (${planned.length})`], ["fact", `Усі за період (${rows.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
        </div>

        {isLoading ? <div className="text-sm text-muted-foreground">Завантаження…</div> : null}

        {tab === "plan" ? (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
            {planned.map((e) => (
              <div key={e.id} className="px-3 py-2.5 flex items-center gap-3 text-sm flex-wrap">
                <CalendarClock className="w-4 h-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{e.order_name ?? e.address ?? "Замір"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmtDT(e.scheduled_at ?? e.created_at)} · {e.surveyor_name ?? "замірник не призначений"} · {e.address ?? e.order_address ?? "адреса не вказана"}
                  </div>
                </div>
                <select
                  value={e.status}
                  onChange={(ev) => patch.mutate({ id: e.id, status: ev.target.value as MeasurementStatus })}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
                >
                  {MEASUREMENT_STATUSES.map((s) => <option key={s} value={s}>{MEASUREMENT_STATUS_LABELS[s]}</option>)}
                </select>
                <button
                  onClick={() => setResult({ id: e.id, area: e.area ?? "", perimeter: e.perimeter ?? "", notes: e.notes ?? "", address: e.address ?? "" })}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-semibold">
                  Результат
                </button>
              </div>
            ))}
            {!planned.length && !isLoading ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Запланованих замірів немає</div> : null}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Дата</th>
                  <th className="text-left px-3 py-2">Замовлення</th>
                  <th className="text-left px-3 py-2">Замірник</th>
                  <th className="text-right px-3 py-2">Площа, м²</th>
                  <th className="text-left px-3 py-2">Статус</th>
                  <th className="text-left px-3 py-2">Договір</th>
                  <th className="text-right px-3 py-2">Дія</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDT(r.measured_at ?? r.scheduled_at ?? r.created_at)}</td>
                    <td className="px-3 py-2 truncate max-w-[280px]">{r.order_number ? `${r.order_number} · ` : ""}{r.order_name ?? r.order_address ?? r.address ?? "—"}</td>
                    <td className="px-3 py-2">{r.surveyor_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.area ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_TONE[r.status as MeasurementStatus] ?? "bg-muted"}`}>
                        {MEASUREMENT_STATUS_LABELS[r.status as MeasurementStatus] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${r.converted ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                        <Target className="w-3 h-3" />{r.converted ? "так" : "ні"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === "completed" ? (
                        <button onClick={() => setEstimateFor({ id: r.id, module: "screed" })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold">
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Створити кошторис
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                {!rows.length && !isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">Замірів за період немає</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open ? (
        <Modal title="Запланувати замір" onClose={() => setOpen(false)}>
          <Field label="Назва">
            <input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Замір покрівлі" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата й час">
              <input type="datetime-local" className={inp} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </Field>
            <Field label="Тривалість, хв">
              <input type="number" min={15} step={15} className={inp} value={form.duration_min}
                onChange={(e) => setForm({ ...form, duration_min: e.target.value })} />
            </Field>
          </div>
          <Field label="Тип заміру">
            <select className={inp} value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
              {EVENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Замірник">
            <select className={inp} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Не призначено</option>
              {(targets?.employees ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Лід">
              <select className={inp} value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}>
                <option value="">—</option>
                {(targets?.leads ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.title || l.phone_e164 || l.id.slice(0, 8)}</option>)}
              </select>
            </Field>
            <Field label="Замовлення / договір">
              <select className={inp} value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}>
                <option value="">—</option>
                {(targets?.orders ?? []).map((o: any) => <option key={o.id} value={o.id}>{[o.number, o.name || o.address].filter(Boolean).join(" · ")}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Адреса">
            <input className={inp} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Клієнт">
            <input className={inp} value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </Field>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
            <button disabled={save.isPending || !form.starts_at} onClick={() => save.mutate(form)}
              className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Зберегти</button>
          </div>
        </Modal>
      ) : null}

      {result ? (
        <Modal title="Результат заміру" onClose={() => setResult(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Площа, м²">
              <input type="number" min={0} step="0.01" className={inp} value={result.area}
                onChange={(e) => setResult({ ...result, area: e.target.value })} />
            </Field>
            <Field label="Периметр, м">
              <input type="number" min={0} step="0.01" className={inp} value={result.perimeter}
                onChange={(e) => setResult({ ...result, perimeter: e.target.value })} />
            </Field>
          </div>
          <Field label="Адреса">
            <input className={inp} value={result.address} onChange={(e) => setResult({ ...result, address: e.target.value })} />
          </Field>
          <Field label="Нотатки">
            <textarea className={`${inp} min-h-[90px]`} value={result.notes} onChange={(e) => setResult({ ...result, notes: e.target.value })} />
          </Field>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setResult(null)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
            <button disabled={saveResult.isPending} onClick={() => saveResult.mutate(result)}
              className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Зберегти й закрити замір
            </button>
          </div>
        </Modal>
      ) : null}

      {estimateFor ? (
        <Modal title="Створити кошторис із заміру" onClose={() => setEstimateFor(null)}>
          <Field label="Напрям робіт">
            <select className={inp} value={estimateFor.module}
              onChange={(e) => setEstimateFor({ ...estimateFor, module: e.target.value })}>
              {ESTIMATE_MODULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Дані заміру (площа, периметр, адреса, нотатки) перенесуться в чернетку кошторису. Розрахунок виконується в калькуляторі напряму.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEstimateFor(null)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
            <button disabled={toEstimate.isPending} onClick={() => toEstimate.mutate(estimateFor)}
              className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Створити</button>
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="font-bold">{title}</div>
          <button onClick={onClose} aria-label="Закрити"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-[22px] leading-none font-black tracking-tight">{value}</div>
    </div>
  );
}
