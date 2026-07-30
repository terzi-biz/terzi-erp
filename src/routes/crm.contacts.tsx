import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, X, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listContacts, upsertContact, deleteContact, findContactDuplicates } from "@/lib/crm.functions";

export const Route = createFileRoute("/crm/contacts")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Контакти — CRM TERZI" },
    { name: "description", content: "База контактів TERZI з нормалізацією телефонів та перевіркою дублів." },
    { property: "og:title", content: "Контакти — CRM TERZI" },
    { property: "og:description", content: "Єдина база контактів TERZI: телефони, компанії, посади, нотатки." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ContactsPage,
});

const empty = { id: "", full_name: "", phone: "", email: "", company: "", position: "", notes: "" };

function ContactsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContacts);
  const saveFn = useServerFn(upsertContact);
  const delFn = useServerFn(deleteContact);
  const dupFn = useServerFn(findContactDuplicates);

  const { data = [] } = useQuery({ queryKey: ["crm", "contacts"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [form, setForm] = useState<any>(empty);
  const [open, setOpen] = useState(false);
  const [dups, setDups] = useState<any[]>([]);

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const nn = q.replace(/\D/g, "");
    return (data as any[]).filter((c) =>
      !nq || [c.full_name, c.company, c.email, c.phone].filter(Boolean).join(" ").toLowerCase().includes(nq)
      || (nn.length >= 3 && (c.phone_norm || "").includes(nn)));
  }, [data, q]);

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm", "contacts"] }); setOpen(false); setForm(empty); setDups([]); toast.success("Контакт збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm", "contacts"] }); toast.success("Контакт видалено"); },
  });

  const checkDup = async (phone: string) => {
    if (!phone || form.id) { setDups([]); return; }
    const res = await dupFn({ data: { phone } });
    setDups(res as any[]);
  };

  const submit = () => {
    if (!form.full_name.trim()) { toast.error("Вкажіть ім'я"); return; }
    save.mutate({
      id: form.id || undefined,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      company: form.company || null,
      position: form.position || null,
      notes: form.notes || null,
    });
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Контакти</h1>
            <p className="text-sm text-muted-foreground">Єдина база з перевіркою дублів за телефоном</p>
          </div>
          <button onClick={() => { setForm(empty); setDups([]); setOpen(true); }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Plus className="w-4 h-4" /> Новий контакт
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за іменем, телефоном, компанією…"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => { setForm({ ...empty, ...c, phone: c.phone ?? "", email: c.email ?? "", company: c.company ?? "", position: c.position ?? "", notes: c.notes ?? "" }); setOpen(true); }}
                  className="text-left text-sm font-bold truncate">{c.full_name}</button>
                <button onClick={() => { if (confirm("Видалити контакт?")) remove.mutate(c.id); }} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{c.phone || "—"}</div>
              <div className="text-xs text-muted-foreground truncate">{[c.position, c.company].filter(Boolean).join(" · ") || "—"}</div>
            </div>
          ))}
          {!rows.length ? <div className="text-sm text-muted-foreground">Контактів не знайдено</div> : null}
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl border border-border bg-card p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">{form.id ? "Редагувати контакт" : "Новий контакт"}</h2>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            {[
              { k: "full_name", label: "ПІБ *" },
              { k: "phone", label: "Телефон" },
              { k: "email", label: "Email" },
              { k: "company", label: "Компанія" },
              { k: "position", label: "Посада" },
            ].map((f) => (
              <label key={f.k} className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</span>
                <input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                  onBlur={f.k === "phone" ? (e) => checkDup(e.target.value) : undefined}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
            ))}
            {dups.length ? (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Знайдено можливі дублі:</div>
                <ul className="mt-1 list-disc pl-5">
                  {dups.map((d) => <li key={d.id}>{d.full_name} · {d.phone}</li>)}
                </ul>
              </div>
            ) : null}
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Нотатки</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <button onClick={submit} disabled={save.isPending}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {save.isPending ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
