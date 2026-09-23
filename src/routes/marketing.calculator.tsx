import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Info, Lock, FileDown, Bot, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getMarketingCalculatorFacts, listCalculatorSnapshots, saveCalculatorSnapshot,
} from "@/lib/marketing-calculator.functions";
import {
  calculate, controlRows, recommendations, applyScenario, monthPace, DEFAULT_INPUTS, DEFAULT_SCENARIOS,
  CONSTRAINT_LABELS, MARKETING_CALC_VERSION, fmtUah, fmtNum, fmtPctV, avg,
  type CalcInputs, type CalcOutputs, type Scenario, type SourceLabel, type Status,
} from "@/lib/marketing/calculator";

export const Route = createFileRoute("/marketing/calculator")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Маркетинговий калькулятор — Маркетинг TERZI" },
    { name: "description", content: "Обернений медіаплан, контроль економіки CAC/GP, сценарії й фіксація місячного маркетингового плану TERZI." },
    { property: "og:title", content: "Маркетинговий калькулятор — Маркетинг TERZI" },
    { property: "og:description", content: "Скільки лідів, бюджету й договорів потрібно під ціль — з контролем економіки." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CalculatorPage,
});

type NumKey = { [K in keyof CalcInputs]: CalcInputs[K] extends number ? K : never }[keyof CalcInputs];
const SRC_LABEL: Record<SourceLabel, string> = { fact: "Факт ERP", manual: "Ручний ввід", assumption: "Допущення" };
const SRC_CLS: Record<SourceLabel, string> = {
  fact: "bg-success/15 text-success", manual: "bg-primary/10 text-primary", assumption: "bg-warning/20 text-warning-foreground",
};
const STATUS_LABEL: Record<Status, string> = { ok: "OK", warn: "УВАГА", stop: "СТОП", na: "немає даних" };
const STATUS_CLS: Record<Status, string> = {
  ok: "bg-success/15 text-success", warn: "bg-warning/25 text-warning-foreground", stop: "bg-destructive/15 text-destructive", na: "bg-muted text-muted-foreground",
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

function StatusBadge({ s }: { s: Status }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>;
}
function InfoTip({ what, formula, read }: { what: string; formula: string; read?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" aria-label="Пояснення" className="text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-1.5 text-xs">
        <p><b>Що це:</b> {what}</p>
        <p><b>Формула:</b> <span className="font-mono">{formula}</span></p>
        {read ? <p><b>Як читати:</b> {read}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function CalculatorPage() {
  const [month, setMonth] = useState(currentMonth);
  const factsFn = useServerFn(getMarketingCalculatorFacts);
  const listFn = useServerFn(listCalculatorSnapshots);
  const saveFn = useServerFn(saveCalculatorSnapshot);
  const qc = useQueryClient();
  const { data: facts, isLoading } = useQuery({ queryKey: ["mkt-calc", "facts", month], queryFn: () => factsFn({ data: { month } }) });
  const { data: snapshots = [] } = useQuery({ queryKey: ["mkt-calc", "snaps", month], queryFn: () => listFn({ data: { month } }) });

  const [inputs, setInputs] = useState<CalcInputs>(DEFAULT_INPUTS);
  const [sources, setSources] = useState<Record<string, SourceLabel>>({});
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [saving, setSaving] = useState(false);

  // Підставляємо факт ERP, лише якщо він є.
  useEffect(() => {
    if (!facts) return;
    const last5 = facts.revenue.slice(5).map((r) => r.value);
    const prev5 = facts.revenue.slice(0, 5).map((r) => r.value);
    const src: Record<string, SourceLabel> = {
      marketingCapPct: "assumption", testBudgetPct: "assumption", operationsCapPct: "assumption", performanceMediaPct: "assumption",
      grossMarginPct: "assumption", maxCacGpPct: "assumption", safetyPct: "assumption", showUpPct: "assumption",
      targetContracts: "manual", targetRevenue: "manual", measurementCapacity: "manual", contractCapacity: "manual", opsActualCost: "manual",
    };
    const next: CalcInputs = { ...DEFAULT_INPUTS, revenueMonths: last5, prevRevenueMonths: prev5 };
    last5.forEach((v, idx) => { src[`rev${idx}`] = v == null ? "manual" : "fact"; });
    const f = facts.funnel;
    const setF = (k: NumKey, v: number | null) => { if (v != null) { (next as any)[k] = Math.round(v * 10) / 10; src[k] = "fact"; } else src[k] = "manual"; };
    setF("leadToMeasPct", f.leadToMeasPct); setF("measToEstPct", f.measToEstPct); setF("estToContractPct", f.estToContractPct);
    setF("avgContractValue", facts.avgContractValue);
    next.actualCpl = facts.current.actualCpl;
    setInputs(next);
    setSources(src);
  }, [facts]);

  const setNum = (k: NumKey, v: string) => {
    setInputs((p) => ({ ...p, [k]: Number(v) || 0 }));
    setSources((s) => ({ ...s, [k]: s[k] === "assumption" ? "assumption" : "manual" }));
  };
  const setRev = (idx: number, v: string) => {
    setInputs((p) => { const r = [...p.revenueMonths]; r[idx] = v === "" ? null : Number(v); return { ...p, revenueMonths: r }; });
    setSources((s) => ({ ...s, [`rev${idx}`]: "manual" }));
  };

  const out = useMemo(() => calculate(inputs), [inputs]);
  const rows = useMemo(() => controlRows(out, inputs), [out, inputs]);
  const recs = useMemo(() => recommendations(out, inputs), [out, inputs]);
  const scen = useMemo(() => scenarios.map((s) => ({ s, o: calculate(applyScenario(inputs, s)) })), [scenarios, inputs]);

  const now = new Date();
  const isCurrent = month === currentMonth();
  const [yy, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const dayOfMonth = isCurrent ? now.getDate() : daysInMonth;
  const pace = monthPace({ planMedia: out.recommendedMedia, spendFact: facts?.current.spendFact ?? 0, dayOfMonth, daysInMonth });

  async function fixPlan() {
    setSaving(true);
    try {
      const r = await saveFn({ data: { month, inputs: inputs as any, outputs: out as any, sources, engineVersion: MARKETING_CALC_VERSION } });
      toast.success(`План ${month} зафіксовано, версія ${r.version}`);
      qc.invalidateQueries({ queryKey: ["mkt-calc", "snaps", month] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Помилка");
    } finally { setSaving(false); }
  }

  const kpis: { label: string; value: string; what: string; formula: string }[] = [
    { label: "Виручка AVG5", value: fmtUah(out.revenueAvg5), what: "Середні надходження за 5 закритих місяців.", formula: "Σ 5 міс ÷ кількість місяців з даними" },
    { label: "Рекомендоване медіа", value: fmtUah(out.recommendedMedia), what: "Медіабюджет з урахуванням стелі й потужностей.", formula: "min(Потрібне, Стеля, Потужності)" },
    { label: "Target CPL", value: fmtUah(out.targetCpl), what: "Робоча ціль ціни ліда із запасом.", formula: "Break-even CPL × Коеф. безпеки" },
    { label: "Прогноз договорів", value: fmtNum(out.forecastContracts), what: "Скільки договорів дасть рекомендований бюджет.", formula: "Медіа ÷ CPL × Лід→Договір" },
    { label: "Прогноз виручки", value: fmtUah(out.forecastRevenue), what: "Договори × середній чек.", formula: "Договори × Середній чек" },
    { label: "Full CAC", value: fmtUah(out.fullCac), what: "Повна вартість залучення договору.", formula: "Повний бюджет ÷ Договори" },
    { label: "GP ROMI", value: fmtPctV(out.gpRomi == null ? null : out.gpRomi * 100, 0), what: "Повернення валового прибутку на маркетинг.", formula: "(GP − Бюджет) ÷ Бюджет" },
    { label: "Обмеження", value: CONSTRAINT_LABELS[out.limitingFactor], what: "Що саме стримує план.", formula: "Найменше з обмежень бюджету" },
  ];

  return (
    <MarketingShell
      title="Маркетинговий калькулятор"
      subtitle="Обернений медіаплан і контроль економіки. Цифри рахує лише формульне ядро."
      actions={<>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 w-40" aria-label="Плановий місяць" />
        <Button variant="gold" size="sm" onClick={fixPlan} disabled={saving}><Lock />Зафіксувати план місяця</Button>
        <Button variant="outline" size="sm" onClick={() => printReport({ month, inputs, out, rows, recs, scen, sources, fixedAt: null })}><FileDown />PDF</Button>
      </>}
    >
      {isLoading ? <p className="text-sm text-muted-foreground">Завантаження фактичних даних ERP…</p> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><span className="truncate">{k.label}</span><InfoTip what={k.what} formula={k.formula} /></div>
            <div className="mt-1 text-base font-black tabular-nums md:text-xl">{k.value}</div>
          </div>
        ))}
      </div>

      <Panel title="Контроль економіки">
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[180px_150px_1fr_1fr_110px] md:items-start">
              <div className="flex items-center gap-1.5 text-sm font-bold">{r.label}<InfoTip what={r.what} formula={r.formula} /></div>
              <div className="text-sm font-black tabular-nums">{r.value}</div>
              <div className="text-xs text-muted-foreground">{r.what}</div>
              <div className="text-xs">{r.meaning}</div>
              <div className="space-y-1"><StatusBadge s={r.status} /><p className="text-[11px] text-muted-foreground">{r.note}</p></div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Обернений медіаплан">
        <ReversePlan o={out} i={inputs} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="План vs Факт місяця">
          <PlanFact o={out} facts={facts} pace={pace} />
        </Panel>
        <Panel title="Якість даних / атрибуція">
          <Health h={facts?.health} />
        </Panel>
      </div>

      <Panel title="Сценарії">
        <Scenarios scen={scen} scenarios={scenarios} setScenarios={setScenarios} />
      </Panel>

      <Panel title="Рекомендації агента" action={<Button size="sm" variant="outline" disabled title="Буде підключено до TZI AI: лише пояснення готового знімка"><Bot />Пояснити AI (незабаром)</Button>}>
        <div className="space-y-2">
          {recs.map((r, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-bold"><StatusBadge s={r.status} />{r.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{r.text}</p>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Рекомендації детерміновані — побудовані за правилами з розрахованих показників.</p>
        </div>
      </Panel>

      <Panel title="Вхідні дані та допущення">
        <Assumptions inputs={inputs} sources={sources} setNum={setNum} setRev={setRev} setInputs={setInputs} revenueMonths={facts?.revenue.slice(5).map((r) => r.month) ?? []} />
      </Panel>

      <Panel title={`Зафіксовані версії — ${month}`}>
        {snapshots.length ? (
          <div className="space-y-1.5">
            {snapshots.map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
                <span><b>v{s.version}</b> · {new Date(s.created_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })} · {s.created_by_name ?? "—"}</span>
                <span className="tabular-nums">Медіа {fmtUah(s.outputs?.recommendedMedia ?? null)} · Договори {fmtNum(s.outputs?.forecastContracts ?? null)}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setInputs(s.inputs); setSources(s.sources ?? {}); toast.info(`Завантажено входи v${s.version}`); }}>Відкрити</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const i = s.inputs as CalcInputs; const o = calculate(i);
                    printReport({ month, inputs: i, out: o, rows: controlRows(o, i), recs: recommendations(o, i), scen: DEFAULT_SCENARIOS.map((sc) => ({ s: sc, o: calculate(applyScenario(i, sc)) })), sources: s.sources ?? {}, fixedAt: `v${s.version} · ${new Date(s.created_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })} · ${s.created_by_name ?? ""}` });
                  }}><FileDown />PDF</Button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">План цього місяця ще не фіксувався. Кожна фіксація створює нову версію, попередні не змінюються.</p>}
      </Panel>
    </MarketingShell>
  );
}

function ReversePlan({ o, i }: { o: CalcOutputs; i: CalcInputs }) {
  const steps: { label: string; value: string; formula: string; note: string }[] = [
    { label: i.planMode === "contracts" ? "Ціль: договори" : "Ціль: виручка", value: i.planMode === "contracts" ? fmtNum(i.targetContracts) : fmtUah(i.targetRevenue), formula: "Ввід користувача", note: "Відправна точка плану." },
    { label: "Договори", value: fmtNum(o.requiredContracts), formula: "Ціль або Виручка ÷ Середній чек", note: "Скільки договорів треба підписати." },
    { label: "Кошториси", value: fmtNum(o.requiredEstimates), formula: "Договори ÷ Кошторис→Договір", note: "Скільки кошторисів підготувати." },
    { label: "Заміри", value: fmtNum(o.requiredMeasurements), formula: "Кошториси ÷ Замір→Кошторис", note: i.showUpEnabled ? `Записати ${fmtNum(o.requiredBooked)} замірів з урахуванням явки.` : "Завершені заміри." },
    { label: "Ліди", value: fmtNum(o.requiredLeads), formula: "Заміри ÷ Лід→Замір", note: "Скільки звернень потрібно." },
    { label: "Target CPL", value: fmtUah(o.targetCpl), formula: "Max CAC × Лід→Договір × Безпека", note: "Максимальна робоча ціна ліда." },
    { label: "Медіабюджет", value: fmtUah(o.recommendedMedia), formula: "min(Ліди × CPL, Стеля, Потужності)", note: `Потрібно ${fmtUah(o.requiredMedia)}; обмеження: ${CONSTRAINT_LABELS[o.limitingFactor]}.` },
    { label: "Виручка", value: fmtUah(o.forecastRevenue), formula: "Прогноз договорів × Чек", note: "Прогноз, не факт." },
    { label: "GP", value: fmtUah(o.forecastGp), formula: "Виручка × Маржа", note: "Валовий прибуток до маркетингу." },
    { label: "GP ROMI", value: fmtPctV(o.gpRomi == null ? null : o.gpRomi * 100, 0), formula: "(GP − Бюджет) ÷ Бюджет", note: o.gpRomi == null ? "Немає даних." : o.gpRomi >= 0 ? "Маркетинг окупається прибутком." : "Маркетинг не окупається." },
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((s, idx) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <div className="w-36 rounded-lg border border-border bg-background p-2">
            <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">{s.label}<InfoTip what={s.note} formula={s.formula} /></div>
            <div className="text-sm font-black tabular-nums">{s.value}</div>
            <div className="text-[10px] leading-tight text-muted-foreground">{s.note}</div>
          </div>
          {idx < steps.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
        </div>
      ))}
    </div>
  );
}

function PlanFact({ o, facts, pace }: { o: CalcOutputs; facts: any; pace: ReturnType<typeof monthPace> }) {
  if (!facts) return <p className="text-xs text-muted-foreground">немає даних</p>;
  const c = facts.current;
  const mediaCacFact = c.contracts ? c.spendFact / c.contracts : null;
  const rowsPF: [string, string, string][] = [
    ["Витрати медіа", fmtUah(o.recommendedMedia), fmtUah(c.spendFact)],
    ["Прогноз витрат на кінець місяця", "—", fmtUah(pace.forecast)],
    ["Ліди", fmtNum(o.forecastLeads), fmtNum(c.leads)],
    ["CPL", fmtUah(o.targetCpl), fmtUah(c.actualCpl)],
    ["Заміри (завершені)", fmtNum(o.forecastMeasurements), fmtNum(c.measurements)],
    ["Договори", fmtNum(o.forecastContracts), fmtNum(c.contracts)],
    ["Media CAC", fmtUah(o.mediaCac), fmtUah(mediaCacFact)],
    ["Атрибутована виручка", fmtUah(o.forecastRevenue), fmtUah(c.attributedRevenue)],
    ["GP / ROMI", fmtUah(o.forecastGp), "немає даних (факт GP не пов'язаний)"],
  ];
  return (
    <div className="space-y-2 text-xs">
      <table className="w-full">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1">Показник</th><th>План</th><th>Факт</th></tr></thead>
        <tbody>{rowsPF.map(([a, b, cc]) => <tr key={a} className="border-t border-border"><td className="py-1.5">{a}</td><td className="tabular-nums">{b}</td><td className="tabular-nums">{cc}</td></tr>)}</tbody>
      </table>
      <p className="rounded-md bg-muted p-2">Безпечні денні витрати на решту місяця ({pace.remainingDays} дн.): <b>{fmtUah(pace.safeDaily)}</b></p>
    </div>
  );
}

function Health({ h }: { h: any }) {
  if (!h) return <p className="text-xs text-muted-foreground">немає даних</p>;
  const items: [string, string][] = [
    ["Ліди з каналом", fmtPctV(h.channelSharePct, 0)],
    ["Ліди з кампанією", fmtPctV(h.campaignSharePct, 0)],
    ["Ліди з UTM/click id", fmtPctV(h.utmSharePct, 0)],
    ["Договори з маркетинговим джерелом", fmtPctV(h.contractsLinkedPct, 0)],
    ["Остання синхронізація метрик", h.lastSyncAt ? new Date(h.lastSyncAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }) : "немає даних"],
  ];
  return (
    <div className="space-y-1.5 text-xs">
      {items.map(([a, b]) => <div key={a} className="flex justify-between gap-2 border-b border-border pb-1"><span>{a}</span><b className="tabular-nums">{b}</b></div>)}
      <p className="text-[11px] text-muted-foreground">Ліди за 90 днів: {fmtNum(h.leadsTotal, 0)}. Низька атрибуція робить медіаплан менш надійним.</p>
    </div>
  );
}

function Scenarios({ scen, scenarios, setScenarios }: { scen: { s: Scenario; o: CalcOutputs }[]; scenarios: Scenario[]; setScenarios: (s: Scenario[]) => void }) {
  const edit = (idx: number, k: "targetPct" | "conversionPct" | "checkPct", v: string) =>
    setScenarios(scenarios.map((s, i) => (i === idx ? { ...s, [k]: Number(v) || 0 } : s)));
  const metrics: [string, (o: CalcOutputs) => string][] = [
    ["Договори", (o) => fmtNum(o.forecastContracts)], ["Ліди", (o) => fmtNum(o.forecastLeads, 0)],
    ["Медіабюджет", (o) => fmtUah(o.recommendedMedia)], ["Full CAC", (o) => fmtUah(o.fullCac)],
    ["Прогноз виручки", (o) => fmtUah(o.forecastRevenue)], ["Прогноз GP", (o) => fmtUah(o.forecastGp)],
    ["GP ROMI", (o) => fmtPctV(o.gpRomi == null ? null : o.gpRomi * 100, 0)],
    ["Завантаження", (o) => `${fmtPctV(o.measUtilPct, 0)} / ${fmtPctV(o.contractUtilPct, 0)}`],
    ["Обмеження", (o) => CONSTRAINT_LABELS[o.limitingFactor]],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="text-left"><th className="py-1">Параметр</th>{scen.map(({ s }) => <th key={s.key}>{s.label}</th>)}</tr>
        </thead>
        <tbody>
          {(["targetPct", "conversionPct", "checkPct"] as const).map((k) => (
            <tr key={k} className="border-t border-border bg-muted/40">
              <td className="py-1">{k === "targetPct" ? "Ціль, % від бази" : k === "conversionPct" ? "Конверсії, % від бази" : "Середній чек, % від бази"}</td>
              {scenarios.map((s, idx) => <td key={s.key}><Input type="number" value={s[k]} onChange={(e) => edit(idx, k, e.target.value)} className="h-7 w-20" /></td>)}
            </tr>
          ))}
          {metrics.map(([label, f]) => (
            <tr key={label} className="border-t border-border"><td className="py-1.5">{label}</td>{scen.map(({ s, o }) => <td key={s.key} className="tabular-nums">{f(o)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INPUT_DEFS: { k: NumKey; label: string; unit: string }[] = [
  { k: "marketingCapPct", label: "Marketing Cap / Виручка", unit: "%" },
  { k: "testBudgetPct", label: "Тестовий бюджет (від фонду)", unit: "%" },
  { k: "operationsCapPct", label: "Стеля операцій (від фонду)", unit: "%" },
  { k: "performanceMediaPct", label: "Performance медіа (від фонду)", unit: "%" },
  { k: "grossMarginPct", label: "Валова маржа", unit: "%" },
  { k: "maxCacGpPct", label: "Max Full CAC / GP договору", unit: "%" },
  { k: "safetyPct", label: "Коефіцієнт безпеки CPL", unit: "%" },
  { k: "avgContractValue", label: "Середній чек договору", unit: "₴" },
  { k: "leadToMeasPct", label: "Лід → Замір", unit: "%" },
  { k: "measToEstPct", label: "Замір → Кошторис", unit: "%" },
  { k: "estToContractPct", label: "Кошторис → Договір", unit: "%" },
  { k: "measurementCapacity", label: "Потужність замірів / міс", unit: "шт" },
  { k: "contractCapacity", label: "Потужність договорів / міс", unit: "шт" },
  { k: "opsActualCost", label: "Факт операційних витрат маркетингу", unit: "₴" },
];

function SrcChip({ s }: { s?: SourceLabel }) {
  const v = s ?? "manual";
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${SRC_CLS[v]}`}>{SRC_LABEL[v]}</span>;
}

function Assumptions({ inputs, sources, setNum, setRev, setInputs, revenueMonths }: {
  inputs: CalcInputs; sources: Record<string, SourceLabel>; setNum: (k: NumKey, v: string) => void; setRev: (i: number, v: string) => void;
  setInputs: React.Dispatch<React.SetStateAction<CalcInputs>>; revenueMonths: string[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-bold">Виручка 5 закритих місяців (надходження Finmap, без фінансових операцій) · AVG {fmtUah(avg(inputs.revenueMonths))}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {inputs.revenueMonths.map((v, idx) => (
            <label key={idx} className="text-[11px]">
              <span className="flex items-center justify-between gap-1">{revenueMonths[idx] ?? `M${idx + 1}`}<SrcChip s={sources[`rev${idx}`]} /></span>
              <Input type="number" value={v ?? ""} placeholder="немає даних" onChange={(e) => setRev(idx, e.target.value)} className="mt-0.5 h-8" />
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">Режим:
          <select value={inputs.planMode} onChange={(e) => setInputs((p) => ({ ...p, planMode: e.target.value as any }))} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="contracts">Ціль — договори</option><option value="revenue">Ціль — виручка</option>
          </select>
        </label>
        {inputs.planMode === "contracts"
          ? <label className="flex items-center gap-2">Договорів <Input type="number" value={inputs.targetContracts} onChange={(e) => setNum("targetContracts", e.target.value)} className="h-8 w-24" /></label>
          : <label className="flex items-center gap-2">Виручка ₴ <Input type="number" value={inputs.targetRevenue} onChange={(e) => setNum("targetRevenue", e.target.value)} className="h-8 w-36" /></label>}
        <label className="flex items-center gap-2"><Switch checked={inputs.showUpEnabled} onCheckedChange={(v) => setInputs((p) => ({ ...p, showUpEnabled: v }))} />Окремий етап явки на замір</label>
        {inputs.showUpEnabled ? <label className="flex items-center gap-2">Явка % <Input type="number" value={inputs.showUpPct} onChange={(e) => setNum("showUpPct", e.target.value)} className="h-8 w-20" /><SrcChip s={sources.showUpPct} /></label> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {INPUT_DEFS.map((d) => (
          <label key={d.k} className="text-[11px]">
            <span className="flex items-center justify-between gap-1">{d.label}, {d.unit}<SrcChip s={sources[d.k]} /></span>
            <Input type="number" value={inputs[d.k] as number} onChange={(e) => setNum(d.k, e.target.value)} className="mt-0.5 h-8" />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Конверсії й середній чек — потокові факти ERP за 90 днів / 5 місяців до планового місяця. «Допущення» — управлінські коефіцієнти, їх варто затвердити.</p>
    </div>
  );
}

// ---------- PDF (друк у PDF без зовнішніх ресурсів) ----------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function printReport(p: { month: string; inputs: CalcInputs; out: CalcOutputs; rows: ReturnType<typeof controlRows>; recs: ReturnType<typeof recommendations>; scen: { s: Scenario; o: CalcOutputs }[]; sources: Record<string, SourceLabel>; fixedAt: string | null }) {
  const { inputs: i, out: o } = p;
  const tr = (cells: string[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Маркетинговий план ${p.month}</title>
<style>body{font-family:system-ui,sans-serif;font-size:11px;color:#142B44;margin:24px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #F2B632}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd;padding:3px 5px;text-align:left;vertical-align:top}.m{color:#556}</style></head><body>
<h1>TERZI · Маркетинговий план ${esc(p.month)}</h1>
<p class="m">${p.fixedAt ? `Зафіксовано: ${esc(p.fixedAt)}` : `Чернетка, сформовано ${new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}`} · Ядро ${MARKETING_CALC_VERSION}</p>
<h2>Вхідні допущення</h2><table>${INPUT_DEFS.map((d) => tr([d.label, `${fmtNum(i[d.k] as number, 2)} ${d.unit}`, SRC_LABEL[p.sources[d.k] ?? "manual"]])).join("")}
${tr(["Виручка 5 міс", i.revenueMonths.map((v) => fmtUah(v)).join(" · "), "AVG " + fmtUah(o.revenueAvg5)])}${tr(["Режим", i.planMode === "contracts" ? `Договори: ${i.targetContracts}` : `Виручка: ${fmtUah(i.targetRevenue)}`, ""])}</table>
<h2>KPI</h2><table>${tr(["Рекомендоване медіа", fmtUah(o.recommendedMedia)])}${tr(["Target CPL", fmtUah(o.targetCpl)])}${tr(["Прогноз договорів", fmtNum(o.forecastContracts)])}${tr(["Прогноз виручки", fmtUah(o.forecastRevenue)])}${tr(["Прогноз GP", fmtUah(o.forecastGp)])}${tr(["Повний бюджет", fmtUah(o.fullBudget)])}${tr(["Full CAC", fmtUah(o.fullCac)])}${tr(["MER", fmtNum(o.mer, 2)])}${tr(["Обмеження", CONSTRAINT_LABELS[o.limitingFactor]])}</table>
<h2>Контроль економіки</h2><table><tr><th>Показник</th><th>Значення</th><th>Що означає</th><th>Статус</th></tr>${p.rows.map((r) => tr([r.label, r.value, r.meaning, STATUS_LABEL[r.status]])).join("")}</table>
<h2>Обернений медіаплан</h2><table>${tr(["Договори", fmtNum(o.requiredContracts)])}${tr(["Кошториси", fmtNum(o.requiredEstimates)])}${tr(["Заміри", fmtNum(o.requiredMeasurements)])}${tr(["Ліди", fmtNum(o.requiredLeads)])}${tr(["Потрібне медіа", fmtUah(o.requiredMedia)])}</table>
<h2>Сценарії</h2><table><tr><th></th>${p.scen.map(({ s }) => `<th>${esc(s.label)}</th>`).join("")}</tr>${[["Договори", (x: CalcOutputs) => fmtNum(x.forecastContracts)], ["Медіа", (x: CalcOutputs) => fmtUah(x.recommendedMedia)], ["Виручка", (x: CalcOutputs) => fmtUah(x.forecastRevenue)], ["GP", (x: CalcOutputs) => fmtUah(x.forecastGp)], ["Обмеження", (x: CalcOutputs) => CONSTRAINT_LABELS[x.limitingFactor]]].map(([l, f]: any) => tr([l, ...p.scen.map(({ o: so }) => f(so))])).join("")}</table>
<h2>Рекомендації</h2><table>${p.recs.map((r) => tr([STATUS_LABEL[r.status], r.title, r.text])).join("")}</table>
<p class="m">Джерела: надходження Finmap (без фінансових операцій), CRM-ліди, заміри, кошториси, замовлення, marketing_daily_metrics. Прогноз ≠ факт.</p>
<script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { toast.error("Дозвольте спливаючі вікна для PDF"); return; }
  w.document.write(html); w.document.close();
}
