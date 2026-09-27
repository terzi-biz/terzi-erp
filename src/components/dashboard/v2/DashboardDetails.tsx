/**
 * Дашборд v2 · блок «Детальніше»: попередні панелі (воронка періоду з drilldown, телефонія,
 * джерела, фінанси, менеджери, замірники, якість даних, автопідбір лідів). Логіка без змін,
 * лише винесена з src/routes/index.tsx і перестилізована під v2.
 */
import { Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { Link2, ListChecks } from "lucide-react";
import { DQ_SCOPE_BLURBS, PERIOD_DQ_METRICS } from "@/lib/crm/data-quality";
import type { DrilldownMetric } from "@/components/dashboard/panels";

export interface Overview {
  kpi: Record<string, number | null>;
  sources: Array<Record<string, number | string>>;
  managers: Array<Record<string, number | string | null>>;
  surveyors: Array<Record<string, number | string | null>>;
  telephony: Record<string, number>;
  data_quality: Record<string, number>;
}

export interface FinanceSummary {
  income: number; expense: number; grossProfit: number; margin: number; receivable: number; cashOnAccounts: number;
  [k: string]: unknown;
}

const N = (v: unknown) => (v == null ? null : Number(v));
const NO = "немає даних";
const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const money = (n: number) => nf.format(Math.round(n)) + " ₴";
const num = (n: number) => nf.format(n);
const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}%`;
const show = (v: number | null, f: (n: number) => string) => (v == null ? NO : f(v));
const STAGE_COLORS = ["#0B1B3A", "#1F3A6E", "#1F4A8A", "#3F6BB0", "#7C9CCF", "#D4960A"];

function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tz-card ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="tz-h text-[14px]">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const Empty = ({ text = NO }: { text?: string }) => (
  <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{text}</div>
);

export function DashboardDetails({ cur, fin, fxNote, managerPlanMap, onDrill, onMatch }: {
  cur: Overview;
  fin: FinanceSummary | null | undefined;
  fxNote: string | null | undefined;
  managerPlanMap: Map<string, number>;
  onDrill: (d: { metric: DrilldownMetric; title: string }) => void;
  onMatch: () => void;
}) {
  const setDrill = onDrill;
  const setMatchOpen = (_: boolean) => onMatch();
  const k = (n: string) => N(cur?.kpi?.[n] ?? null);

  const funnel = useMemo(() => {
    const steps: Array<[string, number | null]> = [
      ["Заявки (ліди)", k("leads")],
      ["Цільові ліди", k("qualified")],
      ["Заміри призначено", k("measurements_scheduled")],
      ["Заміри виконано", k("measurements_completed")],
      ["Кошториси", k("estimates")],
      ["Договори", k("contracts")],
    ];
    const base = steps[0][1] || 0;
    return steps.map(([label, value], i) => ({
      label,
      value: value ?? 0,
      ofTotal: base ? ((value ?? 0) / base) * 100 : 0,
      ofPrev: i === 0 ? 100 : (steps[i - 1][1] || 0) ? ((value ?? 0) / (steps[i - 1][1] as number)) * 100 : 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  const tel = cur?.telephony ?? {};
  const sources = (cur?.sources ?? []).slice().sort((a, b) => Number(b.leads ?? 0) - Number(a.leads ?? 0));
  const managers = (cur?.managers ?? []).slice().sort((a, b) => Number(b.contract_value ?? 0) - Number(a.contract_value ?? 0));
  const surveyors = cur?.surveyors ?? [];
  const spend = k("marketing_spend");
  const leads = k("leads");
  const contracts = k("contracts");
  const contractValue = k("contract_value");
  const cpl = spend != null && leads ? spend / leads : null;
  const cac = spend != null && contracts ? spend / contracts : null;
  const romi = spend ? (((contractValue ?? 0) - spend) / spend) * 100 : null;
  const avgCheck = contracts ? (contractValue ?? 0) / contracts : null;
  const winRate = leads ? ((contracts ?? 0) / leads) * 100 : null;

  return (
    <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">

            <Panel title="Воронка: від заявки до договору" className="lg:col-span-2">
              <div className="space-y-2">
                {funnel.map((f, i) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setDrill({ metric: (["leads", "qualified", "measurements", "measurements", "estimates", "contracts"] as DrilldownMetric[])[i], title: f.label })}
                    className="flex w-full items-center gap-3 rounded-sm text-left hover:opacity-90"
                  >
                    <div className="w-40 shrink-0 truncate text-[12px] font-semibold">{f.label}</div>
                    <div className="h-8 flex-1 overflow-hidden rounded-sm bg-muted/60">
                      <div
                        className="flex h-full items-center px-2 text-[11px] font-bold text-white transition-all"
                        style={{ width: `${Math.max(6, f.ofTotal)}%`, backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }}
                      >
                        {num(f.value)}
                      </div>
                    </div>
                    <div className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                      {i === 0 ? "100%" : `${pct(f.ofPrev)} з поп.`}
                    </div>
                  </button>
                ))}

                {!funnel.length ? <Empty /> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] md:grid-cols-4">
                <div><span className="text-muted-foreground">Конверсія в договір: </span><b>{winRate == null ? NO : pct(winRate)}</b></div>
                <div><span className="text-muted-foreground">Середній чек: </span><b>{show(avgCheck, money)}</b></div>
                <div><span className="text-muted-foreground">CPL: </span><b>{show(cpl, money)}</b></div>
                <div><span className="text-muted-foreground">CAC: </span><b>{show(cac, money)}</b></div>
              </div>
            </Panel>

            <Panel title="Телефонія" action={<Link to="/crm/calls" className="text-[11px] font-semibold text-[var(--color-primary)]">Усі дзвінки</Link>}>
              {Number(tel.total ?? 0) === 0 ? <Empty text="Дзвінків за період немає" /> : (
                <div className="space-y-2.5">
                  {[
                    ["Всього дзвінків", num(Number(tel.total ?? 0))],
                    ["Вхідні", num(Number(tel.inbound ?? 0))],
                    ["Вихідні", num(Number(tel.outbound ?? 0))],
                    ["Пропущені", num(Number(tel.missed ?? 0))],
                    ["Унікальні номери", num(Number(tel.unique_numbers ?? 0))],
                    ["Середня тривалість", `${Math.round(Number(tel.avg_duration ?? 0))} с`],
                    ["Передзвонили на пропущені", `${num(Number(tel.missed_called_back ?? 0))} / ${num(Number(tel.missed_unique ?? 0))}`],
                  ].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between border-b border-border/60 pb-1.5 text-[12px] last:border-0 last:pb-0">
                      <span className="text-muted-foreground">{l}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                  <div className="rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
                    Частка відповідей: <b className="text-foreground">
                      {Number(tel.total ?? 0) ? pct((Number(tel.answered ?? 0) / Number(tel.total)) * 100) : NO}
                    </b>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Джерела заявок" className="lg:col-span-2" action={<Link to="/reports/ceo" className="text-[11px] font-semibold text-[var(--color-primary)]">CEO-звіт</Link>}>
              {!sources.length ? <Empty /> : (
                <div className="scroll-x">
                  <table className="w-full min-w-[640px] text-[12px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2">Джерело</th>
                        <th className="pb-2 text-right">Витрати</th>
                        <th className="pb-2 text-right">Заявки</th>
                        <th className="pb-2 text-right">Цільові</th>
                        <th className="pb-2 text-right">Договори</th>
                        <th className="pb-2 text-right">Сума</th>
                        <th className="pb-2 text-right">CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s, i) => {
                        const sl = Number(s.leads ?? 0);
                        const sp = Number(s.spend ?? 0);
                        return (
                          <tr key={String(s.source) + i} className="border-t border-border/60">
                            <td className="py-1.5 font-semibold">{String(s.source ?? "—")}</td>
                            <td className="py-1.5 text-right">{sp ? money(sp) : "—"}</td>
                            <td className="py-1.5 text-right">{num(sl)}</td>
                            <td className="py-1.5 text-right">{num(Number(s.qualified ?? 0))}</td>
                            <td className="py-1.5 text-right">{num(Number(s.contracts ?? 0))}</td>
                            <td className="py-1.5 text-right font-semibold">{money(Number(s.contract_value ?? 0))}</td>
                            <td className="py-1.5 text-right">{sp && sl ? money(sp / sl) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Фінанси періоду" action={<Link to="/finance" search={{ tab: "overview" }} className="text-[11px] font-semibold text-[var(--color-primary)]">Фінанси</Link>}>
              <div className="space-y-2.5 text-[12px]">
                {[
                  ["Замовлень у періоді", show(k("orders"), num)],
                  ["Доходи (Finmap)", fin ? money(fin.income) : show(k("payments"), money)],
                  ["Витрати (Finmap)", fin ? money(fin.expense) : show(k("expenses"), money)],
                  ["Прибуток", fin ? money(fin.grossProfit) : show(k("gross_profit"), money)],
                  ["Маржа", fin ? pct(fin.margin) : NO],
                  ["Дебіторка", fin ? money(fin.receivable) : NO],
                  ["Гроші на рахунках", fin ? money(fin.cashOnAccounts) : NO],
                  ["ФОТ нараховано", fin ? money(Number((fin as any).payrollAccrued) || 0) : NO],
                  ["ФОТ KPI + бонуси", fin ? money(Number((fin as any).payrollKpi) || 0) : NO],
                  ["ФОТ виплачено", fin ? money(Number((fin as any).payrollPaid) || 0) : NO],
                  ["Сума договорів", show(contractValue, money)],
                  ["Реклама", show(spend, money) + (spend != null && fxNote ? ` (${fxNote})` : "")],
                  ["ROMI", romi == null ? NO : pct(romi)],
                ].map(([l, v]) => (
                  <div key={l} className="flex items-center justify-between border-b border-border/60 pb-1.5 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{l}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Менеджери" action={<Link to="/crm/leads" search={{} as never} className="text-[11px] font-semibold text-[var(--color-primary)]">Воронка</Link>}>
              {!managers.length ? <Empty /> : (
                <div className="scroll-x">
                  <table className="w-full min-w-[520px] text-[12px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2">Менеджер</th>
                        <th className="pb-2 text-right">Ліди</th>
                        <th className="pb-2 text-right">Цільові</th>
                        <th className="pb-2 text-right">Замовлення</th>
                        <th className="pb-2 text-right">Договори</th>
                        <th className="pb-2 text-right">Сума</th>
                        <th className="pb-2 text-right">План</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map((m, i) => (
                        <tr key={String(m.user_id ?? i)} className="border-t border-border/60">
                          <td className="py-1.5 font-semibold">{m.user_id ? String(m.name) : "Без менеджера"}</td>
                          <td className="py-1.5 text-right">{num(Number(m.leads ?? 0))}</td>
                          <td className="py-1.5 text-right">{num(Number(m.qualified ?? 0))}</td>
                          <td className="py-1.5 text-right">{num(Number(m.orders ?? 0))}</td>
                          <td className="py-1.5 text-right">{num(Number(m.contracts ?? 0))}</td>
                          <td className="py-1.5 text-right font-semibold">{money(Number(m.contract_value ?? 0))}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{(managerPlanMap.get(String(m.user_id)) ?? 0) > 0 ? money(managerPlanMap.get(String(m.user_id))!) : "Ціль не налаштована"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Замірники" action={<Link to="/crm/tasks" className="text-[11px] font-semibold text-[var(--color-primary)]">Задачі та заміри</Link>}>
              {!surveyors.length ? <Empty text="Замірів за період немає" /> : (
                <div className="scroll-x">
                  <table className="w-full min-w-[440px] text-[12px]">
                    <thead>
                      <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2">Замірник</th>
                        <th className="pb-2 text-right">Призначено</th>
                        <th className="pb-2 text-right">Виконано</th>
                        <th className="pb-2 text-right">Скасовано</th>
                        <th className="pb-2 text-right">Виконання</th>
                      </tr>
                    </thead>
                    <tbody>
                      {surveyors.map((s, i) => {
                        const a = Number(s.assigned ?? 0);
                        const c = Number(s.completed ?? 0);
                        return (
                          <tr key={String(s.user_id ?? i)} className="border-t border-border/60">
                            <td className="py-1.5 font-semibold">{s.user_id ? String(s.name) : "Без замірника"}</td>
                            <td className="py-1.5 text-right">{num(a)}</td>
                            <td className="py-1.5 text-right">{num(c)}</td>
                            <td className="py-1.5 text-right">{num(Number(s.cancelled ?? 0))}</td>
                            <td className="py-1.5 text-right font-semibold">{a ? pct((c / a) * 100) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Якість даних" action={<Link to="/data-audit" className="text-[11px] font-semibold text-[var(--color-primary)]">Аудит даних</Link>}>
            <p className="mb-2 text-[11px] text-muted-foreground">{DQ_SCOPE_BLURBS.period_analytics}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {([
                ["leads_no_source", "dq_leads_no_source"],
                ["leads_no_manager", "dq_leads_no_manager"],
                ["calls_unlinked", "dq_calls_unlinked"],
                ["measurements_no_surveyor", "dq_measurements_no_surveyor"],
                ["estimates_no_order", "dq_estimates_no_order"],
                ["orders_no_source", null],
                ["orders_no_amount", "dq_orders_no_amount"],
                ["payments_no_order", null],
              ] as Array<[string, DrilldownMetric | null]>).map(([key, metric]) => {
                const meta = PERIOD_DQ_METRICS.find((m) => m.key === key);
                const label = meta?.label ?? key;
                const v = Number(cur.data_quality?.[key] ?? 0);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!metric}
                    onClick={() => metric && setDrill({ metric, title: label })}
                    className={`rounded-md border px-2.5 py-2 text-left ${v ? "border-warning/50 bg-warning/10" : "border-border"} ${metric ? "hover:border-primary" : ""}`}
                  >
                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className={`mt-1 text-lg font-black ${v ? "text-warning" : "text-success"}`}>{num(v)}</div>
                    {meta ? <div className="mt-0.5 text-[10px] text-muted-foreground">{meta.scopeHint}</div> : null}
                  </button>
                );
              })}
            </div>
          </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title="Автопідбір зв'язку лідів"
              className="lg:col-span-3"
              action={
                <button onClick={() => setMatchOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-[11px] font-semibold text-[var(--color-primary)]">
                  <Link2 className="h-3 w-3" /> Показати кандидатів
                </button>
              }
            >
              <p className="text-[12px] text-muted-foreground">
                Система порівнює ім'я, телефон, адресу й напрямок ліда з картками клієнтів і показує кандидатів із поясненням збігу.
                Прив'язка виконується лише після вашого підтвердження.
              </p>
              <div className="mt-2 flex items-center gap-2 text-[12px] flex-wrap">
                <ListChecks className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="text-muted-foreground">
                  Ліди без клієнта — all-time перевірка в{" "}
                  <Link to="/data-audit" className="font-semibold text-[var(--color-primary)]">Аудиті даних</Link>
                  {" "}(не плутати з «без менеджера» за період дашборду).
                </span>
              </div>
            </Panel>
      </div>
    </div>
  );
}
