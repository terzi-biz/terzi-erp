import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  listLeads, listPipelines, listContacts, upsertLead, moveLeadStage, deleteLead,
  listLeadActivities, addLeadNote,
} from "@/lib/crm.functions";

export const Route = createFileRoute("/crm/leads")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Воронка лідів — CRM TERZI" },
    { name: "description", content: "Канбан-воронка лідів TERZI: етапи, бюджети, відповідальні та історія змін." },
    { property: "og:title", content: "Воронка лідів — CRM TERZI" },
    { property: "og:description", content: "Керуйте лідами TERZI по етапах воронки продажів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LeadsPage,
});

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n || 0) + " ₴";
const emptyLead = { title: "", budget: "", area: "", address: "", source: "", direction: "", contact_id: "", notes: "" };

function LeadsPage() {
  const qc = useQueryClient();
  const leadsFn = useServerFn(listLeads);
  const pipeFn = useServerFn(listPipelines);
  const contactsFn = useServerFn(listContacts);
  const saveFn = useServerFn(upsertLead);
  const moveFn = useServerFn(moveLeadStage);
  const delFn = useServerFn(deleteLead);
  const actFn = useServerFn(listLeadActivities);
  const noteFn = useServerFn(addLeadNote);

  const { data: pipe } = useQuery({ queryKey: ["crm", "pipelines"], queryFn: () => pipeFn() });
  const { data: leads = [] } = useQuery({ queryKey: ["crm", "leads"], queryFn: () => leadsFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["crm", "contacts"], queryFn: () => contactsFn() });

  const [pipelineId, setPipelineId] = useState<string>("");
  const activePipeline = pipelineId || (pipe?.pipelines?.[0]?.id ?? "");
  const stages = useMemo(
    () => ((pipe?.stages ?? []) as any[]).filter((s) => s.pipeline_id === activePipeline),
    [pipe, activePipeline],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>(emptyLead);
  const [note, setNote] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm"] });

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => { invalidate(); setCreating(false); setForm(emptyLead); toast.success("Лід збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });
  const move = useMutation({
    mutationFn: (p: { id: string; stage_id: string }) => moveFn({ data: p }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { invalidate(); setOpenId(null); toast.success("Лід видалено"); },
  });
  const addNote = useMutation({
    mutationFn: (p: { lead_id: string; body: string }) => noteFn({ data: p }),
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["crm", "activities"] }); },
  });

  const openLead = (leads as any[]).find((l) => l.id === openId) || null;
  const { data: activities = [] } = useQuery({
    queryKey: ["crm", "activities", openId],
    queryFn: () => actFn({ data: { lead_id: openId! } }),
    enabled: !!openId,
  });

  const submitNew = () => {
    if (!form.title.trim()) { toast.error("Вкажіть назву ліда"); return; }
    save.mutate({
      title: form.title.trim(),
      pipeline_id: activePipeline || null,
      stage_id: stages[0]?.id ?? null,
      contact_id: form.contact_id || null,
      source: form.source || null,
      direction: form.direction || null,
      address: form.address || null,
      notes: form.notes || null,
      budget: form.budget ? Number(form.budget) : null,
      area: form.area ? Number(form.area) : null,
    });
  };

  const shift = (lead: any, dir: 1 | -1) => {
    const idx = stages.findIndex((s) => s.id === lead.stage_id);
    const next = stages[idx + dir];
    if (next) move.mutate({ id: lead.id, stage_id: next.id });
  };

  const STAGE_PALETTE = ["#99ccfd", "#ffce5a", "#ffdc7f", "#deff81", "#87f2c0", "#fd9b98", "#ccc8f9", "#f9deff"];

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Воронка лідів</h1>
            <p className="text-sm text-muted-foreground">Перетягування замінено кнопками ← → для зручності на мобільному</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={activePipeline} onChange={(e) => setPipelineId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              {((pipe?.pipelines ?? []) as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="w-4 h-4" /> Новий лід
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          {stages.map((s, si) => {
            const items = (leads as any[]).filter((l) => l.stage_id === s.id);
            const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
            const color = s.color || STAGE_PALETTE[si % STAGE_PALETTE.length];
            return (
              <div key={s.id} className="w-[272px] shrink-0 rounded-md bg-muted/40">
                <div className="rounded-t-md px-3 py-2" style={{ backgroundColor: color }}>
                  <div className="text-[12px] font-bold uppercase tracking-wide text-[#22303f] truncate">{s.name}</div>
                  <div className="text-[11px] font-medium text-[#22303f]/70">{items.length} лідів · {money(sum)}</div>
                </div>
                <div className="p-2 space-y-2 min-h-[120px]">
                  {items.map((l) => (
                    <div key={l.id} className="group rounded-[3px] bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.18)] border-l-[3px] hover:shadow-[0_2px_6px_rgba(0,0,0,.28)] transition-shadow"
                      style={{ borderLeftColor: color }}>
                      <button onClick={() => setOpenId(l.id)} className="block w-full text-left text-[13px] font-semibold leading-snug truncate hover:text-primary">
                        {l.title}
                      </button>
                      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{l.address || l.direction || "—"}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[13px] font-bold">{money(Number(l.budget || 0))}</span>
                        <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => shift(l, -1)} className="rounded-sm border border-border p-1 hover:bg-accent"><ChevronLeft className="w-3 h-3" /></button>
                          <button onClick={() => shift(l, 1)} className="rounded-sm border border-border p-1 hover:bg-accent"><ChevronRight className="w-3 h-3" /></button>
                        </span>
                      </div>
                      {l.source ? (
                        <span className="mt-2 inline-block rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l.source}</span>
                      ) : null}
                    </div>
                  ))}
                  {!items.length ? <div className="text-[11px] text-muted-foreground px-1 py-3">Порожньо</div> : null}
                </div>
              </div>
            );
          })}
          {!stages.length ? <div className="text-sm text-muted-foreground">Немає етапів у воронці</div> : null}
        </div>
      </div>


      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={() => setCreating(false)}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl bg-card border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Новий лід</h2>
              <button onClick={() => setCreating(false)}><X className="w-5 h-5" /></button>
            </div>
            {[
              { k: "title", label: "Назва *" },
              { k: "budget", label: "Бюджет, ₴", type: "number" },
              { k: "area", label: "Площа, м²", type: "number" },
              { k: "address", label: "Адреса" },
              { k: "source", label: "Джерело" },
              { k: "direction", label: "Напрям робіт" },
            ].map((f) => (
              <label key={f.k} className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</span>
                <input type={f.type ?? "text"} value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Контакт</span>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                {(contacts as any[]).map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Нотатки</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <button onClick={submitNew} disabled={save.isPending}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {save.isPending ? "Збереження…" : "Створити лід"}
            </button>
          </div>
        </div>
      ) : null}

      {openLead ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setOpenId(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-black">{openLead.title}</h2>
                <div className="text-xs text-muted-foreground">{money(Number(openLead.budget || 0))} · {openLead.status}</div>
              </div>
              <button onClick={() => setOpenId(null)}><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Площа" value={openLead.area ? `${openLead.area} м²` : "—"} />
              <Info label="Напрям" value={openLead.direction || "—"} />
              <Info label="Джерело" value={openLead.source || "—"} />
              <Info label="Адреса" value={openLead.address || "—"} />
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Етап</div>
              <select value={openLead.stage_id ?? ""} onChange={(e) => move.mutate({ id: openLead.id, stage_id: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Історія та нотатки</div>
              <div className="flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Додати нотатку…"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
                <button onClick={() => note.trim() && addNote.mutate({ lead_id: openLead.id, body: note.trim() })}
                  className="rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">OK</button>
              </div>
              <div className="mt-3 space-y-2">
                {(activities as any[]).map((a) => (
                  <div key={a.id} className="rounded-md border border-border px-3 py-2">
                    <div className="text-sm">{a.body}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("uk-UA")}</div>
                  </div>
                ))}
                {!activities.length ? <div className="text-xs text-muted-foreground">Подій ще немає</div> : null}
              </div>
            </div>

            <button onClick={() => { if (confirm("Видалити лід?")) remove.mutate(openLead.id); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 py-2 text-sm font-semibold text-destructive">
              <Trash2 className="w-4 h-4" /> Видалити лід
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}
