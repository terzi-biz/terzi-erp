import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatUah } from "@/lib/screed-calc";
import { listEstimates } from "@/lib/estimates.functions";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  PERIODS, ROLE_LAYOUT, WIDGETS, WIDGETS_BY_ID, periodRange, roleFromRoles,
  type PeriodKey,
} from "@/lib/dashboard/widgets";
import { Plus, RotateCcw, SlidersHorizontal, Info, X } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Приладова панель — TERZI ERP" },
      { name: "description", content: "Ролева приладова панель TERZI: KPI, динаміка, план/факт, задачі та якість даних." },
      { property: "og:title", content: "Приладова панель — TERZI ERP" },
      { property: "og:description", content: "Ролева приладова панель TERZI: KPI, динаміка, план/факт, задачі та якість даних." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

interface E { id: string; created_at: string; total_client: number; status?: string | null; module?: string | null }

const NO_DATA = "Немає даних";

function Metric({ id, value, hint }: { id: string; value: string; hint?: string }) {
  const def = WIDGETS_BY_ID[id];
  return (
    <div className="panel p-4 group relative" tabIndex={0}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{def?.label ?? id}</div>
        <Info className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-hidden />
      </div>
      <div className={`text-2xl font-black mt-2 ${value === NO_DATA ? "text-muted-foreground text-base font-semibold" : "text-primary"}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
      {def ? (
        <div className="pointer-events-none absolute left-3 right-3 top-full z-20 hidden group-hover:block group-focus-within:block rounded-md border border-border bg-popover p-2 text-[11px] text-popover-foreground shadow-lg">
          <div>{def.definition}</div>
          <div className="mt-1 text-muted-foreground">Джерело: {def.source}</div>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard() {
  const { user, roles } = useAuth();
  const role = roleFromRoles(roles);
  const list = useServerFn(listEstimates);
  const { data: rows = [], dataUpdatedAt, isLoading } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => list(),
    enabled: !!user,
  });
  const all = rows as E[];

  const [period, setPeriod] = usePersistedState<PeriodKey>("terzi:dash:period", "d30");
  const [custom, setCustom] = usePersistedState<{ from?: string; to?: string }>("terzi:dash:custom", {});
  const [moduleFilter, setModuleFilter] = usePersistedState<string>("terzi:dash:module", "");
  const [layout, setLayout] = usePersistedState<string[]>(`terzi:dash:layout:${role}`, ROLE_LAYOUT[role]);
  const [editing, setEditing] = useState(false);

  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom]);
  const scoped = useMemo(
    () =>
      all.filter((e) => {
        const t = new Date(e.created_at).getTime();
        if (t < range.from.getTime() || t >= range.to.getTime()) return false;
        if (moduleFilter && e.module !== moduleFilter) return false;
        return true;
      }),
    [all, range, moduleFilter],
  );

  const revenue = scoped.reduce((a, e) => a + Number(e.total_client || 0), 0);
  const avg = scoped.length ? revenue / scoped.length : 0;

  const valueFor = (id: string): { value: string; hint?: string } => {
    switch (id) {
      case "revenue":
      case "personal_sales":
        return scoped.length ? { value: formatUah(revenue), hint: `${scoped.length} кошторисів` } : { value: NO_DATA };
      case "sent_estimates":
      case "drafts": {
        const wanted = id === "drafts" ? ["draft", "чернетка"] : ["sent", "надіслано"];
        const n = scoped.filter((e) => wanted.includes(String(e.status ?? "").toLowerCase())).length;
        return scoped.length ? { value: String(n) } : { value: NO_DATA };
      }
      default:
        return { value: NO_DATA };
    }
  };

  const visible = layout.filter((id) => WIDGETS_BY_ID[id]);
  const kpi = visible.filter((id) => WIDGETS_BY_ID[id]?.group === "kpi").slice(0, 6);
  const dynamics = visible.filter((id) => WIDGETS_BY_ID[id]?.group === "dynamics");
  const actions = visible.filter((id) => WIDGETS_BY_ID[id]?.group === "actions");

  const roleTitle: Record<string, string> = {
    manager: "Менеджер", estimator: "Кошторисник", foreman: "Виробництво",
    finance: "Фінанси", director: "Директор", admin: "Адміністратор",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl font-black tracking-tight">Приладова панель</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Роль: {roleTitle[role]} · оновлено{" "}
            {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("uk-UA") : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-2 text-xs font-semibold hover:bg-accent"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Віджети
          </button>
          <Link to="/calc" className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-bold uppercase tracking-wide text-xs inline-flex items-center gap-2 hover:opacity-90">
            <Plus className="w-4 h-4" /> Новий розрахунок
          </Link>
        </div>
      </header>

      <section aria-label="Фільтри" className="panel p-3 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              period === p.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        {period === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" aria-label="Від" value={custom.from ?? ""} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="border border-border rounded px-2 py-1 text-xs bg-background" />
            <input type="date" aria-label="До" value={custom.to ?? ""} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="border border-border rounded px-2 py-1 text-xs bg-background" />
          </span>
        )}
        <select
          aria-label="Напрямок"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-xs bg-background"
        >
          <option value="">Усі напрямки</option>
          <option value="screed">Стяжка</option>
          <option value="roofing_pvc">ПВХ мембрана</option>
          <option value="roofing_rub">Руберойд</option>
          <option value="insulation">Утеплення</option>
          <option value="demolition">Демонтаж</option>
        </select>
      </section>

      {editing && (
        <section className="panel p-4 space-y-3" aria-label="Налаштування віджетів">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">Мої віджети</div>
            <div className="flex gap-2">
              <button onClick={() => setLayout(ROLE_LAYOUT[role])} className="inline-flex items-center gap-1 text-xs border border-border rounded px-2 py-1 hover:bg-accent">
                <RotateCcw className="w-3 h-3" /> За замовчуванням
              </button>
              <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 text-xs border border-border rounded px-2 py-1 hover:bg-accent">
                <X className="w-3 h-3" /> Готово
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {WIDGETS.map((w) => {
              const on = layout.includes(w.id);
              return (
                <label key={w.id} className="flex items-center gap-2 text-xs border border-border rounded px-2 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setLayout(on ? layout.filter((x) => x !== w.id) : [...layout, w.id])}
                  />
                  <span className="truncate">{w.label}</span>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Налаштування зберігається лише для вашого облікового запису.</p>
        </section>
      )}

      <section aria-label="Ключові показники">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpi.length ? kpi.map((id) => {
            const v = valueFor(id);
            return <Metric key={id} id={id} value={isLoading ? "…" : v.value} {...(v.hint ? { hint: v.hint } : {})} />;
          }) : <div className="text-sm text-muted-foreground">{NO_DATA}</div>}
        </div>
      </section>

      <section aria-label="Динаміка та план/факт">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Динаміка, воронка, план/факт</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Cash flow рахується лише з фактичних надходжень/витрат. Кошториси не є грошима → «Немає даних». */}
          {dynamics.length ? dynamics.map((id) => <Metric key={id} id={id} value={NO_DATA} {...(id === "cash_flow" ? { hint: "Потрібні фактичні надходження та витрати" } : {})} />) : (
            <div className="panel p-4 text-sm text-muted-foreground">{NO_DATA}</div>
          )}
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Середній чек за період</div>
            <div className="text-2xl font-black mt-2 text-primary">{scoped.length ? formatUah(avg) : NO_DATA}</div>
          </div>
        </div>
      </section>

      <section aria-label="Дії та проблеми">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Дії, проблеми, прострочення, якість даних</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {actions.length ? actions.map((id) => <Metric key={id} id={id} value={NO_DATA} />) : (
            <div className="panel p-4 text-sm text-muted-foreground">{NO_DATA}</div>
          )}
        </div>
      </section>
    </div>
  );
}
