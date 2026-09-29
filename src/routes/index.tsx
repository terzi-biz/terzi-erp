import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
const AUTH_BYPASS = false; // Live auth.tsx does not export AUTH_BYPASS
import { supabase } from "@/integrations/supabase/client";
import { usePersistedState } from "@/lib/usePersistedState";
import { getAnalyticsOverview, getAdsCurrencyBreakdown } from "@/lib/analytics.functions";
import { listSalesPlan } from "@/lib/sales-plan.functions";
import { monthStart } from "@/lib/sales-plan";
import { kyivToday } from "@/lib/kyiv-time";
import { getFinanceOverview } from "@/lib/finance/finmap.functions";
import { currencyNote } from "@/lib/marketing/currency";
import { getCabinetFunnels, getSalesPlanFactYear } from "@/lib/marketing/cabinet-funnels.functions";
import { DrilldownDialog, TasksPanel, LeadMatchDialog, type DrilldownMetric } from "@/components/dashboard/panels";
import { DashboardV2View, type DashRange, type KpiBlock } from "@/components/dashboard/v2/DashboardV2View";
import { DashboardDetails, type Overview, type FinanceSummary } from "@/components/dashboard/v2/DashboardDetails";
import type { HeroData } from "@/components/dashboard/v2/HeroStrip";
import type { ManagerRow } from "@/components/dashboard/v2/ManagersPlan";
import { delta, MONTHS_NOM } from "@/components/dashboard/v2/format";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    if (AUTH_BYPASS) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "CEO-дашборд — TERZI ERP" },
      { name: "description", content: "Дашборд TERZI: сума договорів vs план, воронки по рекламних кабінетах, ліди, заміри, менеджери та задачі." },
      { property: "og:title", content: "CEO-дашборд — TERZI ERP" },
      { property: "og:description", content: "Реальні KPI TERZI: план/факт, маркетингові воронки по кабінетах, менеджери і задачі." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

/* ---------- періоди (календар Europe/Kyiv) ---------- */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const N = (v: unknown) => (v == null ? null : Number(v));
const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
const ROMAN = ["I", "II", "III", "IV"];

function dashRange(key: DashRange, custom: { from: string; to: string }, today = kyivToday()): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  switch (key) {
    case "week": return { from: iso(new Date(Date.UTC(y, m - 1, d - 6))), to: today };
    case "month": return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: today };
    case "quarter": return { from: iso(new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3, 1))), to: today };
    case "year": return { from: `${y}-01-01`, to: today };
    case "custom": return custom;
  }
}

function periodLabel(key: DashRange, from: string, to: string): string {
  const y = Number(to.slice(0, 4));
  const m = Number(to.slice(5, 7));
  switch (key) {
    case "week": return `7 днів · ${dm(from)}–${dm(to)}`;
    case "month": return `${MONTHS_NOM[m - 1]} ${y}`;
    case "quarter": return `${ROMAN[Math.floor((m - 1) / 3)]} квартал ${y}`;
    case "year": return `${y} рік`;
    case "custom": return `${dm(from)}.${from.slice(0, 4)}–${dm(to)}.${to.slice(0, 4)}`;
  }
}

/** Денний ряд у межах періоду (дні без записів = 0). */
function daily(from: string, to: string, rows: Array<{ day: string; v: number }>, cumulative = false): number[] {
  const map = new Map(rows.map((r) => [r.day, r.v]));
  const out: number[] = [];
  let acc = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) {
    const v = map.get(new Date(t).toISOString().slice(0, 10)) ?? 0;
    acc += v;
    out.push(cumulative ? acc : v);
  }
  return out;
}

/* ---------- page ---------- */

