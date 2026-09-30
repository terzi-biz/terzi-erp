import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, SlidersHorizontal, Phone, Search, CalendarClock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listPipelines, listContacts, upsertLead, moveLeadStage, findClientsQuick } from "@/lib/crm.functions";
import { SourceSelect, DirectionSelect } from "@/components/crm/RefSelects";
import { listBoardLeads, listCrmStaff } from "@/lib/crm/board.functions";
import { LeadCardDialog } from "@/components/crm/LeadCardDialog";
import { CrmPage, crmButtonOutline } from "@/components/crm/CrmUi";
import { SourceBadge } from "@/components/crm/SourceBadge";
import { LeadsFunnelCard } from "@/components/crm/LeadsFunnelCard";
import { CabinetGlyph } from "@/components/dashboard/v2/CabinetGlyph";
import { getLeadsFunnel } from "@/lib/marketing/cabinet-funnels.functions";
import { CABINET_KEYS, cabinetMeta, type CabinetKey } from "@/lib/marketing/cabinets";
import { kyivToday } from "@/lib/kyiv-time";
import { MONTHS_NOM, moneyShort } from "@/components/dashboard/v2/format";

export const Route = createFileRoute("/crm/leads")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    lead: typeof s.lead === "string" && s.lead.length > 0 ? s.lead : undefined,
  }),
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
const emptyLead = { title: "", budget: "", area: "", address: "", source: "", direction: "", contact_id: "", notes: "", client_id: "", client_name: "", client_phone: "", client_label: "" };

