import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, X, Trash2, ArrowRightCircle, Inbox } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listRequests, upsertRequest, deleteRequest, convertRequestToLead } from "@/lib/crm.functions";

export const Route = createFileRoute("/crm/requests")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Звернення — CRM TERZI" },
    { name: "description", content: "Вхідні звернення TERZI: сайт, телефон, месенджери. Обробка та конвертація в ліди." },
    { property: "og:title", content: "Звернення — CRM TERZI" },
    { property: "og:description", content: "Обробка вхідних звернень і швидка конвертація у ліди воронки продажів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: RequestsPage,
});

const CHANNELS = ["manual", "site", "phone", "telegram", "instagram", "facebook", "email", "viber"] as const;
const STATUSES: Record<string, string> = {
  new: "Нове", in_progress: "В роботі", converted: "Конвертовано", spam: "Спам", closed: "Закрито",
};
const empty = { id: "", channel: "manual", subject: "", message: "", contact_name: "", contact_phone: "", contact_email: "", source: "", campaign: "", status: "new" };

function RequestsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const listFn = useServerFn(listRequests);
  const saveFn = useServerFn(upsertRequest);
  const delFn = useServerFn(deleteRequest);
  const convFn = useServerFn(convertRequestToLead);

  const { data = [] } = useQuery({ queryKey: ["crm", "requests"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [form, setForm] = useState<any>(empty);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (data as any[]).filter((r) =>
      (tab === "all" || r.status === tab) &&
      (!nq || [r.subject, r.contact_name, r.contact_phone, r.message, r.channel].filter(Boolean).join(" ").toLowerCase().includes(nq)));
  }, [data, q, tab]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["crm"] }); };

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: { ...p, id: p.id || undefined } }),
    onSuccess: () => { invalidate(); setOpen(false); setForm(empty); toast.success("Звернення збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Звернення видалено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка видалення"),
  });
  const convert = useMutation({
    mutationFn: (id: string) => convFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Створено лід"); nav({ to: "/crm/leads" }); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося конвертувати"),
  });

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><Inbox className="w-6 h-6" /> Звернення</h1>
            <p className="text-sm text-muted-foreground">Вхідні заявки з усіх каналів</p>
          </div>
          <button onClick={() => { setForm(empty); setOpen(true); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2">
            <Plus className="w-4 h-4" /> Нове звернення
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", ...Object.keys(STATUSES)].map((s) => (
            <button key={s} onClick={() => setTab(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${tab === s ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
              {s === "all" ? "Усі" : STATUSES[s]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за темою, ім'ям, телефоном…"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>

        <div className="grid gap-3 md:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.subject || r.contact_name || "Без теми"}</div>
                  <div className="text-xs text-muted-foreground">{r.channel} · {STATUSES[r.status]}</div>
                </div>
                <button onClick={() => remove.mutate(r.id)} className="p-1 text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
              </div>
              {r.contact_phone ? <div className="text-sm">{r.contact_phone}</div> : null}
              {r.message ? <div className="text-xs text-muted-foreground line-clamp-2">{r.message}</div> : null}
              <div className="flex gap-2">
                <button onClick={() => { setForm({ ...empty, ...r }); setOpen(true); }} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-semibold">Редагувати</button>
                {r.status !== "converted" ? (
                  <button onClick={() => convert.mutate(r.id)} className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground">У лід</button>
                ) : null}
              </div>
            </div>
          ))}
          {!rows.length ? <div className="text-sm text-muted-foreground">Звернень немає</div> : null}
        </div>

        <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Тема</th>
                <th className="text-left px-3 py-2">Контакт</th>
                <th className="text-left px-3 py-2">Канал</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="text-left px-3 py-2">Створено</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.subject || "Без теми"}</div>
                    {r.message ? <div className="text-xs text-muted-foreground line-clamp-1">{r.message}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.contact_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.contact_phone || r.contact_email || ""}</div>
                  </td>
                  <td className="px-3 py-2">{r.channel}</td>
                  <td className="px-3 py-2">{STATUSES[r.status]}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.status !== "converted" ? (
                      <button onClick={() => convert.mutate(r.id)} title="Конвертувати в лід" className="p-1.5 text-primary"><ArrowRightCircle className="w-4 h-4" /></button>
                    ) : null}
                    <button onClick={() => { setForm({ ...empty, ...r }); setOpen(true); }} className="px-2 text-xs font-semibold">Ред.</button>
                    <button onClick={() => remove.mutate(r.id)} className="p-1.5 text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Звернень немає</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="font-bold">{form.id ? "Редагувати звернення" : "Нове звернення"}</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <Field label="Тема"><input className={inp} value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Канал">
                <select className={inp} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Статус">
                <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Ім'я контакту"><input className={inp} value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Телефон"><input className={inp} value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
              <Field label="Email"><input className={inp} value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Джерело"><input className={inp} value={form.source ?? ""} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
              <Field label="Кампанія"><input className={inp} value={form.campaign ?? ""} onChange={(e) => setForm({ ...form, campaign: e.target.value })} /></Field>
            </div>
            <Field label="Повідомлення"><textarea rows={3} className={inp} value={form.message ?? ""} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
              <button disabled={save.isPending} onClick={() => save.mutate(form)}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground">Зберегти</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