function Dashboard() {
  const { user } = useAuth();
  const today = kyivToday();
  const [range, setRange] = usePersistedState<DashRange>("terzi:dash:range:v2", "month");
  const [custom, setCustom] = usePersistedState<{ from: string; to: string }>("terzi:dash:custom", dashRange("quarter", { from: today, to: today }));
  const [drill, setDrill] = useState<{ metric: DrilldownMetric; title: string } | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const { from, to } = useMemo(() => dashRange(range, custom, today), [range, custom, today]);
  const month = useMemo(() => dashRange("month", custom, today), [custom, today]);
  const year = Number(today.slice(0, 4));
  const monthIdx = Number(today.slice(5, 7)) - 1;

  const canQuery = !!user && !AUTH_BYPASS;
  const overviewFn = useServerFn(getAnalyticsOverview);
  const fxFn = useServerFn(getAdsCurrencyBreakdown);
  const finFn = useServerFn(getFinanceOverview);
  const listPlanFn = useServerFn(listSalesPlan);
  const funnelsFn = useServerFn(getCabinetFunnels);
  const planFactFn = useServerFn(getSalesPlanFactYear);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dash", "overview", from, to],
    queryFn: () => overviewFn({ data: { from, to } }),
    enabled: canQuery, retry: 1, throwOnError: false,
  });
  const { data: monthData } = useQuery({
    queryKey: ["dash", "overview", month.from, month.to],
    queryFn: () => overviewFn({ data: month }),
    enabled: canQuery, retry: 1, throwOnError: false,
  });
  const { data: fx } = useQuery({
    queryKey: ["dash", "fx", from, to],
    queryFn: async () => { try { return await fxFn({ data: { from, to } }); } catch { return null; } },
    enabled: canQuery, retry: 1, throwOnError: false,
  });
  // Фінансовий контур доступний лише ролям admin/director/finance — помилка доступу просто ховає блок.
  const { data: fin } = useQuery({
    queryKey: ["dash", "finance", from, to],
    queryFn: async () => {
      try { return await finFn({ data: { from, to, kind: "all", match_status: "all", limit: 1, offset: 0 } }); } catch { return null; }
    },
    enabled: canQuery, retry: false, throwOnError: false,
  });
  const planMonth = monthStart(today);
  const { data: salesPlan } = useQuery({
    queryKey: ["dash", "sales-plan", planMonth],
    queryFn: async () => { try { return await listPlanFn({ data: { month: planMonth } }); } catch { return null; } },
    enabled: canQuery, retry: false, throwOnError: false,
  });
  const funnelsQ = useQuery({
    queryKey: ["dash", "cabinet-funnels", from, to],
    queryFn: () => funnelsFn({ data: { from, to } }),
    enabled: canQuery, retry: 1, throwOnError: false,
  });
  const { data: planFact } = useQuery({
    queryKey: ["dash", "plan-fact-year", year, from, to],
    queryFn: async () => { try { return await planFactFn({ data: { year, from, to } }); } catch { return null; } },
    enabled: canQuery, retry: 1, throwOnError: false,
  });

  const companyPlan = salesPlan && !salesPlan.seeded_default ? Number(salesPlan.company_target) || null : null;
  const managerPlanMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of salesPlan?.managers ?? []) m.set(row.user_id, row.target);
    return m;
  }, [salesPlan]);

  const cur = (data?.current ?? null) as Overview | null;
  const prev = (data?.previous ?? null) as Overview | null;
  const mCur = (monthData?.current ?? null) as Overview | null;
  const mPrev = (monthData?.previous ?? null) as Overview | null;
  const k = (o: Overview | null, n: string) => N(o?.kpi?.[n] ?? null);

  const hero: HeroData | null = useMemo(() => {
    if (!mCur) return null;
    const cv = k(mCur, "contract_value");
    const c = k(mCur, "contracts");
    const spend = k(mCur, "marketing_spend");
    const pc = k(mPrev, "contracts");
    const pcv = k(mPrev, "contract_value");
    const pp = monthData?.prevPeriod;
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    return {
      monthLabel: `${MONTHS_NOM[monthIdx]} ${year}`,
      contractValue: cv,
      plan: companyPlan,
      contracts: c,
      avgCheck: c ? (cv ?? 0) / c : null,
      romi: spend ? (((cv ?? 0) - spend) / spend) * 100 : null,
      prevContracts: pc,
      prevAvgCheck: pc ? (pcv ?? 0) / pc : null,
      prevLabel: pp ? `до ${dm(pp.from)}–${dm(pp.to)}` : "до попер. періоду",
      daysLeft: Math.max(0, dim - Number(today.slice(8, 10))),
      ordersValue: k(mCur, "orders_value"),
      ordersActive: k(mCur, "orders_active"),
      ordersBySource: ((mCur as any).sources ?? []).map((r: any) => ({ label: String(r.source ?? "Без джерела"), value: Number(r.orders_value ?? 0), count: Number(r.orders_active ?? 0) })).filter((r: any) => r.value > 0).sort((a: any, b: any) => b.value - a.value),
      ordersByManager: ((mCur as any).managers ?? []).map((r: any) => ({ label: String(r.name ?? "Без менеджера"), value: Number(r.orders_value ?? 0), count: Number(r.orders_active ?? 0) })).filter((r: any) => r.value > 0).sort((a: any, b: any) => b.value - a.value),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mCur, mPrev, companyPlan, monthData?.prevPeriod, today]);

  const kpi: KpiBlock | null = cur ? {
    contractValue: k(cur, "contract_value"),
    contractValueDelta: delta(k(cur, "contract_value"), k(prev, "contract_value")),
    monthPlan: range === "month" ? companyPlan : null,
    ytd: planFact?.ytd ?? null,
    leads: k(cur, "leads"),
    leadsDelta: delta(k(cur, "leads"), k(prev, "leads")),
    measurementsDone: k(cur, "measurements_completed"),
    measurementsScheduled: k(cur, "measurements_scheduled"),
    measurementsDelta: delta(k(cur, "measurements_completed"), k(prev, "measurements_completed")),
    sparkContracts: daily(from, to, planFact?.contractsByDay ?? [], true),
    sparkYear: (planFact?.months ?? []).filter((m) => m.fact != null).map((m) => m.fact ?? 0),
    sparkLeads: daily(from, to, (funnelsQ.data?.leadsByDay ?? []).map((r) => ({ day: r.day, v: r.n }))),
    sparkMeasurements: daily(from, to, planFact?.measurementsByDay ?? [], true),
  } : null;

  const managers: ManagerRow[] = (mCur?.managers ?? [])
    .map((m) => ({
      id: m.user_id ? String(m.user_id) : null,
      name: String(m.name ?? "—"),
      value: Number(m.contract_value ?? 0),
      contracts: Number(m.contracts ?? 0),
      plan: m.user_id && (managerPlanMap.get(String(m.user_id)) ?? 0) > 0 ? managerPlanMap.get(String(m.user_id))! : null,
    }))
    .filter((m) => m.value > 0 || m.plan)
    .sort((a, b) => b.value - a.value);

  const updated = dataUpdatedAt
    ? `дані оновлено о ${new Date(dataUpdatedAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}`
    : "завантаження…";

  const statusSlot = AUTH_BYPASS ? (
    <Status text="немає даних (режим без входу)" />
  ) : isLoading ? (
    <div className="space-y-4">
      <div className="h-[132px] animate-pulse rounded-xl bg-[#0B1B3A]/80" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[168px] animate-pulse rounded-xl bg-muted/70" />)}</div>
    </div>
  ) : isError ? (
    <div className="tz-card space-y-2 p-6 text-center">
      <p className="text-sm font-bold text-destructive">Не вдалося завантажити дашборд</p>
      <p className="break-all text-xs text-muted-foreground">{(error as Error)?.message ?? "невідома помилка"}</p>
      <button type="button" onClick={() => refetch()} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:border-[var(--color-primary)]">Повторити</button>
    </div>
  ) : !cur ? (
    <Status text="Немає даних за період (RPC analytics_overview повернув порожньо)" />
  ) : undefined;

  const customSlot = range === "custom" ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[12px] font-semibold text-muted-foreground">Свій період</span>
      <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
      <span className="text-xs text-muted-foreground">—</span>
      <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
    </div>
  ) : null;

  return (
    <>
      <DashboardV2View
        title="CEO-дашборд"
        periodLabel={periodLabel(range, from, to)}
        updatedLabel={updated}
        range={range}
        onRange={setRange}
        customSlot={customSlot}
        hero={hero}
        kpi={kpi}
        funnels={funnelsQ.data}
        funnelsLoading={funnelsQ.isLoading}
        funnelsError={funnelsQ.isError ? ((funnelsQ.error as Error)?.message ?? "помилка") : null}
        planFact={planFact}
        currentMonth={monthIdx + 1}
        managers={managers}
        monthLabel={`${MONTHS_NOM[monthIdx]} ${year}`}
        tasksSlot={<TasksPanel />}
        detailsSlot={cur ? (
          <DashboardDetails
            cur={cur}
            fin={fin as FinanceSummary | null | undefined}
            fxNote={currencyNote(fx?.original)}
            managerPlanMap={managerPlanMap}
            onDrill={setDrill}
            onMatch={() => setMatchOpen(true)}
          />
        ) : null}
        statusSlot={statusSlot}
        onDrill={(metric, title) => setDrill({ metric, title })}
      />
      <DrilldownDialog metric={drill?.metric ?? null} title={drill?.title ?? ""} from={from} to={to} onClose={() => setDrill(null)} />
      <LeadMatchDialog open={matchOpen} onClose={() => setMatchOpen(false)} />
    </>
  );
}

const Status = ({ text }: { text: string }) => (
  <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{text}</div>
);
