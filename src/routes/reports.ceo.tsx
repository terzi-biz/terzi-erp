import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Panel, EmptyState, KpiCard, fmtMoney, fmtNum, fmtPct } from "@/components/marketing/MarketingShell";
import { getAnalyticsOverview, getAnalyticsDrilldown } from "@/lib/analytics.functions";

export const Route = createFileRoute("/reports/ceo")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "CEO-звіт — Аналітика TERZI ERP" },
      { name: "description", content: "Місячний звіт керівника TERZI: воронка від ліда до договору, джерела заявок, телефонія, менеджери та якість даних." },
      { property: "og:title", content: "CEO-звіт — Аналітика TERZI ERP" },
      { property: "og:description", content: "Реальні показники TERZI за період: ліди, заміри, кошториси, договори, оплати та ефективність каналів." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CeoReport,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const N = (v: unknown) => (v == null ? null : Number(v));
const show = (v: number | null, f: (n: number) => string) => (v == null ? "немає даних" : f(v));
const delta = (cur: number | null, prev: number | null) =>
  cur == null || prev == null || prev === 0 ? undefined : ((cur - prev) / prev) * 100;
const ratio = (a: number | null, b: number | null) => (a == null || !b ? null : (a / b) * 100);

type Metric = Parameters<typeof getAnalyticsDrilldown>[0] extends never ? string : string;

interface Overview {
  kpi: Record<string, number | null>;
  sources: Array<Record<string, number | string>>;
  managers: Array<Record<string, number | string | null>>;
  surveyors: Array<Record<string, number | string | null>>;
  telephony: Record<string, number>;
  data_quality: Record<string, number>;
}

function CeoReport() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))));
  const [to, setTo] = useState(iso(now));
  const [drill, setDrill] = useState<{ metric: string; label: string } | null>(null);

  const overviewFn = useServerFn(getAnalyticsOverview);
  const drillFn = useServerFn(getAnalyticsDrilldown);

  const { data, isLoading } = useQuery({
    queryKey: ["ceo", from, to],
    queryFn: () => overviewFn({ data: { from, to } }),
  });
  const { data: rows = [], isFetching: drillLoading } = useQuery({
    queryKey: ["ceo", "drill", drill?.metric, from, to],
    queryFn: () => drillFn({ data: { metric: drill!.metric as never, from, to } }),
    enabled: !!drill,
  });

  const cur = (data?.current ?? null) as Overview | null;
  const prev = (data?.previous ?? null) as Overview | null;

  const k = (n: string) => N(cur?.kpi?.[n] ?? null);
  const kp = (n: string) => N(prev?.kpi?.[n] ?? null);

  const funnel = useMemo(() => {
    if (!cur) return [];
    const steps: Array<[string, number | null, string]> = [
      ["Заявки (ліди)", k("leads"), "leads"],
      ["Цільові ліди", k("qualified"), "qualified"],
      ["Заміри призначено", k("measurements_scheduled"), "measurements"],
      ["Заміри виконано", k("measurements_completed"), "measurements"],
      ["Кошториси", k("estimates"), "estimates"],
      ["Договори", k("contracts"), "contracts"],
    ];
    const base = steps[0][1] || 0;
    return steps.map(([label, value, metric], i) => ({
      label, value, metric,
      ofTotal: base ? ((value ?? 0) / base) * 100 : 0,
      ofPrev: i === 0 ? 100 : (steps[i - 1][1] || 0) ? ((value ?? 0) / (steps[i - 1][1] as number)) * 100 : 0,
    }));
  }, [cur]);

  const monthLabel = useMemo(() => {
    const d = new Date(`${from}T00:00:00Z`);
    return d.toLocaleDateString("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [from]);

  const setMonth = (offset: number) => {
    const d = new Date(`${from}T00:00:00Z`);
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    setFrom(iso(first));
    setTo(iso(last));
  };

  const spend = k("marketing_spend");
  const leads = k("leads");
  const contracts = k("contracts");
  const contractValue = k("contract_value");
  const cpl = spend != null && leads ? spend / leads : null;
  const cac = spend != null && contracts ? spend / contracts : null;
  const romi = spend ? ((contractValue ?? 0) - spend) / spend * 100 : null;
  const avgCheck = contracts ? (contractValue ?? 0) / contracts : null;

  const dq = cur?.data_quality ?? {};
  const tel = cur?.telephony ?? {};

  return (
    <AppShell>
      <div className="p-3 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Аналітика</div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight">CEO-звіт · {monthLabel}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Всі показники рахуються з реальних записів ERP. Порожні джерела показані як «немає даних», а не як нуль.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setMonth(-1)} className="rounded-md border border-border px-2 py-1.5 text-xs">← Місяць</button>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
            <button onClick={() => setMonth(1)} className="rounded-md border border-border px-2 py-1.5 text-xs">Місяць →</button>
          </div>
        </div>

        {isLoading ? <EmptyState text="Завантаження…" /> : !cur ? <EmptyState text="Немає даних за період" /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 md:gap-3">
              <KpiCard label="Витрати на рекламу" value={show(spend, fmtMoney)} delta={delta(spend, kp("marketing_spend"))} hint="Ads + офлайн" />
              <KpiCard label="Заявки" value={show(leads, fmtNum)} delta={delta(leads, kp("leads"))} />
              <KpiCard label="Цільові" value={show(k("qualified"), fmtNum)} delta={delta(k("qualified"), kp("qualified"))} />
              <KpiCard label="Заміри виконано" value={show(k("measurements_completed"), fmtNum)} delta={delta(k("measurements_completed"), kp("measurements_completed"))} />
              <KpiCard label="Кошториси" value={show(k("estimates"), fmtNum)} delta={delta(k("estimates"), kp("estimates"))} />
              <KpiCard label="Договори" value={show(contracts, fmtNum)} delta={delta(contracts, kp("contracts"))} />
              <KpiCard label="Сума договорів" value={show(contractValue, fmtMoney)} delta={delta(contractValue, kp("contract_value"))} />
              <KpiCard label="Середній чек" value={show(avgCheck, fmtMoney)} />
              <KpiCard label="CPL" value={show(cpl, fmtMoney)} hint="Витрати / заявки" />
              <KpiCard label="CAC" value={show(cac, fmtMoney)} hint="Витрати / договори" />
              <KpiCard label="Оплати" value={show(k("payments"), fmtMoney)} delta={delta(k("payments"), kp("payments"))} hint="Платіж ≠ виручка" />
              <KpiCard label="ROMI" value={show(romi, fmtPct)} status={romi != null && romi < 0 ? "bad" : "good"} />
            </div>

            <Panel title="Воронка">
              <div className="space-y-1.5">
                {funnel.map((s) => (
                  <button key={s.label} onClick={() => setDrill({ metric: s.metric, label: s.label })}
                    className="w-full text-left group">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold group-hover:text-primary">{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtNum(s.value ?? 0)} · {fmtPct(s.ofTotal)} від заявок · {fmtPct(s.ofPrev)} від попереднього кроку
                      </span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.max(1, Math.min(100, s.ofTotal))}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Джерела заявок">
              {cur.sources.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1">Джерело</th>
                        <th className="text-right">Витрати</th><th className="text-right">Кліки</th>
                        <th className="text-right">Заявки</th><th className="text-right">Цільові</th>
                        <th className="text-right">CPL</th><th className="text-right">Договори</th>
                        <th className="text-right">Сума</th><th className="text-right">CAC</th><th className="text-right">ROMI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cur.sources.map((s) => {
                        const sp = Number(s.spend) || 0;
                        const ld = Number(s.leads) || 0;
                        const ct = Number(s.contracts) || 0;
                        const cv = Number(s.contract_value) || 0;
                        return (
                          <tr key={String(s.source)} className="border-t border-border/60">
                            <td className="py-1.5">{String(s.source)}</td>
                            <td className="text-right tabular-nums">{sp ? fmtMoney(sp) : "—"}</td>
                            <td className="text-right tabular-nums">{fmtNum(Number(s.clicks) || 0)}</td>
                            <td className="text-right tabular-nums">{fmtNum(ld)}</td>
                            <td className="text-right tabular-nums">{fmtNum(Number(s.qualified) || 0)}</td>
                            <td className="text-right tabular-nums">{sp && ld ? fmtMoney(sp / ld) : "—"}</td>
                            <td className="text-right tabular-nums">{fmtNum(ct)}</td>
                            <td className="text-right tabular-nums">{cv ? fmtMoney(cv) : "—"}</td>
                            <td className="text-right tabular-nums">{sp && ct ? fmtMoney(sp / ct) : "—"}</td>
                            <td className="text-right tabular-nums">{sp ? fmtPct(((cv - sp) / sp) * 100) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState text="Немає джерел за період" />}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Витрати доступні лише для каналів із синхронізованими або внесеними вручну даними. Для решти показано «—».
              </p>
            </Panel>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Телефонія">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    ["Всього дзвінків", fmtNum(tel.total ?? 0)],
                    ["Вхідні", fmtNum(tel.inbound ?? 0)],
                    ["Вихідні", fmtNum(tel.outbound ?? 0)],
                    ["Пропущені", fmtNum(tel.missed ?? 0)],
                    ["Унікальні номери", fmtNum(tel.unique_numbers ?? 0)],
                    ["Середня тривалість", `${fmtNum(tel.avg_duration ?? 0)} с`],
                    ["Пропущені (унікальні)", fmtNum(tel.missed_unique ?? 0)],
                    ["Передзвонили", fmtNum(tel.missed_called_back ?? 0)],
                    ["Частка передзвонів", tel.missed_unique ? fmtPct(((tel.missed_called_back ?? 0) / tel.missed_unique) * 100) : "немає даних"],
                  ].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg border border-border p-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{l}</div>
                      <div className="text-sm font-bold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setDrill({ metric: "calls_missed", label: "Пропущені дзвінки" })}
                  className="mt-2 text-xs font-semibold text-primary">Показати пропущені →</button>
              </Panel>

              <Panel title="Якість даних">
                <ul className="space-y-1 text-xs">
                  {[
                    ["Ліди без джерела", dq.leads_no_source, "dq_leads_no_source"],
                    ["Ліди без менеджера", dq.leads_no_manager, "dq_leads_no_manager"],
                    ["Дзвінки без прив'язки", dq.calls_unlinked, "dq_calls_unlinked"],
                    ["Заміри без замірника", dq.measurements_no_surveyor, "dq_measurements_no_surveyor"],
                    ["Кошториси без замовлення", dq.estimates_no_order, "dq_estimates_no_order"],
                    ["Замовлення без суми", dq.orders_no_amount, "dq_orders_no_amount"],
                  ].map(([label, value, metric]) => (
                    <li key={label as string} className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
                      <button className="text-left hover:text-primary" onClick={() => setDrill({ metric: metric as string, label: label as string })}>
                        {label}
                      </button>
                      <span className={`tabular-nums font-semibold ${Number(value) > 0 ? "text-warning" : "text-muted-foreground"}`}>{fmtNum(Number(value) || 0)}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/data-audit" className="mt-2 inline-block text-xs font-semibold text-primary">Перейти до аудиту даних →</Link>
              </Panel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Менеджери">
                {cur.managers.length ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left py-1">Співробітник</th><th className="text-right">Заявки</th><th className="text-right">Цільові</th><th className="text-right">Договори</th><th className="text-right">Сума</th><th className="text-right">Конверсія</th></tr>
                    </thead>
                    <tbody>
                      {cur.managers.map((m) => (
                        <tr key={String(m.user_id)} className="border-t border-border/60">
                          <td className="py-1.5">{String(m.name)}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(m.leads) || 0)}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(m.qualified) || 0)}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(m.contracts) || 0)}</td>
                          <td className="text-right tabular-nums">{fmtMoney(Number(m.contract_value) || 0)}</td>
                          <td className="text-right tabular-nums">{Number(m.leads) ? fmtPct(ratio(Number(m.contracts), Number(m.leads)) ?? 0) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <EmptyState text="Заявки та замовлення за період не мають відповідального" />}
              </Panel>

              <Panel title="Замірники">
                {cur.surveyors.length ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left py-1">Співробітник</th><th className="text-right">Призначено</th><th className="text-right">Виконано</th><th className="text-right">Скасовано</th><th className="text-right">Виконання</th></tr>
                    </thead>
                    <tbody>
                      {cur.surveyors.map((s, i) => (
                        <tr key={String(s.user_id ?? i)} className="border-t border-border/60">
                          <td className="py-1.5">{s.user_id ? String(s.name) : "Без замірника"}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(s.assigned) || 0)}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(s.completed) || 0)}</td>
                          <td className="text-right tabular-nums">{fmtNum(Number(s.cancelled) || 0)}</td>
                          <td className="text-right tabular-nums">{Number(s.assigned) ? fmtPct(ratio(Number(s.completed), Number(s.assigned)) ?? 0) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <EmptyState text="Немає замірів за період" />}
              </Panel>
            </div>

            {drill ? (
              <Panel title={`Деталізація: ${drill.label}`} action={<button className="text-xs text-muted-foreground" onClick={() => setDrill(null)}>Закрити</button>}>
                {drillLoading ? <EmptyState text="Завантаження…" /> : rows.length ? (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground"><tr><th className="text-left py-1">Запис</th><th className="text-left">Деталі</th><th className="text-left">Дата</th><th className="text-right">Сума</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-t border-border/60">
                            <td className="py-1.5">{r.href ? <Link to={r.href} className="text-primary hover:underline">{r.title}</Link> : r.title}</td>
                            <td className="text-muted-foreground">{r.subtitle ?? "—"}</td>
                            <td className="tabular-nums">{r.date ? new Date(r.date).toLocaleDateString("uk-UA") : "—"}</td>
                            <td className="text-right tabular-nums">{r.amount ? fmtMoney(r.amount) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState text="Немає записів" />}
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
