import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CalendarClock, Ruler, Plus, X, AlertTriangle, Target, FileSpreadsheet, Search, User } from "lucide-react";
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
import { CrmEyebrow, CrmKpi, CrmPage, CrmPanel, crmButton, crmButtonOutline, crmInput } from "@/components/crm/CrmUi";
import {
  MeasurementCard,
  MeasurementStatusBadge,
  type MeasurementCardRow,
} from "@/components/crm/MeasurementCard";

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
  const [estimateFor, setEstimateFor] = useState<{ id: string; module: string } | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeasurementStatus>("all");
  const [surveyorFilter, setSurveyorFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["measurements", from, to],
    queryFn: () => listFn({ data: { from, to } }),
  });
  const { data: targets } = useQuery({ queryKey: ["measurement-targets"], queryFn: () => targetsFn({ data: { q: "" } }) });
  const employees = (targets?.employees ?? []) as { id: string; name: string }[];

  const f = data?.funnel;
  const refresh = () => qc.invalidateQueries({ queryKey: ["measurements"] });

  const applyFilters = (list: any[]) => {
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (surveyorFilter === "none" ? Boolean(r.surveyor_id) : surveyorFilter !== "all" && r.surveyor_id !== surveyorFilter) return false;
      if (!q) return true;
      return [r.order_number, r.order_name, r.order_address, r.address, r.surveyor_name, r.notes]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q));
    });
  };

  const planned = useMemo(() => applyFilters(data?.planned ?? []), [data, search, statusFilter, surveyorFilter]);
  const rows = useMemo(() => applyFilters(data?.rows ?? []), [data, search, statusFilter, surveyorFilter]);
  const card = useMemo(
    () => (cardId ? ((data?.rows ?? []).find((r: any) => r.id === cardId) as MeasurementCardRow | undefined) ?? null : null),
    [cardId, data],
  );

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
    mutationFn: (p: { id: string; status: MeasurementStatus; surveyor_id?: string | null; scheduled_at?: string | null }) =>
      statusFn({ data: p }),
    onSuccess: () => { refresh(); toast.success("Замір оновлено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const saveResult = useMutation({
    mutationFn: (p: any) => resultFn({ data: {
      id: p.id,
      area: p.area === "" || p.area == null ? null : Number(p.area),
      perimeter: p.perimeter === "" || p.perimeter == null ? null : Number(p.perimeter),
      notes: p.notes || null,
      address: p.address || null,
      complete: Boolean(p.complete),
    } }),
    onSuccess: (_r, p: any) => { refresh(); toast.success(p.complete ? "Замір завершено" : "Чернетку збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти результат"),
  });

  const toEstimate = useMutation({
    mutationFn: (p: { id: string; module: string }) => estimateFn({ data: { measurement_id: p.id, module: p.module as any } }),
    onSuccess: (r: any) => {
      setEstimateFor(null);
      setCardId(null);
      toast.success(`Кошторис ${r.number} створено`);
      navigate({ to: `/${r.module}`, search: { estimate: r.estimate_id } as any });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити кошторис"),
  });

  const busy = patch.isPending || saveResult.isPending || toEstimate.isPending;

  return (
    <AppShell>
      <CrmPage className="mx-auto max-w-[1500px] space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CrmEyebrow>Польові роботи / Measurement</CrmEyebrow>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold md:text-3xl"><Ruler className="w-6 h-6" /> Заміри</h1>
            <p className="text-sm text-muted-foreground">Життєвий цикл заміру, факт замірів і конверсія лід → замір → договір</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={crmInput + " w-auto"} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={crmInput + " w-auto"} />
            <button onClick={() => { setForm(emptyForm); setOpen(true); }} className={crmButton}>
              <Plus className="w-4 h-4" /> Запланувати замір
            </button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <CrmKpi label="Ліди" value={String(f?.leads ?? 0)} />
          <CrmKpi label="Заміри (факт)" value={String(f?.measurements ?? 0)} tone="gold" />
          <CrmKpi label="Договори" value={String(f?.contracts ?? 0)} tone="success" />
          <CrmKpi label="Лід → замір" value={pctText(f?.leadToMeasure ?? null)} />
          <CrmKpi label="Замір → договір" value={pctText(f?.measureToContract ?? null)} />
          <CrmKpi label="Лід → договір" value={pctText(f?.leadToContract ?? null)} />
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

        <div className="flex flex-wrap items-center gap-2">
          {([["plan", `План (${planned.length})`], ["fact", `Усі за період (${rows.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук: об'єкт, адреса, замірник"
              className={crmInput + " pl-9"} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={crmInput + " w-auto"}>
            <option value="all">Усі статуси</option>
            {MEASUREMENT_STATUSES.map((s) => <option key={s} value={s}>{MEASUREMENT_STATUS_LABELS[s]}</option>)}
          </select>
          <select value={surveyorFilter} onChange={(e) => setSurveyorFilter(e.target.value)} className={crmInput + " w-auto"}>
            <option value="all">Усі замірники</option>
            <option value="none">Без замірника</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {isLoading ? <div className="text-sm text-muted-foreground">Завантаження…</div> : null}

        {tab === "plan" ? (
          <CrmPanel className="divide-y divide-border/60">
            {planned.map((e: any) => {
              const overdue = e.scheduled_at && new Date(e.scheduled_at).getTime() < Date.now();
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <CalendarClock className={`w-4 h-4 shrink-0 ${overdue ? "text-rose-600" : "text-primary"}`} />
                  <button onClick={() => setCardId(e.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{e.order_name ?? e.address ?? "Замір"}</span>
                      <MeasurementStatusBadge status={e.status} />
                      {overdue ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">прострочено</span> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {fmtDT(e.scheduled_at ?? e.created_at)} · {e.surveyor_name ?? "замірник не призначений"} · {e.address ?? e.order_address ?? "адреса не вказана"}
                    </div>
                  </button>
                  <select
                    value={e.surveyor_id ?? ""}
                    onChange={(ev) => patch.mutate({ id: e.id, status: (ev.target.value ? "assigned" : "planned") as MeasurementStatus, surveyor_id: ev.target.value || null })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    aria-label="Замірник"
                  >
                    <option value="">Замірник…</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                  <button onClick={() => setCardId(e.id)} className={`${crmButtonOutline} h-8 shrink-0 text-xs`}>Картка</button>
                </div>
              );
            })}
            {!planned.length && !isLoading ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Запланованих замірів немає</div> : null}
          </CrmPanel>
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
                {rows.map((r: any) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setCardId(r.id)}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDT(r.measured_at ?? r.scheduled_at ?? r.created_at)}</td>
                    <td className="px-3 py-2 truncate max-w-[280px]">{r.order_number ? `${r.order_number} · ` : ""}{r.order_name ?? r.order_address ?? r.address ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        {r.surveyor_name ? <User className="h-3 w-3 text-muted-foreground" /> : null}
                        {r.surveyor_name ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.area ?? "—"}</td>
                    <td className="px-3 py-2"><MeasurementStatusBadge status={r.status} /></td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${r.converted ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                        <Target className="w-3 h-3" />{r.converted ? "так" : "ні"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                      {r.status === "completed" ? (
                        <button onClick={() => setEstimateFor({ id: r.id, module: "screed" })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold">
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Кошторис
                        </button>
                      ) : (
                        <button onClick={() => setCardId(r.id)} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold">Картка</button>
                      )}
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
      </CrmPage>

      {card ? (
        <MeasurementCard
          row={card}
          employees={employees}
          busy={busy}
          onClose={() => setCardId(null)}
          onStatus={(status) => patch.mutate({ id: card.id, status })}
          onAssign={(p) => patch.mutate({
            id: card.id,
            status: (p.surveyor_id && card.status === "planned" ? "assigned" : card.status) as MeasurementStatus,
            surveyor_id: p.surveyor_id,
            scheduled_at: p.scheduled_at,
          })}
          onResult={(p) => saveResult.mutate({ id: card.id, ...p })}
          onEstimate={() => setEstimateFor({ id: card.id, module: "screed" })}
        />
      ) : null}

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
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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
