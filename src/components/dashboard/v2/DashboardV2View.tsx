/**
 * CEO-дашборд v2 (презентаційний шар). Дані готує src/routes/index.tsx.
 * Усі числа — реальні; відсутні джерела показуються як «немає даних» / «не підключено».
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Handshake, Plus, Ruler, Target, Users, Wallet } from "lucide-react";
import { HeroStrip, type HeroData } from "./HeroStrip";
import { KpiCard } from "./KpiCard";
import { MarketingFunnels, type CabinetFunnelsPayload } from "./MarketingFunnels";
import { PlanFactChart, type PlanFactMonth } from "./PlanFactChart";
import { ManagersPlan, type ManagerRow } from "./ManagersPlan";
import { Card, Segmented } from "./primitives";
import { moneyShort, num, pct } from "./format";

export type DashRange = "week" | "month" | "quarter" | "year" | "custom";
export const DASH_RANGES: Array<{ key: DashRange; label: string }> = [
  { key: "week", label: "Тиждень" },
  { key: "month", label: "Місяць" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Рік" },
  { key: "custom", label: "Період" },
];

export interface KpiBlock {
  contractValue: number | null; contractValueDelta: number | null; monthPlan: number | null;
  ytd: { fact: number; plan: number; months: number } | null;
  leads: number | null; leadsDelta: number | null;
  measurementsDone: number | null; measurementsScheduled: number | null; measurementsDelta: number | null;
  sparkContracts: number[]; sparkYear: number[]; sparkLeads: number[]; sparkMeasurements: number[];
}

export interface DashboardV2Props {
  title: string;
  periodLabel: string;
  updatedLabel: string;
  range: DashRange;
  onRange: (r: DashRange) => void;
  customSlot?: ReactNode;
  hero: HeroData | null;
  kpi: KpiBlock | null;
  funnels: CabinetFunnelsPayload | null | undefined;
  funnelsLoading?: boolean;
  funnelsError?: string | null;
  planFact: { year: number; months: PlanFactMonth[]; ytd: { fact: number; plan: number; months: number } | null } | null | undefined;
  currentMonth: number;
  managers: ManagerRow[];
  monthLabel: string;
  tasksSlot: ReactNode;
  detailsSlot: ReactNode;
  statusSlot?: ReactNode;
  onDrill?: (metric: "leads" | "measurements" | "contracts", title: string) => void;
}

export function DashboardV2View(p: DashboardV2Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const k = p.kpi;
  const ytdPct = k?.ytd && k.ytd.plan ? (k.ytd.fact / k.ytd.plan) * 100 : null;
  const cvPlanPct = k?.monthPlan && k.contractValue != null ? (k.contractValue / k.monthPlan) * 100 : null;
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-3 md:space-y-5 md:p-6">
      {/* Мобільний: hero зверху, одразу під navy-баром */}
      <div className="md:hidden">{p.hero ? <HeroStrip d={p.hero} /> : null}</div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="hidden md:block">
          <h1 className="tz-h text-[26px] leading-tight">{p.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{p.periodLabel} · {p.updatedLabel}</p>
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto no-scrollbar md:w-auto">
          <Segmented value={p.range} options={DASH_RANGES} onChange={p.onRange} ariaLabel="Період" />
        </div>
      </div>
      {p.customSlot}

      {p.statusSlot ?? (
        <>
          <div className="hidden md:block">{p.hero ? <HeroStrip d={p.hero} /> : null}</div>

          {k ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
              <KpiCard
                icon={<Wallet className="h-[18px] w-[18px]" />} iconTint="#FBF3E0" bar="linear-gradient(90deg,#D4960A,#E0A21A)"
                title="Сума договорів" sub={p.periodLabel}
                value={k.contractValue == null ? "немає даних" : moneyShort(k.contractValue)} muted={k.contractValue == null}
                d={k.contractValueDelta}
                note={k.monthPlan ? <span>план {moneyShort(k.monthPlan)}{cvPlanPct != null ? ` · ${pct(cvPlanPct, 0)}` : ""}</span> : null}
                spark={k.sparkContracts} sparkColor="#0B1B3A"
                onClick={p.onDrill ? () => p.onDrill!("contracts", "Договори") : undefined}
              />
              <KpiCard
                icon={<Target className="h-[18px] w-[18px]" />} iconTint="#E8ECF4" bar="#0B1B3A"
                title="План/факт, рік" sub={k.ytd ? `${k.ytd.months} міс. з планом` : "план не задано"}
                value={ytdPct == null ? "план не задано" : pct(ytdPct, 1)} muted={ytdPct == null}
                note={k.ytd ? <span>{moneyShort(k.ytd.fact)} з {moneyShort(k.ytd.plan)}</span> : <Link to="/settings/sales-plan" className="font-semibold text-[var(--color-primary)] hover:underline">Задати план →</Link>}
                spark={k.sparkYear} sparkColor="#1F4A8A"
              />
              <KpiCard
                icon={<Users className="h-[18px] w-[18px]" />} iconTint="#E8F0FE" bar="#1A73E8"
                title="Нові ліди" sub={p.periodLabel}
                value={k.leads == null ? "немає даних" : num(k.leads)} muted={k.leads == null}
                d={k.leadsDelta} note={<span>до попер. періоду</span>}
                spark={k.sparkLeads} sparkColor="#1A73E8"
                onClick={p.onDrill ? () => p.onDrill!("leads", "Заявки (ліди)") : undefined}
              />
              <KpiCard
                icon={<Ruler className="h-[18px] w-[18px]" />} iconTint="#E6F5EC" bar="#1E9E5A"
                title="Заміри" sub="виконано за період"
                value={k.measurementsDone == null ? "немає даних" : num(k.measurementsDone)} muted={k.measurementsDone == null}
                d={k.measurementsDelta}
                note={k.measurementsScheduled != null ? <span>призначено {num(k.measurementsScheduled)}</span> : null}
                spark={k.sparkMeasurements} sparkColor="#1E9E5A"
                onClick={p.onDrill ? () => p.onDrill!("measurements", "Заміри") : undefined}
              />
            </div>
          ) : null}

          <MarketingFunnels data={p.funnels} periodLabel={p.periodLabel} loading={p.funnelsLoading} error={p.funnelsError} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="p-4 md:p-5">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="tz-h text-[17px]">Сума договорів: план vs факт</h2>
                  <p className="text-[12.5px] text-muted-foreground">
                    {p.planFact ? `${p.planFact.year} · млн ₴` : "…"}
                    {p.planFact?.ytd ? ` · рік: ${moneyShort(p.planFact.ytd.fact)} з ${moneyShort(p.planFact.ytd.plan)} (${pct((p.planFact.ytd.fact / p.planFact.ytd.plan) * 100, 1)})` : p.planFact ? " · план задано не для всіх місяців" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#0B1B3A]" />Факт</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#D4960A]" />План</span>
                </div>
              </header>
              <div className="mt-3">
                {p.planFact ? <PlanFactChart months={p.planFact.months} currentMonth={p.currentMonth} /> : <div className="h-[230px] animate-pulse rounded-lg bg-muted/60" />}
              </div>
            </Card>
            <ManagersPlan rows={p.managers} monthLabel={p.monthLabel} />
          </div>

          <Card className="p-4 md:p-5">
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="tz-h text-[17px]"><span className="md:hidden">Прострочені задачі</span><span className="hidden md:inline">Задачі: сьогодні та прострочені</span></h2>
              <Link to="/crm/tasks" className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-[var(--color-primary)] hover:underline">Усі задачі →</Link>
            </header>
            <div className="max-h-[340px] overflow-y-auto pr-1">{p.tasksSlot}</div>
          </Card>

          <div>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left text-[14px] font-semibold text-foreground hover:bg-muted/40"
            >
              <span className="flex items-center gap-2"><Handshake className="h-4 w-4 shrink-0 text-muted-foreground" /><span>Детальніше<span className="hidden font-normal text-muted-foreground md:inline">: воронка періоду, телефонія, джерела, фінанси, замірники, якість даних</span></span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
            </button>
            {detailsOpen ? <div className="mt-4">{p.detailsSlot}</div> : null}
          </div>
        </>
      )}
    </div>
  );
}
