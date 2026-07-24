import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, FileText, Phone, Mail, MapPin, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { listClients, upsertClient, deleteClient } from "@/lib/clients.functions";
import { listEstimatesByClient, updateEstimateStatus, ESTIMATE_STATUSES } from "@/lib/estimates.functions";
import { formatUah } from "@/lib/screed-calc";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/clients")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ClientsPage,
});

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUSES: Record<string, { label: string; cls: string }> = {
  lead: { label: "Лід", cls: "bg-warning/20 text-warning" },
  active: { label: "В роботі", cls: "bg-primary/20 text-primary" },
  done: { label: "Закрито", cls: "bg-success/20 text-success" },
  archived: { label: "Архів", cls: "bg-muted text-muted-foreground" },
};

const EST_STATUS_LABEL: Record<string, string> = {
  preliminary: "Попередній", afterMeasure: "Після заміру", final: "Фінальний",
  inWork: "В роботі", done: "Виконано", refused: "Відмова",
  draft: "Чернетка", sent: "Надіслано", approved: "Затверджено", archived: "Архів",
};

const MODULE_ROUTES: Record<string, "/screed" | "/roofing" | "/insulation" | "/demolition"> = {
  screed: "/screed", roofing: "/roofing", insulation: "/insulation", demolition: "/demolition",
};

function ClientEstimates({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEstimatesByClient);
  const updFn = useServerFn(updateEstimateStatus);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["client-estimates", clientId],
    queryFn: () => listFn({ data: { client_id: clientId } }),
  });
  const updMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => updFn({ data: v as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-estimates", clientId] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
  if (isLoading) return <div className="text-xs text-muted-foreground p-2">Завантаження…</div>;
  if (!(rows as any[]).length) return <div className="text-xs text-muted-foreground p-2">Ще немає кошторисів для цього клієнта.</div>;
  return (
    <div className="mt-3 space-y-2">
      {(rows as any[]).map((e) => {
        const route = MODULE_ROUTES[e.module] ?? "/screed";
        return (
          <div key={e.id} className="rounded border border-border bg-secondary/30 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono truncate">{e.number}</div>
              <div className="font-bold text-primary whitespace-nowrap">{formatUah(Number(e.total_client))}</div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <select
                value={e.status}
                onChange={(ev) => updMut.mutate({ id: e.id, status: ev.target.value })}
                className="bg-input border border-border rounded px-1.5 py-1 text-[11px]"
              >
                {ESTIMATE_STATUSES.map((s) => (
                  <option key={s} value={s}>{EST_STATUS_LABEL[s] ?? s}</option>
                ))}
              </select>
              <Link to={route} search={{ estimate: e.id } as any}
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Відкрити
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const upsert = useServerFn(upsertClient);
  const del = useServerFn(deleteClient);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "", status: "lead" as const });

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => list() });
  const saveMut = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setOpen(false); setForm({ name: "", phone: "", email: "", address: "", notes: "", status: "lead" }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between border-b border-border pb-4 mb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl font-black">Клієнти / Проєкти</h1>
          <p className="text-sm text-muted-foreground mt-1">Картки клієнтів з кошторисами та статусом.</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Новий клієнт
        </button>
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
              <input className={inp} placeholder="Адреса об'єкта" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(clients as Client[]).map((c) => {
          const st = STATUSES[c.status] ?? STATUSES.lead;
          return (
            <div key={c.id} className="panel p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="font-bold text-lg">{c.name}</div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${st.cls}`}>{st.label}</span>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {c.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{c.phone}</div>}
                {c.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{c.email}</div>}
                {c.address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3" />{c.address}</div>}
              </div>
              {c.notes && <div className="mt-3 text-xs bg-secondary/40 rounded p-2">{c.notes}</div>}
              <div className="mt-4 flex gap-2 pt-3 border-t border-border">
                <Link to="/screed" className="flex-1 text-xs text-center py-2 rounded bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-1">
                  <FileText className="w-3 h-3" /> Кошторис
                </Link>
                <button onClick={() => confirm(`Видалити "${c.name}"?`) && delMut.mutate(c.id)}
                  className="px-2 py-2 rounded bg-destructive/10 text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
        {clients.length === 0 && (
          <div className="col-span-full panel p-10 text-center text-muted-foreground">
            Ще немає клієнтів. Додайте першого.
          </div>
        )}
      </div>
    </div>
  );
}
