import { createFileRoute, Link, redirect, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft, Phone, Mail, MapPin, User, ExternalLink, Save, Play, Package, FileText,
  Banknote, History, CheckSquare, MessageSquare, LayoutGrid,
} from "lucide-react";
import { getClientDetail, upsertClient, listClientManagers } from "@/lib/clients.functions";
import { getCallRecording } from "@/lib/crm.functions";
import { UnifiedTimeline } from "@/components/crm/UnifiedTimeline";
import { formatUah } from "@/lib/screed-calc";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/clients/$id")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Картка клієнта — TERZI ERP" },
      { name: "description", content: "Картка клієнта TERZI: замовлення, кошториси, фінанси, таймлайн, задачі та коментарі." },
      { property: "og:title", content: "Картка клієнта — TERZI ERP" },
      { property: "og:description", content: "Повна історія клієнта TERZI в одному місці." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientCard,
});

const TABS = [
  { key: "overview", label: "Огляд", Icon: LayoutGrid },
  { key: "orders", label: "Замовлення", Icon: Package },
  { key: "estimates", label: "Кошториси", Icon: FileText },
  { key: "finance", label: "Фінанси", Icon: Banknote },
  { key: "timeline", label: "Таймлайн", Icon: History },
  { key: "tasks", label: "Задачі", Icon: CheckSquare },
  { key: "comments", label: "Коментарі", Icon: MessageSquare },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("uk-UA");
};
const fmtDT = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-black ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function CallRow({ call }: { call: any }) {
  const recFn = useServerFn(getCallRecording);
  const [url, setUrl] = useState<string | null>(call.recording_url ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await recFn({ data: { call_id: call.id } });
      if (r?.url) setUrl(r.url); else setMsg(r?.reason ?? "Запис недоступний");
    } catch (e: any) {
      setMsg(e?.message ?? "Запис недоступний");
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded border border-border bg-secondary/30 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold inline-flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-primary" />
          {call.direction === "inbound" ? "Вхідний" : "Вихідний"} · {call.phone_e164 ?? call.from_number ?? call.to_number ?? "—"}
          {!call.client_id && <span className="text-[10px] text-warning">за номером</span>}
        </span>
        <span className="text-muted-foreground">{fmtDT(call.started_at ?? call.created_at)}</span>
      </div>
      <div className="mt-2">
        {url ? (
          <audio controls preload="none" src={url} className="w-full h-8" />
        ) : (
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 font-semibold">
            <Play className="w-3 h-3" /> {loading ? "Завантаження…" : "Отримати запис"}
          </button>
        )}
        {msg && <span className="ml-2 text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

function ClientCard() {
  const { id } = useParams({ from: "/clients/$id" });
  const qc = useQueryClient();
  const detailFn = useServerFn(getClientDetail);
  const saveFn = useServerFn(upsertClient);
  const managersFn = useServerFn(listClientManagers);
  const [tab, setTab] = useState<TabKey>("overview");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-detail", id],
    queryFn: () => detailFn({ data: { id } }),
    retry: false,
  });
  const { data: managers = [] } = useQuery({ queryKey: ["client-managers"], queryFn: () => managersFn(), retry: false });

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { ...form, id, manager_id: form.manager_id || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-detail", id] }); qc.invalidateQueries({ queryKey: ["clients"] }); setEdit(false); },
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Завантаження…</div>;
  if (error || !data) return <div className="p-8 text-sm text-destructive">{(error as any)?.message ?? "Клієнта не знайдено"}</div>;

  const d = data as any;
  const c = d.client;
  const s = d.summary;
  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";
  const crmHref = c.crm_link || (c.external_id && c.external_source === "keycrm" ? `https://app.key-crm.com/buyers/${c.external_id}` : null);

  const startEdit = () => {
    setForm({
      name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "",
      notes: c.notes ?? "", source: c.source ?? "", manager_id: c.manager_id ?? "",
      crm_link: c.crm_link ?? "", status: c.status ?? "lead",
    });
    setEdit(true);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <Link to="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="w-3 h-3" /> До списку клієнтів
      </Link>

      <div className="panel p-5 mb-5">
        {!edit ? (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="hatch-accent h-1 w-12 mb-2 rounded" />
                <h1 className="text-2xl font-black">{c.name}</h1>
                <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                  {c.phone && (
                    <span className="inline-flex items-center gap-2">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${c.phone_e164 ?? c.phone}`} className="text-primary hover:underline">{c.phone}</a>
                    </span>
                  )}
                  {c.email && <span className="inline-flex items-center gap-2"><Mail className="w-3 h-3" />{c.email}</span>}
                  {c.address && <span className="inline-flex items-center gap-2"><MapPin className="w-3 h-3" />{c.address}</span>}
                  <span className="inline-flex items-center gap-2"><User className="w-3 h-3" />{c.manager_display ?? "Менеджер не вказаний"}</span>
                  <span>Джерело: {c.source ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {crmHref && (
                  <a href={crmHref} target="_blank" rel="noreferrer"
                    className="px-3 py-2 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> KeyCRM
                  </a>
                )}
                <button onClick={startEdit} className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold">
                  Редагувати
                </button>
              </div>
            </div>
            {c.notes && <div className="mt-3 rounded bg-secondary/40 p-3 text-xs">{c.notes}</div>}
          </>
        ) : (
          <div className="space-y-3">
            <input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ПІБ / назва" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inp} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Телефон" />
              <input className={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
              <input className={inp} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Адреса" />
              <input className={inp} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Джерело" />
              <select className={inp} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
                <option value="">Менеджер не вказаний</option>
                {(managers as any[]).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.user_id.slice(0, 8)}</option>)}
              </select>
              <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="lead">Лід</option><option value="active">В роботі</option>
                <option value="done">Закрито</option><option value="archived">Архів</option>
              </select>
              <input className={inp} value={form.crm_link} onChange={(e) => setForm({ ...form, crm_link: e.target.value })} placeholder="Посилання на CRM" />
            </div>
            <textarea className={inp} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Нотатки" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEdit(false)} className="px-4 py-2 rounded bg-secondary text-xs font-semibold">Скасувати</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}
                className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1">
                <Save className="w-3 h-3" /> Зберегти
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1 rounded px-3 py-2 text-xs font-semibold border ${
              tab === key ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 border-border text-muted-foreground"
            }`}>
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Замовлень" value={String(s.orders_count)} />
            <Stat label="Активних замовлень" value={String(s.active_orders)} />
            <Stat label="Сума договорів" value={formatUah(s.orders_total)} tone="text-primary" />
            <Stat label="Оплачено" value={formatUah(s.paid_total)} tone="text-success" />
            <Stat label="Борг" value={formatUah(s.debt_total)} tone={s.debt_total > 0 ? "text-destructive" : ""} />
            <Stat label="Остання активність" value={fmtDate(s.last_activity_at)} />
          </div>
          {d.calls.length > 0 && (
            <div className="panel p-4">
              <h2 className="font-bold text-sm mb-3">Останні дзвінки</h2>
              <div className="space-y-2">
                {d.calls.slice(0, 5).map((call: any) => <CallRow key={call.id} call={call} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="grid gap-3 md:grid-cols-2">
          {d.orders.map((o: any) => (
            <Link key={o.id} to="/orders/$id" params={{ id: o.id }} className="panel p-4 block hover:border-primary/60">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{o.number ?? "—"}</span>
                <span className="font-bold text-primary text-sm">{formatUah(Number(o.amount_total ?? 0))}</span>
              </div>
              <div className="mt-1 font-semibold text-sm truncate">{o.name}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {o.address ?? "—"} · оплачено {formatUah(Number(o.paid_total ?? 0))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] uppercase text-muted-foreground">
                <span className="rounded bg-secondary px-1.5 py-0.5">{o.commercial_status ?? "—"}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5">{o.production_status ?? "—"}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5">{o.financial_status ?? "—"}</span>
              </div>
            </Link>
          ))}
          {!d.orders.length && <div className="panel p-8 text-center text-sm text-muted-foreground md:col-span-2">Замовлень ще немає.</div>}
        </div>
      )}

      {tab === "estimates" && (
        <div className="panel p-4 overflow-x-auto">
          {d.estimates.length ? (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground uppercase text-[10px]">
                <tr><th className="text-left py-2">Номер</th><th className="text-left">Напрямок</th><th className="text-left">Статус</th><th className="text-right">Сума</th><th className="text-right">Дата</th></tr>
              </thead>
              <tbody>
                {d.estimates.map((e: any) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="py-2 font-mono">{e.number}</td>
                    <td>{e.module}</td>
                    <td>{e.status}</td>
                    <td className="text-right font-bold text-primary">{formatUah(Number(e.total_client ?? 0))}</td>
                    <td className="text-right text-muted-foreground">{fmtDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="text-sm text-muted-foreground text-center py-6">Кошторисів ще немає.</div>}
        </div>
      )}

      {tab === "finance" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <h2 className="font-bold text-sm mb-3">Рахунки</h2>
            {d.invoices.length ? d.invoices.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between border-t border-border py-2 text-xs">
                <span className="font-mono">{i.number}</span>
                <span className="text-muted-foreground">{i.status}</span>
                <span className="font-bold">{formatUah(Number(i.total ?? 0))}</span>
              </div>
            )) : <div className="text-xs text-muted-foreground">Рахунків немає.</div>}
          </div>
          <div className="panel p-4">
            <h2 className="font-bold text-sm mb-3">Платежі</h2>
            {d.payments.length ? d.payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between border-t border-border py-2 text-xs">
                <span>{p.direction === "in" ? "Надходження" : "Виплата"}</span>
                <span className="text-muted-foreground">{fmtDate(p.paid_at ?? p.created_at)}</span>
                <span className={`font-bold ${p.direction === "in" ? "text-success" : "text-destructive"}`}>{formatUah(Number(p.amount ?? 0))}</span>
              </div>
            )) : <div className="text-xs text-muted-foreground">Платежів немає.</div>}
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <div className="panel p-4">
          <UnifiedTimeline clientId={id} />
          {d.calls.length > 0 && (
            <div className="mt-5 space-y-2">
              <h2 className="font-bold text-sm">Записи розмов</h2>
              {d.calls.slice(0, 20).map((call: any) => <CallRow key={call.id} call={call} />)}
            </div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="panel p-4 space-y-2">
          {d.tasks.length ? d.tasks.map((t: any) => (
            <div key={t.id} className="rounded border border-border bg-secondary/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t.title}</span>
                <span className="uppercase text-[10px] text-muted-foreground">{t.status} · {t.priority}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Дедлайн: {fmtDate(t.due_at)}</div>
            </div>
          )) : <div className="text-xs text-muted-foreground">Задач немає.</div>}
        </div>
      )}

      {tab === "comments" && (
        <div className="panel p-4 space-y-2">
          {d.comments.length ? d.comments.map((m: any) => (
            <div key={m.id} className="rounded border border-border bg-secondary/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{m.author_name ?? "Користувач"}</span>
                <span className="text-muted-foreground">{fmtDT(m.created_at)}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
              <Link to="/orders/$id" params={{ id: m.order_id }} className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> До замовлення
              </Link>
            </div>
          )) : <div className="text-xs text-muted-foreground">Коментарів немає.</div>}
        </div>
      )}
    </div>
  );
}
