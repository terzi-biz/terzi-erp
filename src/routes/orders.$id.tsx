import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, MapPin, User, Phone, Trash2, Plus, MessageSquare, Ruler, Calculator, FileText, Calendar, DollarSign, Image as ImageIcon, ListChecks, History as HistoryIcon, LayoutGrid } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrder, deleteOrder, updateOrderStatus, saveOrderZone, deleteOrderZone,
  addOrderComment, saveOrderMeasurement,
  COMMERCIAL_STATUSES, PRODUCTION_STATUSES, FINANCIAL_STATUSES, RISK_LEVELS,
  COMMERCIAL_LABELS, PRODUCTION_LABELS, FINANCIAL_LABELS, SERVICE_LABELS, ORDER_SERVICES,
} from "@/lib/orders.functions";
import { formatUah } from "@/lib/screed-calc";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/$id")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Карточка замовлення — TERZI" }] }),
  component: ObjectDetailPage,
});

type Tab = "overview"|"client"|"zones"|"measurements"|"estimates"|"contracts"|"production"|"finance"|"files"|"tasks"|"comments"|"history";

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

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "overview", label: "Огляд", icon: LayoutGrid },
    { key: "client", label: "Клієнт", icon: User },
    { key: "zones", label: "Зони", icon: LayoutGrid },
    { key: "measurements", label: "Замери", icon: Ruler },
    { key: "estimates", label: "Розрахунки", icon: Calculator },
    { key: "contracts", label: "Договори", icon: FileText },
    { key: "production", label: "Виробництво", icon: Calendar },
    { key: "finance", label: "Фінанси", icon: DollarSign },
    { key: "files", label: "Файли", icon: ImageIcon },
    { key: "tasks", label: "Задачі", icon: ListChecks },
    { key: "comments", label: "Коментарі", icon: MessageSquare },
    { key: "history", label: "Історія", icon: HistoryIcon },
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
            <button
              onClick={() => { if (confirm("Видалити замовлення?")) delFn({ data: { id } }).then(() => navigate({ to: "/orders" })); }}
              className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Видалити
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <StatusSelect label="Комерція" value={o.commercial_status} options={COMMERCIAL_STATUSES as any} labels={COMMERCIAL_LABELS}
              onChange={(v) => statusMut.mutate({ commercial_status: v })} />
            <StatusSelect label="Виробництво" value={o.production_status} options={PRODUCTION_STATUSES as any} labels={PRODUCTION_LABELS}
              onChange={(v) => statusMut.mutate({ production_status: v })} />
            <StatusSelect label="Фінанси" value={o.financial_status} options={FINANCIAL_STATUSES as any} labels={FINANCIAL_LABELS}
              onChange={(v) => statusMut.mutate({ financial_status: v })} />
            <StatusSelect label="Ризик" value={o.risk_level} options={RISK_LEVELS as any} labels={{ green:"Зелений", yellow:"Жовтий", red:"Червоний" }}
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
            {tab === "client" && <ClientTab o={o} />}
            {tab === "zones" && <ZonesTab o={o} />}
            {tab === "measurements" && <MeasurementsTab o={o} />}
            {tab === "estimates" && <EstimatesTab o={o} />}
            {tab === "contracts" && <ComingSoon text="Договори будуть підключені у наступному етапі. Тимчасово використовуйте кошториси зі статусом «Договір»." />}
            {tab === "production" && <ProductionTab o={o} />}
            {tab === "finance" && <FinanceTab o={o} />}
            {tab === "files" && <ComingSoon text="Файлове сховище буде підключено у наступному етапі (bucket object-files)." />}
            {tab === "tasks" && <ComingSoon text="Модуль задач буде підключено окремим релізом." />}
            {tab === "comments" && <CommentsTab o={o} />}
            {tab === "history" && <HistoryTab o={o} />}
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

function OverviewTab({ o }: { o: any }) {
  const totalClient = (o.estimates ?? []).reduce((s: number, e: any) => s + Number(e.total_client ?? 0), 0);
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <StatBox label="Кошторисів" value={String((o.estimates ?? []).length)} />
      <StatBox label="Сума КП" value={formatUah(totalClient)} />
      <StatBox label="Плановані роботи" value={String((o.bookings ?? []).length)} />
      <StatBox label="Замерів" value={String((o.measurements ?? []).length)} />
      <StatBox label="Коментарів" value={String((o.comments ?? []).length)} />
      <StatBox label="Файлів" value={String((o.files ?? []).length)} />
      <div className="md:col-span-3 text-xs text-muted-foreground">
        <b>Менеджер:</b> {o.manager_display ?? "—"} · <b>Створено:</b> {new Date(o.created_at).toLocaleString("uk-UA")}
        {o.crm_link && <> · <a href={o.crm_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">CRM ↗</a></>}
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

function ClientTab({ o }: { o: any }) {
  if (!o.client) return <div className="text-sm text-muted-foreground">Клієнта не прив'язано.</div>;
  return (
    <div className="space-y-2 text-sm">
      <div className="text-lg font-semibold flex items-center gap-2"><User className="w-4 h-4" />{o.client.name}</div>
      {o.client.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3.5 h-3.5" />{o.client.phone}</div>}
      {o.client.email && <div className="text-muted-foreground">{o.client.email}</div>}
      {o.client.address && <div className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{o.client.address}</div>}
      {o.client.notes && <div className="text-xs bg-secondary/40 p-2 rounded">{o.client.notes}</div>}
      <Link to="/clients" className="text-primary text-xs hover:underline">→ Відкрити картку в розділі Клієнти</Link>
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
  const [form, setForm] = useState<any>({ type: "primary", measured_at: "", area: "", perimeter: "", notes: "" });

  const save = async () => {
    await saveFn({ data: {
      order_id: o.id, type: form.type,
      measured_at: form.measured_at || null,
      area: form.area ? Number(form.area) : null,
      perimeter: form.perimeter ? Number(form.perimeter) : null,
      notes: form.notes || null, status: "done",
    } });
    setAdding(false); setForm({ type: "primary", measured_at: "", area: "", perimeter: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["object", o.id] });
  };

  const typeLabels: Record<string,string> = { primary: "Первинний", repeat: "Повторний", control: "Контрольний", as_built: "Виконавчий" };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Замери ({o.measurements?.length ?? 0})</div>
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
              Площа: {m.area ?? "—"} м² · Периметр: {m.perimeter ?? "—"} м
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
  const totalClient = (o.estimates ?? []).reduce((s: number, e: any) => s + Number(e.total_client ?? 0), 0);
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <StatBox label="План. виручка" value={formatUah(totalClient)} />
      <StatBox label="Оплачено" value={formatUah(0)} />
      <StatBox label="Заборгованість" value={formatUah(totalClient)} />
      <div className="md:col-span-3 text-xs text-muted-foreground">Повний платіжний календар та факт оплат буде підключено окремим релізом.</div>
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
