import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, SlidersHorizontal, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listPipelines, listContacts, upsertLead, moveLeadStage } from "@/lib/crm.functions";
import { listBoardLeads, listCrmStaff } from "@/lib/crm/board.functions";
import { LeadCardDialog } from "@/components/crm/LeadCardDialog";

export const Route = createFileRoute("/crm/leads")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Воронка лідів — CRM TERZI" },
    { name: "description", content: "Канбан-воронка лідів TERZI: активні етапи, фільтри, відповідальні менеджери та повна картка клієнта." },
    { property: "og:title", content: "Воронка лідів — CRM TERZI" },
    { property: "og:description", content: "Керуйте лідами TERZI по активних етапах воронки продажів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LeadsPage,
});

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n || 0) + " ₴";
const emptyLead = { title: "", budget: "", area: "", address: "", source: "", direction: "", contact_id: "", notes: "" };
const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const lbl = "text-[11px] uppercase tracking-wider text-muted-foreground";

const emptyFilters = {
  source: "", showLost: false, showWon: true,
  createdFrom: "", createdTo: "", closedFrom: "", closedTo: "",
  nextFrom: "", nextTo: "", manager: "", note: "", hasTask: "",
  utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "",
  service_type: "", object_type: "", areaFrom: "", areaTo: "",
  object_address: "", client_full_name: "", sumFrom: "", sumTo: "", contract_number: "",
};