/** Клієнт нового ліда: вводимо імʼя + телефон; якщо номер уже є в базі — пропонуємо обрати наявного. */
function NewLeadClient({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const findFn = useServerFn(findClientsQuick);
  const q = form.client_phone?.replace(/\D/g, "").length >= 4 ? form.client_phone : (form.client_name?.length >= 3 ? form.client_name : "");
  const { data: hits = [] } = useQuery({
    queryKey: ["crm", "client-quick", q], enabled: !!q && !form.client_id,
    queryFn: () => findFn({ data: { q } }), staleTime: 30_000,
  });
  if (form.client_id) {
    return (
      <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 p-2.5 text-sm">
        <div><div className={lbl}>Клієнт (наявний)</div><div className="font-semibold">{form.client_label}</div></div>
        <button type="button" className="text-xs underline" onClick={() => setForm({ ...form, client_id: "", client_label: "" })}>Змінити</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block"><span className={lbl}>Телефон клієнта</span>
        <input type="tel" inputMode="tel" placeholder="+380…" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} className={inp + " mt-1 h-11"} /></label>
      <label className="block"><span className={lbl}>Імʼя та прізвище</span>
        <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className={inp + " mt-1 h-11"} /></label>
      {(hits as any[]).length ? (
        <div className="rounded-md border border-border">
          <div className="px-2.5 pt-2 text-[11px] font-semibold text-muted-foreground">Вже є в базі — оберіть, щоб не створювати дубль:</div>
          {(hits as any[]).map((c) => (
            <button key={c.id} type="button" className="block w-full px-2.5 py-2 text-left text-sm hover:bg-muted"
              onClick={() => setForm({ ...form, client_id: c.id, client_label: `${c.name ?? "Без імені"} · ${c.phone_e164 ?? c.phone ?? ""}`, address: form.address || c.address || "" })}>
              <span className="font-semibold">{c.name || "Без імені"}</span> <span className="text-muted-foreground">{c.phone_e164 ?? c.phone ?? ""}</span>
            </button>
          ))}
        </div>
      ) : q ? <div className="text-[11.5px] text-muted-foreground">Новий клієнт — картку буде створено автоматично.</div> : null}
    </div>
  );
}
const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const lbl = "text-[11px] uppercase tracking-wider text-muted-foreground";

const emptyFilters = {
  source: "", showLost: false, showWon: true,
  createdFrom: "", createdTo: "", closedFrom: "", closedTo: "",
  nextFrom: "", nextTo: "", manager: "", note: "", hasTask: "",
  utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "",
  service_type: "", object_type: "", areaFrom: "", areaTo: "",
  object_address: "", client_full_name: "", sumFrom: "", sumTo: "", contract_number: "",
  query: "",
  cabinet: "" as "" | CabinetKey,
};

/** Статус-крапка картки за наступним контактом: прострочено / сьогодні / заплановано / немає. */
function nextTone(next: string | null | undefined): { color: string; label: string } {
  if (!next) return { color: "#8A93A6", label: "Наступний контакт не заплановано" };
  const t = new Date(next).getTime();
  const now = Date.now();
  if (t < now) return { color: "#D93025", label: "Контакт прострочено" };
  if (t - now < 24 * 3600e3) return { color: "#E8710A", label: "Контакт протягом доби" };
  return { color: "#1E9E5A", label: "Контакт заплановано" };
}

const initials = (name: string | null | undefined) => {
  const p = String(name ?? "").split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
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
  const search = Route.useSearch();
  useEffect(() => {
    if (search.lead) setOpenId(search.lead);
  }, [search.lead]);

  const activePipeline = pipelineId || (pipe?.pipelines?.[0]?.id ?? "");
  const allStages = useMemo(
    () => ((pipe?.stages ?? []) as any[])
      .filter((s) => s.pipeline_id === activePipeline)
      // Успішний етап — у кінці дошки (у keyCRM він має sort_order 0, як і «Новий лід»).
      .sort((a, b) => Number(!!a.is_won) - Number(!!b.is_won) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
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

  const baseFiltered = useMemo(() => (leads as any[]).filter((l) => {
    const f = l.fields ?? {};
    if (filters.query && ![l.title, l.phone, l.client_name, l.address, l.source].some((v) => String(v ?? "").toLowerCase().includes(filters.query.toLowerCase()))) return false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [leads, filters.query, filters.source, filters.manager, filters.note, filters.createdFrom, filters.createdTo, filters.closedFrom, filters.closedTo, filters.nextFrom, filters.nextTo, filters.utm_source, filters.utm_medium, filters.utm_campaign, filters.utm_term, filters.utm_content, filters.object_address, filters.client_full_name, filters.contract_number, filters.service_type, filters.object_type, filters.areaFrom, filters.areaTo, filters.sumFrom, filters.sumTo]);
  const filtered = useMemo(() => (filters.cabinet ? baseFiltered.filter((l) => l.cabinet === filters.cabinet) : baseFiltered), [baseFiltered, filters.cabinet]);
  const stageIds = useMemo(() => new Set(stages.map((s) => s.id)), [stages]);
  const onBoard = useMemo(() => filtered.filter((l) => stageIds.has(l.stage_id)), [filtered, stageIds]);
  const chipCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const l of baseFiltered) {
      if (!stageIds.has(l.stage_id)) continue;
      c.all += 1;
      c[l.cabinet] = (c[l.cabinet] ?? 0) + 1;
    }
    return c;
  }, [baseFiltered, stageIds]);
  const boardSum = onBoard.reduce((a, l) => a + Number(l.budget || 0), 0);

  /* Воронка CRM (права картка): когорта лідів періоду з БД, з урахуванням обраного кабінету */
  const today = kyivToday();
  const [funnelRange, setFunnelRange] = useState<"month" | "quarter">("month");
  const fRange = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    const from = funnelRange === "month"
      ? `${y}-${String(m).padStart(2, "0")}-01`
      : new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10);
    return { from, to: today };
  }, [today, funnelRange]);
  const funnelLabel = funnelRange === "month"
    ? `${MONTHS_NOM[Number(today.slice(5, 7)) - 1].toLowerCase()} ${today.slice(0, 4)}`
    : `${fRange.from.slice(8, 10)}.${fRange.from.slice(5, 7)}–${today.slice(8, 10)}.${today.slice(5, 7)}`;
  const funnelFn = useServerFn(getLeadsFunnel);
  const funnelQ = useQuery({
    queryKey: ["crm", "leads-funnel", fRange.from, fRange.to, filters.cabinet || null],
    queryFn: () => funnelFn({ data: { ...fRange, cabinet: (filters.cabinet || null) as CabinetKey | null } }),
    retry: 1,
    throwOnError: false,
  });
  const [mobileStage, setMobileStage] = useState<string>("");
  const activeMobileStage = mobileStage && stages.some((s) => s.id === mobileStage) ? mobileStage : (stages.find((s) => onBoard.some((l) => l.stage_id === s.id))?.id ?? stages[0]?.id ?? "");

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
    const title = form.title.trim() || form.client_name?.trim() || form.client_phone?.trim() || "";
    if (!form.client_id && !form.client_name?.trim() && !form.client_phone?.trim()) { toast.error("Вкажіть імʼя або телефон клієнта"); return; }
    if (!title) { toast.error("Вкажіть назву ліда"); return; }
    save.mutate({
      title, pipeline_id: activePipeline || null, stage_id: stages[0]?.id ?? null,
      client_id: form.client_id || null,
      client_name: form.client_id ? null : form.client_name?.trim() || null,
      client_phone: form.client_id ? null : form.client_phone?.trim() || null,
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


  return (
    <AppShell>
      <CrmPage className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="tz-h text-[26px] leading-tight md:text-[26px]">Воронка лідів</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {onBoard.length} лідів на дошці · {moneyShort(boardSum)} у воронці{filters.cabinet ? ` · ${cabinetMeta(filters.cabinet).label}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {((pipe?.pipelines ?? []) as any[]).length > 1 ? (
              <select value={activePipeline} onChange={(e) => setPipelineId(e.target.value)} className={inp + " w-auto"} aria-label="Воронка">
                {((pipe?.pipelines ?? []) as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : null}
            <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
              className={`${crmButtonOutline} ${showFilters ? "border-[var(--color-primary)] text-[var(--color-primary)]" : ""}`}>
              <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Фільтри</span>
            </button>
            <button onClick={() => setCreating(true)} className="tz-btn-gold hidden h-9 px-4 text-[13px] md:inline-flex">
              <Plus className="h-4 w-4" /> Новий лід
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full md:w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[13px] outline-none focus:border-[var(--color-gold)] focus:shadow-[0_0_0_3px_rgb(212_150_10/0.15)]"
              value={filters.query} onChange={(e) => set("query", e.target.value)} placeholder="Ім'я, телефон, адреса, джерело" aria-label="Пошук лідів" />
          </div>
          <div className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0" role="group" aria-label="Фільтр за джерелом">
            <button type="button" onClick={() => set("cabinet", "")}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] ${!filters.cabinet ? "border-[#E8C77A] bg-[var(--color-gold-soft)] font-semibold" : "border-border bg-card"}`}>
              Усі джерела <span className="tabular-nums text-muted-foreground">{chipCounts.all ?? 0}</span>
            </button>
            {CABINET_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => set("cabinet", filters.cabinet === k ? "" : k)} aria-pressed={filters.cabinet === k}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] ${filters.cabinet === k ? "border-[#E8C77A] bg-[var(--color-gold-soft)] font-semibold" : "border-border bg-card"}`}>
                <CabinetGlyph k={k} size={16} />{cabinetMeta(k).short} <span className="tabular-nums text-muted-foreground">{chipCounts[k] ?? 0}</span>
              </button>
            ))}
          </div>
          <select value={filters.manager} onChange={(e) => set("manager", e.target.value)} aria-label="Менеджер"
            className="hidden h-9 rounded-lg border border-border bg-card px-3 text-[13px] md:block">
            <option value="">Менеджер: усі</option>
            {(staff as any[]).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name ?? s.user_id}</option>)}
          </select>
        </div>

        {showFilters ? (
          <div className="min-w-0 max-w-full space-y-4 overflow-x-auto rounded-lg border border-border bg-card p-4">
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

        {/* Mobile: зведення воронки, чипи етапів, список карток */}
        <div className="space-y-3 md:hidden">
          <MobileFunnelSummary data={funnelQ.data} />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar" role="tablist" aria-label="Етапи">
            {stages.map((s) => {
              const n = onBoard.filter((l) => l.stage_id === s.id).length;
              const on = s.id === activeMobileStage;
              return (
                <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setMobileStage(s.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] ${on ? "border-[#E8C77A] bg-[var(--color-gold-soft)] font-semibold" : "border-border bg-card"}`}>
                  {stageLabel(s.name)} <span className="tabular-nums text-muted-foreground">{n}</span>
                </button>
              );
            })}
          </div>
          {(() => {
            const st = stages.find((s) => s.id === activeMobileStage);
            const items = onBoard.filter((l) => l.stage_id === activeMobileStage);
            const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
            return (
              <div>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="tz-h text-[16px]">{st ? stageLabel(st.name) : "—"}</h2>
                  <span className="text-[12.5px] text-muted-foreground">{items.length} лідів · {moneyShort(sum)}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((l) => <LeadCardItem key={l.id} l={l} onOpen={() => setOpenId(l.id)} mobile />)}
                  {!items.length ? <div className="rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">На цьому етапі лідів немає</div> : null}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Desktop: канбан + права картка воронки */}
        <div className="hidden gap-4 md:flex">
          <div className="min-w-0 flex-1">
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((s) => {
                const items = onBoard.filter((l) => l.stage_id === s.id);
                const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
                return (
                  <div key={s.id} className="flex w-[244px] shrink-0 flex-col rounded-xl bg-[#EBEEF4]/70 p-2">
                    <div className="flex items-start justify-between gap-2 px-1.5 pb-2 pt-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.is_won ? "#D4960A" : s.color || "#5B6478" }} />
                          <span className="truncate" title={s.name}>{stageLabel(s.name)}</span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">{moneyShort(sum)}</div>
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="min-h-[120px] space-y-2">
                      {items.map((l) => (
                        <LeadCardItem key={l.id} l={l} onOpen={() => setOpenId(l.id)}
                          onPrev={() => shift(l, -1)} onNext={() => shift(l, 1)} />
                      ))}
                      {!items.length ? <div className="px-1.5 py-3 text-[12px] text-muted-foreground">Порожньо</div> : null}
                    </div>
                  </div>
                );
              })}
              {!stages.length ? <div className="text-sm text-muted-foreground">Немає активних етапів у воронці</div> : null}
            </div>
          </div>
          <aside className="hidden w-[300px] shrink-0 xl:block">
            <div className="sticky top-20 space-y-2">
              <div className="flex justify-end">
                <div className="tz-seg" role="tablist" aria-label="Період воронки">
                  <button type="button" data-on={funnelRange === "month"} onClick={() => setFunnelRange("month")} className="!px-2.5 !py-1 !text-[12px]">Місяць</button>
                  <button type="button" data-on={funnelRange === "quarter"} onClick={() => setFunnelRange("quarter")} className="!px-2.5 !py-1 !text-[12px]">3 міс.</button>
                </div>
              </div>
              {funnelQ.isError ? (
                <div className="tz-card p-4 text-[12.5px] text-destructive">Не вдалося завантажити воронку: {(funnelQ.error as Error)?.message}</div>
              ) : (
                <LeadsFunnelCard data={funnelQ.data} periodLabel={funnelLabel} loading={funnelQ.isLoading} />
              )}
            </div>
          </aside>
        </div>
      </CrmPage>

      <button type="button" onClick={() => setCreating(true)} aria-label="Новий лід"
        className="tz-btn-gold fixed bottom-[calc(148px+env(safe-area-inset-bottom))] right-4 z-30 h-14 w-14 rounded-full shadow-lg md:hidden">
        <Plus className="h-6 w-6" />
      </button>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4" onClick={() => setCreating(false)}>
          <div className="max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-lg md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Новий лід</h2>
              <button onClick={() => setCreating(false)}><X className="h-5 w-5" /></button>
            </div>
            <NewLeadClient form={form} setForm={setForm} />
            <label className="block"><span className={lbl}>Адреса обʼєкта</span>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp + " mt-1"} /></label>
            <label className="block"><span className={lbl}>Вид робіт</span>
              <DirectionSelect value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} className={inp + " mt-1"} /></label>
            <label className="block"><span className={lbl}>Джерело</span>
              <SourceSelect value={form.source} onChange={(v) => setForm({ ...form, source: v })} className={inp + " mt-1"} /></label>
            <details className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-sm font-semibold">Додатково</summary>
              <div className="mt-2 space-y-3">
                {[{ k: "title", label: "Назва ліда (за замовчуванням — імʼя клієнта)" }, { k: "budget", label: "Бюджет, ₴", type: "number" },
                  { k: "area", label: "Площа, м²", type: "number" }].map((f) => (
                  <label key={f.k} className="block">
                    <span className={lbl}>{f.label}</span>
                    <input type={f.type ?? "text"} value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className={inp + " mt-1"} />
                  </label>
                ))}
              </div>
            </details>
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
    <div className="min-w-0">
      <div className="mb-2 border-b border-border pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">{children}</div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1"><span className={lbl}>{label}</span>{children}</label>;
}
function Range({ a, b, type, onA, onB }: { a: string; b: string; type: "date" | "number"; onA: (v: string) => void; onB: (v: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input type={type} value={a} onChange={(e) => onA(e.target.value)} className={inp + " min-w-0 flex-1"} />
      <span className="shrink-0 text-muted-foreground">—</span>
      <input type={type} value={b} onChange={(e) => onB(e.target.value)} className={inp + " min-w-0 flex-1"} />
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

/** Назви етапів keyCRM приходять капсом — показуємо в реченнєвому регістрі. */
function stageLabel(name: string): string {
  const n = String(name ?? "").trim();
  if (!n) return "—";
  return n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n;
}

function LeadCardItem({ l, onOpen, onPrev, onNext, mobile = false }: {
  l: any; onOpen: () => void; onPrev?: () => void; onNext?: () => void; mobile?: boolean;
}) {
  const tone = nextTone(l.next_action_at);
  const area = l.area ? `${Number(l.area)} м²` : null;
  const place = [l.address, area].filter(Boolean).join(" · ");
  return (
    <article className="group tz-card relative px-3 py-2.5 transition-shadow hover:shadow-[0_6px_16px_-8px_rgb(11_27_58/0.25)]">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className={`min-w-0 flex-1 truncate text-left font-semibold leading-snug text-foreground hover:underline ${mobile ? "text-[15px]" : "text-[13.5px]"}`}>
          {l.client_name || l.title}
        </button>
        {mobile ? <span className="shrink-0 text-[14px] font-bold tabular-nums">{l.budget ? moneyShort(Number(l.budget)) : ""}</span>
          : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: tone.color }} title={tone.label} aria-label={tone.label} />}
      </div>
      {l.client_name && l.title && l.title !== l.client_name ? <div className="truncate text-[11.5px] text-muted-foreground">{l.title}</div> : null}
      {place ? <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{place}</span></div> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <SourceBadge cabinet={l.cabinet} source={l.source} />
        {l.next_action_at ? (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[11px] font-semibold" style={{ background: `${tone.color}1A`, color: tone.color === "#8A93A6" ? "#5B6478" : tone.color }}>
            <CalendarClock className="h-3 w-3" />
            {new Date(l.next_action_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
      <div className={`mt-2 flex items-center justify-between gap-2 ${mobile ? "" : "border-t border-border pt-2"}`}>
        {!mobile ? <span className="text-[14px] font-bold tabular-nums">{l.budget ? moneyShort(Number(l.budget)) : <span className="text-[12px] font-medium text-muted-foreground">без суми</span>}</span>
          : l.phone ? <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--color-primary)]"><Phone className="h-3.5 w-3.5" />{l.phone}</a> : <span />}
        <span className="flex items-center gap-1">
          {onPrev ? (
            <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button onClick={onPrev} className="rounded border border-border p-0.5 hover:bg-muted" aria-label="Попередній етап"><ChevronLeft className="h-3 w-3" /></button>
              <button onClick={onNext} className="rounded border border-border p-0.5 hover:bg-muted" aria-label="Наступний етап"><ChevronRight className="h-3 w-3" /></button>
            </span>
          ) : null}
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#E8ECF4] text-[10px] font-bold text-[var(--color-primary)]" title={l.manager_name ? `Менеджер: ${l.manager_name}` : "Менеджер не призначений"}>
            {l.manager_name ? initials(l.manager_name) : "—"}
          </span>
        </span>
      </div>
    </article>
  );
}

function MobileFunnelSummary({ data }: { data: { stages: Array<{ n: number }> } | null | undefined }) {
  const first = data?.stages[0]?.n ?? 0;
  const won = data?.stages[data.stages.length - 1]?.n ?? 0;
  const conv = first ? (won / first) * 100 : null;
  const widths = [100, 86, 72, 58, 44, 30];
  return (
    <div className="tz-card flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-muted-foreground">Конверсія лід → угода · цей місяць</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="tz-num text-[26px] leading-none">{conv == null ? "—" : `${conv.toFixed(1).replace(".", ",")}%`}</span>
          <span className="text-[12.5px] text-muted-foreground">{data ? `${first} → ${won} угод` : "…"}</span>
        </div>
      </div>
      <div className="flex w-[92px] flex-col items-center gap-[3px]" aria-hidden>
        {widths.map((w, i) => <span key={w} className="h-[6px] rounded-sm" style={{ width: `${w}%`, background: i === widths.length - 1 ? "#D4960A" : ["#3F6BD8", "#2F57B8", "#244699", "#1B377C", "#132A60"][i] }} />)}
      </div>
    </div>
  );
}
