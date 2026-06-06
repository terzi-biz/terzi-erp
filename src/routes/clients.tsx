import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, FileText, Phone, Mail, MapPin } from "lucide-react";
import { listClients, upsertClient, deleteClient } from "@/lib/clients.functions";

export const Route = createFileRoute("/clients")({ component: ClientsPage });

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

function ClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const upsert = useServerFn(upsertClient);
  const del = useServerFn(deleteClient);
  const [open, setOpen] = useState(false);
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
