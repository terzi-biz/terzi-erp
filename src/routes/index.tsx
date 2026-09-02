import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { usePersistedState } from "@/lib/usePersistedState";
import { getAnalyticsOverview } from "@/lib/analytics.functions";
import {
  Plus, Target, Users, Ruler, FileText, Handshake, Wallet, PhoneCall, TrendingUp, TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Приладова панель — TERZI ERP" },
      { name: "description", content: "Дашборд TERZI: заявки, воронка від ліда до договору, джерела, телефонія, менеджери, замірники та фінанси за період." },
      { property: "og:title", content: "Приладова панель — TERZI ERP" },
      { property: "og:description", content: "Реальні KPI TERZI за період: воронка, джерела заявок, телефонія, ефективність менеджерів і фінанси." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

/* ---------- helpers ---------- */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const N = (v: unknown) => (v == null ? null : Number(v));
const NO = "немає даних";
const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const money = (n: number) => nf.format(Math.round(n)) + " ₴";
const num = (n: number) => nf.format(n);
const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}%`;
const show = (v: number | null, f: (n: number) => string) => (v == null ? NO : f(v));
const delta = (cur: number | null, prev: number | null) =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

const STAGE_COLORS = ["#2f4a6d", "#3d6396", "#4e7fbd", "#6f9ed6", "#9dc0e6", "#d3a03c"];

interface Overview {
  kpi: Record<string, number | null>;
  sources: Array<Record<string, number | string>>;
  managers: Array<Record<string, number | string | null>>;
  surveyors: Array<Record<string, number | string | null>>;
  telephony: Record<string, number>;
  data_quality: Record<string, number>;
}

type RangeKey = "d7" | "d30" | "month" | "prev_month" | "quarter";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "d7", label: "7 днів" },
  { key: "d30", label: "30 днів" },
  { key: "month", label: "Цей місяць" },
  { key: "prev_month", label: "Минулий місяць" },
  { key: "quarter", label: "Квартал" },
];

function rangeFor(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const back = (days: number) => new Date(Date.UTC(y, m, now.getUTCDate() - days));
  switch (key) {
    case "d7": return { from: iso(back(6)), to: iso(now) };
    case "d30": return { from: iso(back(29)), to: iso(now) };
    case "month": return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(now) };
    case "prev_month": return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "quarter": return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(now) };
  }
}

/* ---------- primitives ---------- */

function Kpi({ icon: Icon, label, value, sub, d, tone = "navy" }: {
  icon: any; label: string; value: string; sub?: string; d?: number | null; tone?: "navy" | "gold" | "green" | "red";
}) {
  const bar = tone === "gold" ? "var(--color-gold)" : tone === "green" ? "var(--color-success)" : tone === "red" ? "var(--color-destructive)" : "var(--color-primary)";
  const up = d != null && d >= 0;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,32,56,.07)]">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: bar }} />
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: bar }} /> <span className="truncate">{label}</span>
      </div>
      <div className={`mt-2 font-black tracking-tight ${value === NO ? "text-base text-muted-foreground" : "text-[22px] leading-none"}`}>{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        {d != null ? (
          <span className={`inline-flex items-center gap-0.5 font-bold ${up ? "text-success" : "text-destructive"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(d).toFixed(0)}%
          </span>
        ) : null}
        {sub ? <span className="text-muted-foreground truncate">{sub}</span> : null}
      </div>
    </div>
  );
}

function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(16,32,56,.07)] ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-bold">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const Empty = ({ text = NO }: { text?: string }) => (
  <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{text}</div>
);

/* ---------- page ---------- */

