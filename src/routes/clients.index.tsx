import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Phone, Mail, MapPin, Package, Banknote, Clock, User, Search, LayoutGrid, Table2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { listClients, upsertClient, listClientManagers, type ClientListRow } from "@/lib/clients.functions";
import { formatUah } from "@/lib/screed-calc";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/clients/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Клієнти — TERZI ERP" },
      { name: "description", content: "Реєстр клієнтів TERZI: замовлення, оплати, менеджери та остання активність." },
      { property: "og:title", content: "Клієнти — TERZI ERP" },
      { property: "og:description", content: "Реєстр клієнтів TERZI з фільтрами за статусом, джерелом і менеджером." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

const STATUSES: Record<string, { label: string; cls: string }> = {
  lead: { label: "Лід", cls: "bg-warning/20 text-warning" },
  active: { label: "В роботі", cls: "bg-primary/20 text-primary" },
  done: { label: "Закрито", cls: "bg-success/20 text-success" },
  archived: { label: "Архів", cls: "bg-muted text-muted-foreground" },
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("uk-UA");
}

function ClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const upsert = useServerFn(upsertClient);
  const managersFn = useServerFn(listClientManagers);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSource, setFSource] = useState("");
  const [fManager, setFManager] = useState("");
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", notes: "", source: "", manager_id: "",
    status: "lead" as "lead" | "active" | "done" | "archived",
  });

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => list() });
  const { data: managers = [] } = useQuery({ queryKey: ["client-managers"], queryFn: () => managersFn(), retry: false });

  const saveMut = useMutation({
    mutationFn: () => upsert({
      data: {
        ...form,
        manager_id: form.manager_id || null,
        source: form.source || null,
      } as any,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setForm({ name: "", phone: "", email: "", address: "", notes: "", source: "", manager_id: "", status: "lead" });
    },
  });

  const rows = clients as ClientListRow[];
  const sources = useMemo(
    () => Array.from(new Set(rows.map((c) => c.source).filter(Boolean))) as string[],
    [rows],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (fStatus && c.status !== fStatus) return false;
      if (fSource && c.source !== fSource) return false;
      if (fManager && c.manager_id !== fManager) return false;
      if (!needle) return true;
      return [c.name, c.phone, c.email, c.address].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [rows, q, fStatus, fSource, fManager]);

  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <AppShell>
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between border-b border-border pb-4 mb-4 gap-4 flex-wrap">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Клієнти</h1>
          <p className="text-sm text-muted-foreground mt-1">Картки клієнтів із замовленнями, оплатами та активністю.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => setView("cards")}
              className={`px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 ${view === "cards" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Картки
            </button>
            <button type="button" onClick={() => setView("table")}
              className={`px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 ${view === "table" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              <Table2 className="w-3.5 h-3.5" /> Таблиця
            </button>
          </div>
          <button onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Новий клієнт
          </button>
        </div>
      </div>


      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inp} pl-9`} placeholder="Пошук: ПІБ, телефон, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inp} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Усі статуси</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inp} value={fSource} onChange={(e) => setFSource(e.target.value)}>
          <option value="">Усі джерела</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inp} value={fManager} onChange={(e) => setFManager(e.target.value)}>
          <option value="">Усі менеджери</option>
          {(managers as any[]).map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.user_id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="panel p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black text-lg mb-4">Новий клієнт</h2>
            <div className="space-y-3">
              <input className={inp} placeholder="Назва / ПІБ" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className={inp} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <input className={inp} placeholder="Адреса" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="Джерело" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
                <select className={inp} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
                  <option value="">Менеджер не вказаний</option>
                  {(managers as any[]).map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.user_id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <textarea className={inp} placeholder="Нотатки" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "lead" })}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded bg-secondary text-xs font-semibold">Скасувати</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}
                className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs font-bold">Зберегти</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 text-xs text-muted-foreground">Знайдено: <span className="font-semibold text-foreground">{filtered.length}</span> із {rows.length}</div>

      {view === "table" ? (
        <div className="rounded-md border border-border bg-card overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,.12)]">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-3 py-2">Клієнт</th>
                <th className="text-left px-3 py-2">Контакти</th>
                <th className="text-left px-3 py-2">Менеджер / джерело</th>
                <th className="text-right px-3 py-2">Замовлень</th>
                <th className="text-right px-3 py-2">Сума</th>
                <th className="text-right px-3 py-2">Оплачено</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="text-left px-3 py-2">Активність</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = STATUSES[c.status] ?? STATUSES.lead;
                return (
                  <tr key={c.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-3 py-2 font-semibold">
                      <Link to="/clients/$id" params={{ id: c.id }} className="hover:text-primary">{c.name}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.phone ?? "—"}{c.email ? ` · ${c.email}` : ""}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.manager_display ?? "—"}{c.source ? ` · ${c.source}` : ""}</td>
                    <td className="px-3 py-2 text-right">{c.orders_count}</td>
                    <td className="px-3 py-2 text-right font-semibold text-primary">{formatUah(c.orders_total)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-success">{formatUah(c.paid_total)}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(c.last_activity_at)}</td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  {rows.length ? "Нічого не знайдено за фільтрами." : "Ще немає клієнтів. Додайте першого."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const st = STATUSES[c.status] ?? STATUSES.lead;
          return (
            <Link key={c.id} to="/clients/$id" params={{ id: c.id }}
              className="panel p-5 block hover:border-primary/60 transition-colors">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="font-bold text-lg truncate">{c.name}</div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    <a href={`tel:${c.phone_e164 ?? c.phone}`} onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline">{c.phone}</a>
                  </div>
                )}
                {c.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{c.email}</div>}
                {c.address && <div className="flex items-center gap-2 truncate"><MapPin className="w-3 h-3 shrink-0" />{c.address}</div>}
                <div className="flex items-center gap-2"><User className="w-3 h-3" />{c.manager_display ?? "Менеджер не вказаний"}{c.source ? ` · ${c.source}` : ""}</div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-border text-center">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground inline-flex items-center gap-1"><Package className="w-3 h-3" />Замовлень</div>
                  <div className="font-bold text-sm">{c.orders_count}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Сума</div>
                  <div className="font-bold text-sm text-primary">{formatUah(c.orders_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground inline-flex items-center gap-1"><Banknote className="w-3 h-3" />Оплачено</div>
                  <div className="font-bold text-sm text-success">{formatUah(c.paid_total)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" /> Остання активність: {fmtDate(c.last_activity_at)}
              </div>
            </Link>
          );
        })}
        {!filtered.length && (
          <div className="col-span-full panel p-10 text-center text-muted-foreground">
            {rows.length ? "Нічого не знайдено за фільтрами." : "Ще немає клієнтів. Додайте першого."}
          </div>
        )}
      </div>
      )}
    </div>
    </AppShell>
  );

}