function LeadsPage() {
  const qc = useQueryClient();
  const leadsFn = useServerFn(listBoardLeads);
  const pipeFn = useServerFn(listPipelines);
  const contactsFn = useServerFn(listContacts);
  const staffFn = useServerFn(listCrmStaff);
  const saveFn = useServerFn(upsertLead);
  const moveFn = useServerFn(moveLeadStage);

  const { data: pipe } = useQuery({ queryKey: ["crm", "pipelines"], queryFn: () => pipeFn() });
  const { data: leads = [] } = useQuery({ queryKey: ["crm", "board-leads"], queryFn: () => leadsFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["crm", "contacts"], queryFn: () => contactsFn() });
  const { data: staff = [] } = useQuery({ queryKey: ["crm", "staff"], queryFn: () => staffFn() });

  const [pipelineId, setPipelineId] = useState<string>("");
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>(emptyLead);
  const [openId, setOpenId] = useState<string | null>(null);

  const activePipeline = pipelineId || (pipe?.pipelines?.[0]?.id ?? "");
  const allStages = useMemo(
    () => ((pipe?.stages ?? []) as any[])
      .filter((s) => s.pipeline_id === activePipeline)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [pipe, activePipeline],
  );
  // У воронці — тільки активні робочі етапи та успішний; закриті/нереалізовані приховані.
  const stages = useMemo(
    () => allStages.filter((s) => (s.is_active !== false && !s.is_lost) || (filters.showLost && s.is_lost))
      .filter((s) => (filters.showWon ? true : !s.is_won)),
    [allStages, filters.showLost, filters.showWon],
  );

  const set = (k: string, v: any) => setFilters((f) => ({ ...f, [k]: v }));
  const inRange = (v: any, from: string, to: string) => {
    const n = Number(v);
    if (from !== "" && (!Number.isFinite(n) || n < Number(from))) return false;
    if (to !== "" && (!Number.isFinite(n) || n > Number(to))) return false;
    return true;
  };
  const inDate = (v: string | null, from: string, to: string) => {
    if (!from && !to) return true;
    if (!v) return false;
    const d = v.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const filtered = useMemo(() => (leads as any[]).filter((l) => {
    const f = l.fields ?? {};
    if (filters.source && !(l.source ?? "").toLowerCase().includes(filters.source.toLowerCase())) return false;
    if (filters.manager && l.assigned_to !== filters.manager) return false;
    if (filters.note && !(l.notes ?? "").toLowerCase().includes(filters.note.toLowerCase())) return false;
    if (!inDate(l.created_at, filters.createdFrom, filters.createdTo)) return false;
    if (!inDate(l.closed_at, filters.closedFrom, filters.closedTo)) return false;
    if (!inDate(l.next_action_at, filters.nextFrom, filters.nextTo)) return false;
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "object_address", "client_full_name", "contract_number"] as const) {
      const want = (filters as any)[k];
      if (want && !String(f[k] ?? "").toLowerCase().includes(String(want).toLowerCase())) return false;
    }
    if (filters.service_type && f["service_type"] !== filters.service_type) return false;
    if (filters.object_type && f["object_type"] !== filters.object_type) return false;
    if ((filters.areaFrom || filters.areaTo) && !inRange(f["object_area"] ?? l.area, filters.areaFrom, filters.areaTo)) return false;
    if ((filters.sumFrom || filters.sumTo) && !inRange(f["contract_sum"] ?? l.budget, filters.sumFrom, filters.sumTo)) return false;
    return true;
  }), [leads, filters]);

  const move = useMutation({
    mutationFn: (p: { id: string; stage_id: string }) => moveFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm"] }); setCreating(false); setForm(emptyLead); toast.success("Лід збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });

  const submitNew = () => {
    if (!form.title.trim()) { toast.error("Вкажіть назву ліда"); return; }
    save.mutate({
      title: form.title.trim(), pipeline_id: activePipeline || null, stage_id: stages[0]?.id ?? null,
      contact_id: form.contact_id || null, source: form.source || null, direction: form.direction || null,
      address: form.address || null, notes: form.notes || null,
      budget: form.budget ? Number(form.budget) : null, area: form.area ? Number(form.area) : null,
    });
  };

  const shift = (lead: any, dir: 1 | -1) => {
    const idx = stages.findIndex((s) => s.id === lead.stage_id);
    const next = stages[idx + dir];
    if (next) move.mutate({ id: lead.id, stage_id: next.id });
  };

  const PALETTE = ["#99ccfd", "#ffce5a", "#ffdc7f", "#deff81", "#87f2c0", "#a9d8ff", "#ccc8f9", "#f9deff", "#bde0fe", "#c7f9cc"];

  return (
    <AppShell>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Воронка лідів</h1>
            <p className="text-sm text-muted-foreground">
              Показані активні та успішні етапи · {filtered.length} лідів
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={activePipeline} onChange={(e) => setPipelineId(e.target.value)} className={inp + " w-auto"}>
              {((pipe?.pipelines ?? []) as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold ${showFilters ? "border-primary text-primary" : "border-border"}`}>
              <SlidersHorizontal className="h-4 w-4" /> Фільтри
            </button>
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Новий лід
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            <FilterGroup title="Воронка">
              <F label="Джерело"><input className={inp} value={filters.source} onChange={(e) => set("source", e.target.value)} /></F>
              <F label="Скасовані / нереалізовані">
                <Toggle on={filters.showLost} onClick={() => set("showLost", !filters.showLost)} labels={["Сховати", "Показати"]} />
              </F>
              <F label="Успішні">
                <Toggle on={filters.showWon} onClick={() => set("showWon", !filters.showWon)} labels={["Сховати", "Показати"]} />
              </F>
              <F label="Дата створення"><Range a={filters.createdFrom} b={filters.createdTo} type="date" onA={(v) => set("createdFrom", v)} onB={(v) => set("createdTo", v)} /></F>
              <F label="Дата закриття"><Range a={filters.closedFrom} b={filters.closedTo} type="date" onA={(v) => set("closedFrom", v)} onB={(v) => set("closedTo", v)} /></F>
              <F label="Час наступного контакту"><Range a={filters.nextFrom} b={filters.nextTo} type="date" onA={(v) => set("nextFrom", v)} onB={(v) => set("nextTo", v)} /></F>
              <F label="Менеджер">
                <select className={inp} value={filters.manager} onChange={(e) => set("manager", e.target.value)}>
                  <option value="">Виберіть</option>
                  {(staff as any[]).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name ?? s.user_id}</option>)}
                </select>
              </F>
              <F label="Замітка"><input className={inp} value={filters.note} onChange={(e) => set("note", e.target.value)} /></F>
            </FilterGroup>

            <FilterGroup title="Маркетинг">
              {(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const).map((k) => (
                <F key={k} label={k.replace("utm_", "UTM ")}>
                  <input className={inp} value={(filters as any)[k]} onChange={(e) => set(k, e.target.value)} />
                </F>
              ))}
            </FilterGroup>

            <FilterGroup title="Додаткові поля">
              <F label="Тип послуги">
                <select className={inp} value={filters.service_type} onChange={(e) => set("service_type", e.target.value)}>
                  <option value="">Будь-який</option>
                  {["Стяжка", "ПВХ мембрана", "Руберойд", "Утеплення", "Демонтаж", "Інше"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </F>
              <F label="Тип об'єкта">
                <select className={inp} value={filters.object_type} onChange={(e) => set("object_type", e.target.value)}>
                  <option value="">Будь-який</option>
                  {["Квартира", "Будинок", "Комерція", "Промисловість", "Дах", "Інше"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </F>
              <F label="Площа об'єкта, м²"><Range a={filters.areaFrom} b={filters.areaTo} type="number" onA={(v) => set("areaFrom", v)} onB={(v) => set("areaTo", v)} /></F>
              <F label="Сума договору, ₴"><Range a={filters.sumFrom} b={filters.sumTo} type="number" onA={(v) => set("sumFrom", v)} onB={(v) => set("sumTo", v)} /></F>
              <F label="Адреса об'єкта"><input className={inp} value={filters.object_address} onChange={(e) => set("object_address", e.target.value)} /></F>
              <F label="ПІБ клієнта"><input className={inp} value={filters.client_full_name} onChange={(e) => set("client_full_name", e.target.value)} /></F>
              <F label="Номер договору"><input className={inp} value={filters.contract_number} onChange={(e) => set("contract_number", e.target.value)} /></F>
            </FilterGroup>

            <div className="flex justify-end">
              <button onClick={() => setFilters({ ...emptyFilters })} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Скинути</button>
            </div>
          </div>
        ) : null}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {stages.map((s, si) => {
            const items = filtered.filter((l) => l.stage_id === s.id);
            const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
            const color = s.color || PALETTE[si % PALETTE.length];
            return (
              <div key={s.id} className="w-[286px] shrink-0 rounded-md bg-muted/40">
                <div className="rounded-t-md px-3 py-2" style={{ backgroundColor: color }}>
                  <div className="truncate text-[12px] font-bold uppercase tracking-wide text-[#22303f]">{s.name}</div>
                  <div className="text-[11px] font-medium text-[#22303f]/70">{items.length} лідів · {money(sum)}</div>
                </div>
                <div className="min-h-[120px] space-y-2 p-2">
                  {items.map((l) => (
                    <div key={l.id} className="group rounded-[3px] border-l-[3px] bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.18)] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,.28)]"
                      style={{ borderLeftColor: color }}>
                      <button onClick={() => setOpenId(l.id)} className="block w-full truncate text-left text-[13px] font-semibold leading-snug hover:text-primary">
                        {l.title}
                      </button>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" /><span className="truncate">{l.client_name ?? "Ім'я не вказане"}</span>
                      </div>
                      {l.phone ? (
                        <a href={`tel:${l.phone}`} className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sky-700 hover:underline">
                          <Phone className="h-3 w-3 shrink-0" />{l.phone}
                        </a>
                      ) : null}
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        Менеджер: {l.manager_name ?? "не призначений"}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[13px] font-bold">{money(Number(l.budget || 0))}</span>
                        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => shift(l, -1)} className="rounded-sm border border-border p-1 hover:bg-accent"><ChevronLeft className="h-3 w-3" /></button>
                          <button onClick={() => shift(l, 1)} className="rounded-sm border border-border p-1 hover:bg-accent"><ChevronRight className="h-3 w-3" /></button>
                        </span>
                      </div>
                      {l.source ? <span className="mt-2 inline-block rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l.source}</span> : null}
                    </div>
                  ))}
                  {!items.length ? <div className="px-1 py-3 text-[11px] text-muted-foreground">Порожньо</div> : null}
                </div>
              </div>
            );
          })}
          {!stages.length ? <div className="text-sm text-muted-foreground">Немає активних етапів у воронці</div> : null}
        </div>
      </div>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4" onClick={() => setCreating(false)}>
          <div className="max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-lg md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Новий лід</h2>
              <button onClick={() => setCreating(false)}><X className="h-5 w-5" /></button>
            </div>
            {[{ k: "title", label: "Назва *" }, { k: "budget", label: "Бюджет, ₴", type: "number" },
              { k: "area", label: "Площа, м²", type: "number" }, { k: "address", label: "Адреса" },
              { k: "source", label: "Джерело" }, { k: "direction", label: "Напрям робіт" }].map((f) => (
              <label key={f.k} className="block">
                <span className={lbl}>{f.label}</span>
                <input type={f.type ?? "text"} value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className={inp + " mt-1"} />
              </label>
            ))}
            <label className="block">
              <span className={lbl}>Контакт</span>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} className={inp + " mt-1"}>
                <option value="">—</option>
                {(contacts as any[]).map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Нотатки</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inp + " mt-1"} />
            </label>
            <button onClick={submitNew} disabled={save.isPending}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {save.isPending ? "Збереження…" : "Створити лід"}
            </button>
          </div>
        </div>
      ) : null}

      {openId ? <LeadCardDialog leadId={openId} stages={allStages} onClose={() => setOpenId(null)} /> : null}
    </AppShell>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 border-b border-border pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className={lbl}>{label}</span>{children}</label>;
}
function Range({ a, b, type, onA, onB }: { a: string; b: string; type: "date" | "number"; onA: (v: string) => void; onB: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input type={type} value={a} onChange={(e) => onA(e.target.value)} className={inp} />
      <span className="text-muted-foreground">—</span>
      <input type={type} value={b} onChange={(e) => onB(e.target.value)} className={inp} />
    </div>
  );
}
function Toggle({ on, onClick, labels }: { on: boolean; onClick: () => void; labels: [string, string] }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 text-sm">
      <span className={`h-5 w-9 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      <span className="text-xs font-semibold text-muted-foreground">{on ? labels[1] : labels[0]}</span>
    </button>
  );
}