function Dashboard() {
  const { user, profile } = useAuth();
  const [rangeKey, setRangeKey] = usePersistedState<RangeKey>("terzi:dash:range", "month");
  const { from, to } = useMemo(() => rangeFor(rangeKey), [rangeKey]);

  const overviewFn = useServerFn(getAnalyticsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["dash", "overview", from, to],
    queryFn: () => overviewFn({ data: { from, to } }),
    enabled: !!user,
  });

  const cur = (data?.current ?? null) as Overview | null;
  const prev = (data?.previous ?? null) as Overview | null;
  const k = (n: string) => N(cur?.kpi?.[n] ?? null);
  const kp = (n: string) => N(prev?.kpi?.[n] ?? null);

  const funnel = useMemo(() => {
    if (!cur) return [];
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

  const hello = profile?.display_name?.split(" ")[0] || "Вітаємо";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Приладова панель</div>
          <h1 className="text-xl md:text-3xl font-black tracking-tight">{hello}, ось стан компанії</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Період: {from} — {to}. Порожні джерела показані як «немає даних», а не як нуль.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                rangeKey === r.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
          <Link to="/calc" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-gold)] px-3 py-1.5 text-xs font-bold text-[var(--color-gold-foreground)]">
            <Plus className="h-3.5 w-3.5" /> Розрахунок
          </Link>
        </div>
      </div>

      {isLoading ? (
        <Empty text="Завантаження…" />
      ) : !cur ? (
        <Empty text="Немає даних за період" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
            <Kpi icon={Target} label="Заявки" value={show(leads, num)} d={delta(leads, kp("leads"))} />
            <Kpi icon={Users} label="Цільові" value={show(k("qualified"), num)} d={delta(k("qualified"), kp("qualified"))} />
            <Kpi icon={Ruler} label="Заміри" value={show(k("measurements_completed"), num)} sub={`призначено ${show(k("measurements_scheduled"), num)}`} d={delta(k("measurements_completed"), kp("measurements_completed"))} />
            <Kpi icon={FileText} label="Кошториси" value={show(k("estimates"), num)} d={delta(k("estimates"), kp("estimates"))} />
            <Kpi icon={Handshake} label="Договори" value={show(contracts, num)} d={delta(contracts, kp("contracts"))} tone="gold" />
            <Kpi icon={Wallet} label="Сума договорів" value={show(contractValue, money)} d={delta(contractValue, kp("contract_value"))} tone="gold" />
            <Kpi icon={Wallet} label="Оплати" value={show(k("payments"), money)} d={delta(k("payments"), kp("payments"))} tone="green" />
            <Kpi icon={TrendingUp} label="Валовий прибуток" value={show(k("gross_profit"), money)} d={delta(k("gross_profit"), kp("gross_profit"))} tone={(k("gross_profit") ?? 0) < 0 ? "red" : "green"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Воронка: від заявки до договору" className="lg:col-span-2">
              <div className="space-y-2">
                {funnel.map((f, i) => (
                  <div key={f.label} className="flex items-center gap-3">
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
                  </div>
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

            <Panel title="Телефонія" action={<Link to="/crm/calls" className="text-[11px] font-semibold text-primary">Усі дзвінки</Link>}>
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
            <Panel title="Джерела заявок" className="lg:col-span-2" action={<Link to="/reports/ceo" className="text-[11px] font-semibold text-primary">CEO-звіт</Link>}>
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

            <Panel title="Фінанси періоду" action={<Link to="/finance" className="text-[11px] font-semibold text-primary">Фінанси</Link>}>
              <div className="space-y-2.5 text-[12px]">
                {[
                  ["Оплати (надходження)", show(k("payments"), money)],
                  ["Витрати", show(k("expenses"), money)],
                  ["Валовий прибуток", show(k("gross_profit"), money)],
                  ["Сума договорів", show(contractValue, money)],
                  ["Реклама", show(spend, money)],
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
            <Panel title="Менеджери" action={<Link to="/crm/leads" className="text-[11px] font-semibold text-primary">Воронка</Link>}>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Замірники" action={<Link to="/crm/tasks" className="text-[11px] font-semibold text-primary">Задачі та заміри</Link>}>
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

          <Panel title="Якість даних" action={<Link to="/data-audit" className="text-[11px] font-semibold text-primary">Аудит даних</Link>}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                ["Ліди без джерела", "leads_no_source"],
                ["Ліди без менеджера", "leads_no_manager"],
                ["Дзвінки без зв'язку", "calls_unlinked"],
                ["Заміри без замірника", "measurements_no_surveyor"],
                ["Кошториси без замовлення", "estimates_no_order"],
                ["Замовлення без джерела", "orders_no_source"],
                ["Замовлення без суми", "orders_no_amount"],
                ["Оплати без замовлення", "payments_no_order"],
              ].map(([label, key]) => {
                const v = Number(cur.data_quality?.[key] ?? 0);
                return (
                  <div key={key} className={`rounded-md border px-2.5 py-2 ${v ? "border-warning/50 bg-warning/10" : "border-border"}`}>
                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className={`mt-1 text-lg font-black ${v ? "text-warning" : "text-success"}`}>{num(v)}</div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
