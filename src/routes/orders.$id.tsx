import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, MapPin, User, Phone, Trash2, Plus, MessageSquare, Ruler, Calculator, FileText, Calendar, DollarSign, Image as ImageIcon, ListChecks, History as HistoryIcon, LayoutGrid, Pencil, ExternalLink, Save, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrder, deleteOrder, updateOrderStatus, saveOrderZone, deleteOrderZone,
  addOrderComment, saveOrderMeasurement, saveOrderManagement,
} from "@/lib/orders.functions";
import {
  COMMERCIAL_STATUSES, PRODUCTION_STATUSES, FINANCIAL_STATUSES, RISK_LEVELS,
  COMMERCIAL_LABELS, PRODUCTION_LABELS, FINANCIAL_LABELS, SERVICE_LABELS, ORDER_SERVICES, RISK_LABELS,
} from "@/lib/orders.constants";
import { computeOrderKpi, readManagement, crmUrl, type ManagementData } from "@/lib/order-management";
import { useInternalAccess } from "@/lib/useInternalAccess";
import { formatUah } from "@/lib/screed-calc";
import { getOrderPnl } from "@/lib/finance.functions";
import { listReservations } from "@/lib/warehouse.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Картка замовлення — TERZI" },
    { name: "description", content: "Картка замовлення TERZI: клієнт, замір, розрахунки, кошториси, договори, фінанси та план/факт." },
    { property: "og:title", content: "Картка замовлення — TERZI" },
    { property: "og:description", content: "Повна картка замовлення TERZI з планом і фактом по доходу, витратах і строках." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ObjectDetailPage,
});

type Tab = "overview"|"measurements"|"calc"|"zones"|"estimates"|"contracts"|"finance"|"comments"|"tasks"|"history"|"production"|"files";

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const money = (v: number | null) => (v == null ? "—" : formatUah(v));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const dateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

function ObjectDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getOrder);
  const delFn = useServerFn(deleteOrder);
  const setStatusFn = useServerFn(updateOrderStatus);

  const { data, isLoading } = useQuery({ queryKey: ["object", id], queryFn: () => getFn({ data: { id } }) });
  const [tab, setTab] = useState<Tab>("overview");

  const statusMut = useMutation({
    mutationFn: (patch: any) => setStatusFn({ data: { id, ...patch } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["object", id] }); toast.success("Статус оновлено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  if (isLoading || !data) {
    return <AppShell><div className="p-6 text-sm text-muted-foreground">Завантаження…</div></AppShell>;
  }
  const o = data as any;
  const crm = crmUrl(o);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "overview", label: "Огляд", icon: LayoutGrid },
    { key: "measurements", label: "Замір", icon: Ruler },
    { key: "calc", label: "Розрахунки", icon: Calculator },
    { key: "zones", label: "Зони", icon: LayoutGrid },
    { key: "estimates", label: "Кошториси", icon: FileText },
    { key: "contracts", label: "Договори", icon: FileText },
    { key: "finance", label: "Фінанси", icon: DollarSign },
    { key: "comments", label: "Коментарі", icon: MessageSquare },
    { key: "tasks", label: "Задачі", icon: ListChecks },
    { key: "history", label: "Історія", icon: HistoryIcon },
    { key: "production", label: "Виробництво", icon: Calendar },
    { key: "files", label: "Файли", icon: ImageIcon },
  ];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> До реєстру
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs font-mono text-muted-foreground">{o.number}</div>
              <h1 className="text-xl md:text-2xl font-black">{o.name}</h1>
              {o.address && <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3.5 h-3.5" />{o.address}</div>}
            </div>
            <div className="flex items-center gap-3">
              {crm && (
                <a href={crm} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  Відкрити в KeyCRM <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={() => { if (confirm("Видалити замовлення?")) delFn({ data: { id } }).then(() => navigate({ to: "/orders" })); }}
                className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Видалити
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <StatusSelect label="Комерція" value={o.commercial_status} options={COMMERCIAL_STATUSES as any} labels={COMMERCIAL_LABELS}
              onChange={(v) => statusMut.mutate({ commercial_status: v })} />
            <StatusSelect label="Виробництво" value={o.production_status} options={PRODUCTION_STATUSES as any} labels={PRODUCTION_LABELS}
              onChange={(v) => statusMut.mutate({ production_status: v })} />
            <StatusSelect label="Фінанси" value={o.financial_status} options={FINANCIAL_STATUSES as any} labels={FINANCIAL_LABELS}
              onChange={(v) => statusMut.mutate({ financial_status: v })} />
            <StatusSelect label="Ризик" value={o.risk_level} options={RISK_LEVELS as any} labels={RISK_LABELS}
              onChange={(v) => statusMut.mutate({ risk_level: v })} />
          </div>

          {o.services?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {o.services.map((s: any) => (
                <span key={s.id ?? s.service} className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {SERVICE_LABELS[s.service] ?? s.service}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="scroll-x border-b border-border bg-secondary/40">
            <div className="flex min-w-max">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap ${tab === t.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 md:p-5">
            {tab === "overview" && <OverviewTab o={o} />}
            {tab === "measurements" && <MeasurementsTab o={o} />}
            {tab === "calc" && <CalcTab o={o} />}
            {tab === "zones" && <ZonesTab o={o} />}
            {tab === "estimates" && <EstimatesTab o={o} />}
            {tab === "contracts" && <ComingSoon text="Формування договору за шаблоном буде підключено у Хвилі 2. Тимчасово використовуйте кошториси зі статусом «Договір»." />}
            {tab === "finance" && <FinanceTab o={o} />}
            {tab === "comments" && <CommentsTab o={o} />}
            {tab === "tasks" && <ComingSoon text="Модуль задач буде підключено у Хвилі 4 (CRM)." />}
            {tab === "history" && <HistoryTab o={o} />}
            {tab === "production" && <ProductionTab o={o} />}
            {tab === "files" && <ComingSoon text="Файлове сховище буде підключено окремим релізом." />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatusSelect({ label, value, options, labels, onChange }: {
  label: string; value: string; options: readonly string[]; labels: Record<string,string>; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs">
        {options.map((s) => <option key={s} value={s}>{labels[s] ?? s}</option>)}
      </select>
    </div>
  );
}
function ComingSoon({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground bg-secondary/40 rounded p-4">{text}</div>;
}

/* ────────────────────────── Огляд ────────────────────────── */

function Field({ label, value, source }: { label: string; value: React.ReactNode; source?: string }) {
  return (
    <div className="bg-secondary/30 rounded p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {label}
        {source && <span className="rounded bg-primary/10 text-primary px-1 py-px text-[9px] normal-case">{source}</span>}
      </div>
      <div className="text-sm font-semibold mt-0.5 break-words">{value ?? "—"}</div>
    </div>
  );
}

function PnlBlock({ o, m }: { o: any; m: ManagementData }) {
  const kpi = computeOrderKpi(o, m);
  const rows: { label: string; plan: string; fact: string; delta: string; danger?: boolean }[] = [
    { label: "Дохід", plan: money(kpi.plan.revenue), fact: money(kpi.fact.revenue), delta: money(kpi.delta.revenue) },
    { label: "Витрати", plan: money(kpi.plan.cost), fact: money(kpi.fact.cost), delta: money(kpi.delta.cost) },
    { label: "Прибуток", plan: money(kpi.plan.profit), fact: money(kpi.fact.profit), delta: money(kpi.delta.profit) },
    { label: "Маржа", plan: pct(kpi.plan.margin), fact: pct(kpi.fact.margin), delta: kpi.delta.margin == null ? "—" : `${(kpi.delta.margin * 100).toFixed(1)} п.п.` },
    {
      label: "Дні", plan: kpi.days.plan == null ? "—" : String(kpi.days.plan),
      fact: kpi.days.fact == null ? "—" : String(kpi.days.fact),
      delta: kpi.days.delta == null ? "—" : `${kpi.days.delta > 0 ? "+" : ""}${kpi.days.delta}`,
      danger: (kpi.days.delta ?? 0) > 0,
    },
  ];
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-secondary/50 text-xs font-bold uppercase tracking-wider">P&L об'єкта</div>
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[420px]">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left px-3 py-1.5">Показник</th><th className="text-right px-3 py-1.5">План</th>
              <th className="text-right px-3 py-1.5">Факт</th><th className="text-right px-3 py-1.5">Відхилення</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 text-right">{r.plan}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{r.fact}</td>
                <td className={`px-3 py-1.5 text-right ${r.danger ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{r.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border-t border-border text-xs">
        <Field label="Оплачено" value={money(kpi.paid)} />
        <Field label="Залишок до оплати" value={money(kpi.due)} />
        <Field label="Ризик" value={RISK_LABELS[o.risk_level] ?? o.risk_level} />
      </div>
    </div>
  );
}

function OverviewTab({ o }: { o: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrderManagement);
  const { isInternal } = useInternalAccess();
  const m = readManagement(o);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>(() => ({
    address: o.address ?? "", source: o.source ?? "", crm_link: o.crm_link ?? "",
    planned_start: dateInput(o.planned_start), planned_end: dateInput(o.planned_end),
    services: (o.services ?? []).map((s: any) => s.service),
    estimate_total: m.estimate_total ?? "", contract_total: m.contract_total ?? "",
    planned_cost: m.planned_cost ?? "", actual_revenue: m.actual_revenue ?? "", actual_cost: m.actual_cost ?? "",
    actual_start: dateInput(m.actual_start), actual_end: dateInput(m.actual_end),
    source_detail: m.source_detail ?? "", responsible_name: m.responsible_name ?? "", foreman_name: m.foreman_name ?? "",
    work_description: m.work_description ?? "", internal_note: m.internal_note ?? "",
  }));

  const numOrNull = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));
  const strOrNull = (v: any) => (String(v ?? "").trim() === "" ? null : String(v).trim());

  const mut = useMutation({
    mutationFn: () => saveFn({ data: {
      id: o.id,
      address: strOrNull(form.address),
      source: strOrNull(form.source),
      crm_link: strOrNull(form.crm_link),
      planned_start: strOrNull(form.planned_start),
      planned_end: strOrNull(form.planned_end),
      services: form.services,
      management: {
        estimate_total: numOrNull(form.estimate_total),
        contract_total: numOrNull(form.contract_total),
        planned_cost: numOrNull(form.planned_cost),
        actual_revenue: numOrNull(form.actual_revenue),
        actual_cost: numOrNull(form.actual_cost),
        actual_start: strOrNull(form.actual_start),
        actual_end: strOrNull(form.actual_end),
        source_detail: strOrNull(form.source_detail),
        responsible_name: strOrNull(form.responsible_name),
        foreman_name: strOrNull(form.foreman_name),
        work_description: strOrNull(form.work_description),
        internal_note: strOrNull(form.internal_note),
      },
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["object", o.id] }); setEdit(false); toast.success("Збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти"),
  });

  const inputCls = "w-full rounded border border-input bg-background px-2 py-1.5 text-sm";
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const toggleService = (s: string) =>
    setForm((f: any) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x: string) => x !== s) : [...f.services, s] }));

  if (edit) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Редагування замовлення</div>
          <div className="flex gap-2">
            <button onClick={() => mut.mutate()} disabled={mut.isPending}
              className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold disabled:opacity-60">
              <Save className="w-3.5 h-3.5" /> {mut.isPending ? "Збереження…" : "Зберегти"}
            </button>
            <button onClick={() => setEdit(false)} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <X className="w-3.5 h-3.5" /> Скасувати
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Адреса</span>
            <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Джерело</span>
            <input className={inputCls} value={form.source} onChange={(e) => set("source", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Деталі джерела</span>
            <input className={inputCls} value={form.source_detail} onChange={(e) => set("source_detail", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Посилання KeyCRM</span>
            <input className={inputCls} value={form.crm_link} onChange={(e) => set("crm_link", e.target.value)} placeholder="https://app.key.crm/…" /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Відповідальний</span>
            <input className={inputCls} value={form.responsible_name} onChange={(e) => set("responsible_name", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Прораб</span>
            <input className={inputCls} value={form.foreman_name} onChange={(e) => set("foreman_name", e.target.value)} /></label>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Напрямки</div>
          <div className="flex flex-wrap gap-1.5">
            {ORDER_SERVICES.map((s) => (
              <button key={s} type="button" onClick={() => toggleService(s)}
                className={`text-[11px] px-2 py-1 rounded border ${form.services.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                {SERVICE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Плановий старт</span>
            <input type="date" className={inputCls} value={form.planned_start} onChange={(e) => set("planned_start", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Плановий фініш</span>
            <input type="date" className={inputCls} value={form.planned_end} onChange={(e) => set("planned_end", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Фактичний старт</span>
            <input type="date" className={inputCls} value={form.actual_start} onChange={(e) => set("actual_start", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Фактичний фініш</span>
            <input type="date" className={inputCls} value={form.actual_end} onChange={(e) => set("actual_end", e.target.value)} /></label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Сума кошторису, ₴</span>
            <input type="number" className={inputCls} value={form.estimate_total} onChange={(e) => set("estimate_total", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Сума договору, ₴</span>
            <input type="number" className={inputCls} value={form.contract_total} onChange={(e) => set("contract_total", e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Фактична вартість робіт, ₴</span>
            <input type="number" className={inputCls} value={form.actual_revenue} onChange={(e) => set("actual_revenue", e.target.value)} /></label>
          {isInternal && (
            <>
              <label className="text-xs space-y-1"><span className="text-muted-foreground">Планова собівартість, ₴</span>
                <input type="number" className={inputCls} value={form.planned_cost} onChange={(e) => set("planned_cost", e.target.value)} /></label>
              <label className="text-xs space-y-1"><span className="text-muted-foreground">Фактична собівартість, ₴</span>
                <input type="number" className={inputCls} value={form.actual_cost} onChange={(e) => set("actual_cost", e.target.value)} /></label>
            </>
          )}
        </div>

        <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Опис робіт</span>
          <textarea rows={3} className={inputCls} value={form.work_description} onChange={(e) => set("work_description", e.target.value)} /></label>
        <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Внутрішній коментар</span>
          <textarea rows={2} className={inputCls} value={form.internal_note} onChange={(e) => set("internal_note", e.target.value)} /></label>
      </div>
    );
  }

  const totalClient = (o.estimates ?? []).reduce((s: number, e: any) => s + Number(e.total_client ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">Огляд замовлення</div>
        <button onClick={() => setEdit(true)} className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold">
          <Pencil className="w-3.5 h-3.5" /> Редагувати
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <Field label="Клієнт" value={o.client ? (
          <Link to="/clients" className="text-primary hover:underline inline-flex items-center gap-1">
            <User className="w-3.5 h-3.5" />{o.client.name}
          </Link>
        ) : "—"} source={o.client ? "CRM" : undefined} />
        <Field label="Телефон" value={o.client?.phone ? (
          <a href={`tel:${String(o.client.phone).replace(/[^\d+]/g, "")}`} className="text-primary hover:underline inline-flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" />{o.client.phone}
          </a>
        ) : "—"} />
        <Field label="Джерело" value={m.source_detail ?? o.source ?? "—"} source={m.source_detail ? "Вручну" : o.source ? "CRM" : undefined} />
        <Field label="Менеджер" value={o.manager_display ?? m.responsible_name ?? "—"} source={o.manager_display ? "CRM" : m.responsible_name ? "Вручну" : undefined} />
        <Field label="Прораб" value={m.foreman_name ?? "—"} source={m.foreman_name ? "Вручну" : undefined} />
        <Field label="Адреса" value={o.address ?? "—"} />
        <Field label="Плановий період" value={`${fmtDate(o.planned_start)} → ${fmtDate(o.planned_end)}`} />
        <Field label="Фактичний період" value={`${fmtDate(m.actual_start)} → ${fmtDate(m.actual_end)}`} source={m.actual_start || m.actual_end ? "Вручну" : undefined} />
        <Field label="Сума кошторисів у системі" value={totalClient ? formatUah(totalClient) : "—"} source={totalClient ? "Кошторис" : undefined} />
      </div>

      <PnlBlock o={o} m={m} />

      {m.work_description && (
        <div className="bg-secondary/30 rounded p-3 text-sm">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Опис робіт</div>
          {m.work_description}
        </div>
      )}
      {isInternal && m.internal_note && (
        <div className="border border-warning/40 bg-warning/10 rounded p-3 text-sm">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Внутрішній коментар</div>
          {m.internal_note}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <StatBox label="Кошторисів" value={String((o.estimates ?? []).length)} />
        <StatBox label="Замерів" value={String((o.measurements ?? []).length)} />
        <StatBox label="Коментарів" value={String((o.comments ?? []).length)} />
        <StatBox label="Бронювань бригад" value={String((o.bookings ?? []).length)} />
      </div>

      <div className="text-xs text-muted-foreground">
        Створено: {new Date(o.created_at).toLocaleString("uk-UA")}
      </div>
    </div>
  );
}
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-black mt-0.5">{value}</div>
    </div>
  );
}

function CalcTab({ o }: { o: any }) {
  const links: { to: string; label: string }[] = [
    { to: "/screed", label: "Стяжка" },
    { to: "/roofing_pvc", label: "ПВХ-мембрана" },
    { to: "/roofing_rub", label: "Рубероїд/Акваізол" },
    { to: "/insulation", label: "Утеплення" },
    { to: "/demolition", label: "Демонтаж" },
  ];
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Розрахунки виконуються в калькуляторах; при збереженні вкажіть це замовлення ({o.number}) — кошторис зʼявиться у вкладці «Кошториси».
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.to} to={l.to as any} className="text-xs rounded border border-border px-3 py-1.5 font-semibold hover:border-primary">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}


function ZonesTab({ o }: { o: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrderZone);
  const delFn = useServerFn(deleteOrderZone);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ name: "", service: "", area: "", perimeter: "", thickness_cm: "" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["object", o.id] });

  const save = async () => {
    if (!form.name.trim()) return;
    await saveFn({ data: {
      order_id: o.id, name: form.name, service: form.service || null,
      area: form.area ? Number(form.area) : null,
      perimeter: form.perimeter ? Number(form.perimeter) : null,
      thickness_cm: form.thickness_cm ? Number(form.thickness_cm) : null,
    } });
    setAdding(false); setForm({ name: "", service: "", area: "", perimeter: "", thickness_cm: "" });
    invalidate();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Зони замовлення ({o.zones?.length ?? 0})</div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold">
          <Plus className="w-3.5 h-3.5" /> Додати зону
        </button>
      </div>
      {adding && (
        <div className="border border-border rounded p-3 space-y-2 bg-secondary/20">
          <input placeholder="Назва зони *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs">
              <option value="">— Послуга —</option>
              {ORDER_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
            </select>
            <input placeholder="Площа м²" type="number" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
            <input placeholder="Периметр м" type="number" value={form.perimeter} onChange={(e) => setForm({ ...form, perimeter: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
            <input placeholder="Товщина см" type="number" value={form.thickness_cm} onChange={(e) => setForm({ ...form, thickness_cm: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold">Зберегти</button>
            <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground">Відміна</button>
          </div>
        </div>
      )}
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="text-left px-2 py-1.5">Назва</th><th className="text-left px-2 py-1.5">Послуга</th>
              <th className="text-right px-2 py-1.5">Площа</th><th className="text-right px-2 py-1.5">Периметр</th>
              <th className="text-right px-2 py-1.5">Товщина</th><th className="text-left px-2 py-1.5">Статус</th><th /></tr>
          </thead>
          <tbody>
            {(o.zones ?? []).map((z: any) => (
              <tr key={z.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-semibold">{z.name}</td>
                <td className="px-2 py-1.5 text-xs">{z.service ? SERVICE_LABELS[z.service] : "—"}</td>
                <td className="px-2 py-1.5 text-right">{z.area ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{z.perimeter ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{z.thickness_cm ?? "—"}</td>
                <td className="px-2 py-1.5 text-xs">{z.status}</td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={async () => { if (confirm("Видалити зону?")) { await delFn({ data: { id: z.id } }); qc.invalidateQueries({ queryKey: ["object", o.id] }); } }}
                    className="text-destructive text-xs"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {(!o.zones || o.zones.length === 0) && (
              <tr><td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">Немає зон</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MeasurementsTab({ o }: { o: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrderMeasurement);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ type: "primary", measured_at: "", area: "", perimeter: "", weight_kg: "", notes: "" });

  const save = async () => {
    await saveFn({ data: {
      order_id: o.id, type: form.type,
      measured_at: form.measured_at || null,
      area: form.area ? Number(form.area) : null,
      perimeter: form.perimeter ? Number(form.perimeter) : null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      notes: form.notes || null, status: "done",
    } });
    setAdding(false); setForm({ type: "primary", measured_at: "", area: "", perimeter: "", weight_kg: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["object", o.id] });
  };

  const typeLabels: Record<string,string> = { primary: "Первинний", repeat: "Повторний", control: "Контрольний", as_built: "Виконавчий" };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Замовлення {o.number} · Замерів: {o.measurements?.length ?? 0} ·{" "}
          {(o.measurements ?? []).reduce((s: number, m: any) => s + (Number(m.weight_kg) || 0), 0).toLocaleString("uk-UA")} кг
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold">
          <Plus className="w-3.5 h-3.5" /> Додати замер
        </button>
      </div>
      {adding && (
        <div className="border border-border rounded p-3 space-y-2 bg-secondary/20">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs">
              {Object.entries(typeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="datetime-local" value={form.measured_at} onChange={(e) => setForm({ ...form, measured_at: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
            <input placeholder="Площа м²" type="number" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
            <input placeholder="Периметр м" type="number" value={form.perimeter} onChange={(e) => setForm({ ...form, perimeter: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
            <input placeholder="Вага, кг" type="number" step="0.01" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
              className="rounded border border-input bg-background px-2 py-1.5 text-xs" />
          </div>
          <textarea placeholder="Нотатки, основа, ...*" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs" />
          <div className="flex gap-2">
            <button onClick={save} className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 font-semibold">Зберегти</button>
            <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground">Відміна</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {(o.measurements ?? []).map((m: any) => (
          <div key={m.id} className="border border-border rounded p-3 text-sm">
            <div className="flex justify-between">
              <div className="font-semibold">{typeLabels[m.type] ?? m.type}</div>
              <div className="text-xs text-muted-foreground">
                {m.measured_at ? new Date(m.measured_at).toLocaleString("uk-UA") : "—"} · {m.status}
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Площа: {m.area ?? "—"} м² · Периметр: {m.perimeter ?? "—"} м · Вага: {m.weight_kg ?? "—"} кг
            </div>
            {m.notes && <div className="text-xs mt-1">{m.notes}</div>}
          </div>
        ))}
        {(!o.measurements || o.measurements.length === 0) && (
          <div className="text-center py-6 text-muted-foreground text-xs">Немає замерів</div>
        )}
      </div>
    </div>
  );
}

function EstimatesTab({ o }: { o: any }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Всі кошториси з полем order_id = {o.number}. Щоб прив'язати новий — при збереженні з калькулятора вкажіть замовлення.</div>
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left px-2 py-1.5">Номер</th><th className="text-left px-2 py-1.5">Модуль</th>
            <th className="text-left px-2 py-1.5">Статус</th><th className="text-right px-2 py-1.5">Сума</th>
            <th className="text-left px-2 py-1.5">Створено</th>
          </tr></thead>
          <tbody>
            {(o.estimates ?? []).map((e: any) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono text-xs">
                  <Link to="/history" className="text-primary hover:underline">{e.number}</Link>
                </td>
                <td className="px-2 py-1.5 text-xs">{e.module}</td>
                <td className="px-2 py-1.5 text-xs">{e.status}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{formatUah(Number(e.total_client ?? 0))}</td>
                <td className="px-2 py-1.5 text-xs">{new Date(e.created_at).toLocaleDateString("uk-UA")}</td>
              </tr>
            ))}
            {(!o.estimates || o.estimates.length === 0) && (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Немає кошторисів</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductionTab({ o }: { o: any }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Бронювання бригад для цього замовлення. Планування — в розділі «Операційний календар».</div>
      <div className="space-y-1">
        {(o.bookings ?? []).map((b: any) => (
          <div key={b.id} className="border border-border rounded p-2 text-sm flex justify-between">
            <div>
              <b>{b.crew_id ?? "Бригада"}</b> · {b.title ?? ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {b.start_at ? new Date(b.start_at).toLocaleString("uk-UA") : "—"}
            </div>
          </div>
        ))}
        {(!o.bookings || o.bookings.length === 0) && <div className="text-xs text-muted-foreground py-4 text-center">Немає бронювань</div>}
      </div>
      <Link to="/operations" className="text-primary text-xs hover:underline">→ Відкрити Операційний календар</Link>
    </div>
  );
}

function FinanceTab({ o }: { o: any }) {
  const pnlFn = useServerFn(getOrderPnl);
  const resFn = useServerFn(listReservations);
  const { data: pnl } = useQuery({ queryKey: ["order-pnl", o.id], queryFn: () => pnlFn({ data: { order_id: o.id } }) });
  const { data: reservations = [] } = useQuery({ queryKey: ["order-reservations", o.id], queryFn: () => resFn({ data: { order_id: o.id } }) });

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <StatBox label="Виручка (план)" value={formatUah(pnl?.revenuePlan ?? 0)} />
        <StatBox label="Оплачено (факт)" value={formatUah(pnl?.revenueFact ?? 0)} />
        <StatBox label="Виставлено рахунків" value={formatUah(pnl?.invoiced ?? 0)} />
        <StatBox label="Собівартість (план)" value={formatUah(pnl?.costPlan ?? 0)} />
        <StatBox label="Витрати (факт)" value={formatUah(pnl?.costFact ?? 0)} />
        <StatBox label="Прибуток факт / план" value={`${formatUah(pnl?.profitFact ?? 0)} / ${formatUah(pnl?.profitPlan ?? 0)}`} />
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Резерв матеріалів на складі</div>
        {(reservations as any[]).length === 0 && <div className="text-xs text-muted-foreground">Резервів під це замовлення немає.</div>}
        <div className="space-y-1">
          {(reservations as any[]).map((r) => (
            <div key={r.id} className="flex justify-between text-sm border-b border-border/50 py-1.5">
              <span>{r.item?.name ?? "—"}</span>
              <span className="text-muted-foreground">{Number(r.qty).toFixed(2)} {r.item?.unit} · {r.warehouse?.name ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 text-xs">
        <Link to="/finance" className="text-primary font-semibold hover:underline">Відкрити Фінанси</Link>
        <Link to="/warehouse" className="text-primary font-semibold hover:underline">Відкрити Склад</Link>
      </div>
    </div>
  );
}

function CommentsTab({ o }: { o: any }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addOrderComment);
  const [text, setText] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    await addFn({ data: { order_id: o.id, body: text } });
    setText(""); qc.invalidateQueries({ queryKey: ["object", o.id] });
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Написати коментар..." className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm" />
        <button onClick={send} className="bg-primary text-primary-foreground rounded px-3 py-2 text-sm font-semibold">Відправити</button>
      </div>
      <div className="space-y-2">
        {(o.comments ?? []).map((c: any) => (
          <div key={c.id} className="border border-border rounded p-2 text-sm">
            <div className="flex justify-between text-xs text-muted-foreground">
              <b>{c.author_name ?? "—"}</b>
              <span>{new Date(c.created_at).toLocaleString("uk-UA")}</span>
            </div>
            <div className="mt-1">{c.body}</div>
          </div>
        ))}
        {(!o.comments || o.comments.length === 0) && <div className="text-xs text-muted-foreground text-center py-4">Немає коментарів</div>}
      </div>
    </div>
  );
}

function HistoryTab({ o }: { o: any }) {
  const labels: Record<string,string> = {
    commercial_status: "Комерційний статус",
    production_status: "Виробничий статус",
    financial_status: "Фінансовий статус",
    risk_level: "Ризик",
  };
  return (
    <div className="space-y-1">
      {(o.history ?? []).map((h: any) => (
        <div key={h.id} className="border-b border-border py-1.5 text-xs">
          <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("uk-UA")}</span>{" "}
          <b>{labels[h.field] ?? h.field}</b>:{" "}
          <span className="text-muted-foreground">{h.old_value ?? "—"}</span> → <b>{h.new_value ?? "—"}</b>
        </div>
      ))}
      {(!o.history || o.history.length === 0) && <div className="text-xs text-muted-foreground text-center py-4">Історії немає</div>}
    </div>
  );
}
