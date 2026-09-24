import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState, KpiCard, fmtMoney, fmtNum, fmtPct } from "@/components/marketing/MarketingShell";
import { getMarketingOverview, listMarketingRefs, runAlertRules, resolveAlert, createTaskFromMarketing } from "@/lib/marketing.functions";
import { sumMetrics, derived, deltaPct, kpiStatus, romi, buildFunnel, num } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Маркетинг — огляд TERZI" },
    { name: "description", content: "Marketing Control Center TERZI: витрата, ліди, заміри, договори, виручка та ROMI в одному екрані." },
    { property: "og:title", content: "Маркетинг — огляд TERZI" },
    { property: "og:description", content: "Повний ланцюг: витрата → клік → звернення → замір → КП → договір → прибуток → ROMI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: MarketingOverview,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS = [
  { key: "today", label: "Сьогодні", days: 0 },
  { key: "yesterday", label: "Вчора", days: -1 },
  { key: "7d", label: "7 днів", days: 6 },
  { key: "month", label: "Цей місяць", days: -2 },
  { key: "prev_month", label: "Минулий місяць", days: -3 },
];

function rangeFor(key: string) {
  const now = new Date();
  if (key === "today") return { from: iso(now), to: iso(now) };
  if (key === "yesterday") { const y = new Date(now.getTime() - 864e5); return { from: iso(y), to: iso(y) }; }
  if (key === "7d") return { from: iso(new Date(now.getTime() - 6 * 864e5)), to: iso(now) };
  if (key === "prev_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(s), to: iso(e) };
  }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

function MarketingOverview() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState("month");
  const [channelFilter, setChannelFilter] = useState("");
  const range = useMemo(() => rangeFor(preset), [preset]);

  const overviewFn = useServerFn(getMarketingOverview);
  const refsFn = useServerFn(listMarketingRefs);
  const runRules = useServerFn(runAlertRules);
  const resolveFn = useServerFn(resolveAlert);
  const taskFn = useServerFn(createTaskFromMarketing);

  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["mkt", "overview", range.from, range.to],
    queryFn: () => overviewFn({ data: range }),
  });

  const view = useMemo(() => {
    if (!data) return null;
    const metrics = channelFilter ? data.metrics.filter((m) => m.channel_id === channelFilter) : data.metrics;
    const leads = channelFilter ? data.leads.filter((l) => l.marketing_channel_id === channelFilter) : data.leads;
    const sum = sumMetrics(metrics as never);
    const prev = sumMetrics(data.prevMetrics as never);
    const requests = leads.length;
    const qualified = leads.filter((l) => l.lead_quality === "цільовий").length;
    const booked = data.measurements.length;
    const done = data.measurements.filter((m) => m.status === "done").length;
    const quotes = data.estimates.length;
    const contracts = data.orders.filter((o) => ["contract", "sold"].includes(String(o.commercial_status))).length;
    const completed = data.orders.filter((o) => String(o.commercial_status) === "sold").length;
    const d = derived(sum, requests, qualified, done, contracts);
    const plannedBudget = data.budgets.reduce((s, b) => s + num(b.planned_amount), 0);

    const byChannel = new Map<string, { spend: number; clicks: number; requests: number; qualified: number }>();
    for (const m of metrics) {
      const k = m.channel_id ?? "—";
      const cur = byChannel.get(k) ?? { spend: 0, clicks: 0, requests: 0, qualified: 0 };
      cur.spend += num(m.spend); cur.clicks += num(m.clicks);
      byChannel.set(k, cur);
    }
    for (const l of leads) {
      const k = l.marketing_channel_id ?? "—";
      const cur = byChannel.get(k) ?? { spend: 0, clicks: 0, requests: 0, qualified: 0 };
      cur.requests += 1;
      if (l.lead_quality === "цільовий") cur.qualified += 1;
      byChannel.set(k, cur);
    }

    type CampRow = { spend: number; clicks: number; conversions: number; requests: number; qualified: number; channelId: string | null };
    const byCampaign = new Map<string, CampRow>();
    const blank = (): CampRow => ({ spend: 0, clicks: 0, conversions: 0, requests: 0, qualified: 0, channelId: null });
    for (const m of metrics) {
      if (!m.campaign_id) continue;
      const cur = byCampaign.get(m.campaign_id) ?? blank();
      cur.spend += num(m.spend); cur.clicks += num(m.clicks); cur.conversions += num((m as { conversions?: unknown }).conversions);
      cur.channelId ??= m.channel_id ?? null;
      byCampaign.set(m.campaign_id, cur);
    }
    let attributedRequests = 0;
    for (const l of leads) {
      if (!l.marketing_campaign_id) continue;
      attributedRequests += 1;
      const cur = byCampaign.get(l.marketing_campaign_id) ?? blank();
      cur.requests += 1;
      if (l.lead_quality === "цільовий") cur.qualified += 1;
      cur.channelId ??= l.marketing_channel_id ?? null;
      byCampaign.set(l.marketing_campaign_id, cur);
    }

    return {
      sum, prev, requests, qualified, booked, done, quotes, contracts, completed, d, plannedBudget, attributedRequests,
      byChannel: [...byChannel.entries()],
      byCampaign: [...byCampaign.entries()].sort((a, b) => b[1].spend - a[1].spend || b[1].requests - a[1].requests),
      funnel: buildFunnel({
        impressions: sum.impressions, clicks: sum.clicks, requests, qualified,
        measurementsBooked: booked, measurementsDone: done, quotes, contracts,
        prepayments: contracts, completed,
      }),
      unhandled: leads.filter((l) => !l.lead_quality),
      romi: romi(data.grossProfit, sum.spend),
    };
  }, [data, channelFilter]);

  const channelName = (id: string) => refs?.channels.find((c) => c.id === id)?.name ?? "Без каналу";
  const campaignName = (id: string) => refs?.campaigns.find((c) => c.id === id)?.name ?? "Без кампанії";

  return (
    <MarketingShell
      title="Огляд"
      subtitle="Витрата → клік → звернення → цільовий лід → замір → КП → договір → прибуток → ROMI"
      actions={
        <button
          onClick={async () => {
            const res = await runRules({}).catch((e: Error) => { toast.error(e.message); return null; });
            if (res) { toast.success(`Перевірено правил: ${res.checked}, нових попереджень: ${res.created}`); qc.invalidateQueries({ queryKey: ["mkt"] }); }
          }}
          className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
          Перевірити правила
        </button>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${preset === p.key ? "bg-secondary border-primary" : "border-border text-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="">Усі канали</option>
          {(refs?.channels ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? <EmptyState text="Завантаження показників…" /> : null}
      {error ? <EmptyState text="Помилка завантаження даних маркетингу" /> : null}

      {view ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            <KpiCard label="Витрата" value={fmtMoney(view.sum.spend)} delta={deltaPct(view.sum.spend, num(view.prev.spend))}
              hint={view.plannedBudget ? `план ${fmtMoney(view.plannedBudget)}` : "план не заданий"} status="good" />
            <KpiCard label="Освоєння плану" value={view.plannedBudget ? fmtPct((view.sum.spend / view.plannedBudget) * 100) : "—"} />
            <KpiCard label="Покази" value={fmtNum(view.sum.impressions)} />
            <KpiCard label="Кліки" value={fmtNum(view.sum.clicks)} delta={deltaPct(view.sum.clicks, view.prev.clicks)}
              status={kpiStatus(view.sum.clicks, view.prev.clicks)} />
            <KpiCard label="CTR" value={fmtPct(view.d.ctr)} />
            <KpiCard label="CPC" value={fmtMoney(view.d.cpc)} />
            <KpiCard label="CPM" value={fmtMoney(view.d.cpm)} />
            <KpiCard label="Конверсії (дані реклами)" value={fmtNum(view.sum.conversions)} hint="як рахує рекламний кабінет" />
            <KpiCard label="Конверсія клік → конверсія" value={view.sum.clicks > 0 ? fmtPct((view.sum.conversions / view.sum.clicks) * 100) : "—"} />
            <KpiCard label="Ціна конверсії" value={view.sum.conversions > 0 ? fmtMoney(view.sum.spend / view.sum.conversions) : "—"} />
            <KpiCard label="Клік → заявка CRM" value={view.sum.clicks > 0 ? fmtPct((view.attributedRequests / view.sum.clicks) * 100) : "—"} hint={`заявок з кампаній: ${view.attributedRequests}`} />
            <KpiCard label="Звернення" value={fmtNum(view.requests)} />
            <KpiCard label="CPL" value={fmtMoney(view.d.cpl)} />
            <KpiCard label="Цільові ліди" value={fmtNum(view.qualified)}
              delta={deltaPct(view.qualified, data?.prevLeadsQualified ?? 0)} status={kpiStatus(view.qualified, data?.prevLeadsQualified ?? 0)} />
            <KpiCard label="Ціна цільового ліда" value={fmtMoney(view.d.cpql)} />
            <KpiCard label="Заміри призначені" value={fmtNum(view.booked)} />
            <KpiCard label="Заміри відбулись" value={fmtNum(view.done)} />
            <KpiCard label="Вартість заміру" value={fmtMoney(view.d.cpMeasurement)} />
            <KpiCard label="КП" value={fmtNum(view.quotes)} />
            <KpiCard label="Договори" value={fmtNum(view.contracts)} />
            <KpiCard label="Вартість договору" value={fmtMoney(view.d.cpContract)} />
            <KpiCard label="Виручка" value={fmtMoney(data?.revenue ?? 0)} />
            <KpiCard label="Валовий прибуток" value={fmtMoney(data?.grossProfit ?? 0)} status={(data?.grossProfit ?? 0) >= 0 ? "good" : "bad"} />
            <KpiCard label="ROMI" value={view.sum.spend > 0 ? fmtPct(view.romi) : "—"} status={view.romi >= 0 ? "good" : "bad"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Вартість заявки по каналах" action={<span className="text-[10px] text-muted-foreground">порівняння із середньою CPL</span>}>
              {view.byChannel.length ? (() => {
                const paid = view.byChannel.filter(([, v]) => v.spend > 0 && v.requests > 0);
                const tSpend = paid.reduce((s, [, v]) => s + v.spend, 0);
                const tReq = paid.reduce((s, [, v]) => s + v.requests, 0);
                const avg = tReq ? tSpend / tReq : 0;
                const maxCpl = Math.max(0, ...paid.map(([, v]) => v.spend / v.requests));
                return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left py-1">Канал</th><th className="text-right">Витрата</th><th className="text-right">Заявки</th><th className="text-right">Цільові</th><th className="text-right">CPL</th><th className="text-right">Ціна цільової</th><th className="w-28 pl-3 text-left">vs середня</th></tr>
                    </thead>
                    <tbody>
                      {[...view.byChannel].sort((a, b) => {
                        const ca = a[1].requests && a[1].spend ? a[1].spend / a[1].requests : Infinity;
                        const cb = b[1].requests && b[1].spend ? b[1].spend / b[1].requests : Infinity;
                        return ca - cb;
                      }).map(([id, v]) => {
                        const cpl = v.requests && v.spend ? v.spend / v.requests : null;
                        const diff = cpl !== null && avg ? ((cpl - avg) / avg) * 100 : null;
                        return (
                        <tr key={id} className="border-t border-border/60">
                          <td className="py-1.5 font-semibold">{id === "—" ? "Без каналу" : channelName(id)}</td>
                          <td className="text-right tabular-nums">{v.spend ? fmtMoney(v.spend) : "—"}</td>
                          <td className="text-right tabular-nums">{v.requests}</td>
                          <td className="text-right tabular-nums">{v.qualified}</td>
                          <td className={`text-right tabular-nums font-bold ${diff === null ? "" : diff <= 0 ? "text-success" : "text-destructive"}`}>{cpl !== null ? fmtMoney(cpl) : "—"}</td>
                          <td className="text-right tabular-nums">{v.qualified && v.spend ? fmtMoney(v.spend / v.qualified) : "—"}</td>
                          <td className="pl-3">
                            {cpl !== null && maxCpl ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 flex-1 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${diff !== null && diff <= 0 ? "bg-success" : "bg-destructive"}`} style={{ width: `${(cpl / maxCpl) * 100}%` }} /></div>
                                <span className="w-10 text-right tabular-nums text-[10px]">{diff !== null ? `${diff > 0 ? "+" : ""}${Math.round(diff)}%` : ""}</span>
                              </div>
                            ) : <span className="text-[10px] text-muted-foreground">немає даних</span>}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">Середня CPL платних каналів: {avg ? fmtMoney(avg) : "немає даних"}. Зелений — дешевше за середню.</p>
                </div>
                );
              })() : <EmptyState text="Немає даних за період. Додайте витрати у розділі «Кампанії» або підключіть інтеграції." />}
            </Panel>

            <Panel title="Воронка" action={<Link to="/marketing/funnels" className="text-xs text-primary font-semibold">Деталі</Link>}>
              <div className="space-y-1.5">
                {view.funnel.map((s) => (
                  <div key={s.key}>
                    <div className="flex justify-between text-xs"><span>{s.label}</span><span className="tabular-nums font-semibold">{fmtNum(s.value)} · {s.fromPrev.toFixed(0)}%</span></div>
                    <div className="h-1.5 rounded bg-secondary overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, s.fromTop || (s.value ? 100 : 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="lg:col-span-2">
            <Panel title="Заявки й конверсії по кампаніях" action={<span className="text-[10px] text-muted-foreground">конверсії — з рекламного кабінету, заявки — з CRM</span>}>
              {view.byCampaign.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1">Кампанія</th><th className="text-left">Канал</th>
                        <th className="text-right">Витрата</th><th className="text-right">Кліки</th>
                        <th className="text-right">Конверсії</th><th className="text-right">Клік → конв.</th>
                        <th className="text-right">Заявки CRM</th><th className="text-right">Клік → заявка</th>
                        <th className="text-right">Цільові</th><th className="text-right">CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.byCampaign.slice(0, 20).map(([id, v]) => (
                        <tr key={id} className="border-t border-border/60">
                          <td className="py-1.5 max-w-[220px] truncate">{campaignName(id)}</td>
                          <td>{v.channelId ? channelName(v.channelId) : "—"}</td>
                          <td className="text-right tabular-nums">{fmtMoney(v.spend)}</td>
                          <td className="text-right tabular-nums">{fmtNum(v.clicks)}</td>
                          <td className="text-right tabular-nums">{fmtNum(v.conversions)}</td>
                          <td className="text-right tabular-nums">{v.clicks ? fmtPct((v.conversions / v.clicks) * 100) : "—"}</td>
                          <td className="text-right tabular-nums font-semibold">
                            {v.requests}{v.requests === 0 && v.spend > 0 ? <span className="ml-1 text-destructive">немає прив'язаних</span> : null}
                          </td>
                          <td className="text-right tabular-nums">{v.clicks ? fmtPct((v.requests / v.clicks) * 100) : "—"}</td>
                          <td className="text-right tabular-nums">{v.qualified}</td>
                          <td className="text-right tabular-nums">{v.requests && v.spend ? fmtMoney(v.spend / v.requests) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Заявок з прив'язкою до кампанії: {fmtNum(view.attributedRequests)} з {fmtNum(view.requests)}. Заявки без мітки кампанії (UTM / click ID) не приписуються жодній кампанії.
                  </p>
                </div>
              ) : <EmptyState text="Немає даних по кампаніях за період" />}
            </Panel>
            </div>

            <Panel title="Нові необроблені ліди" action={<Link to="/marketing/leads" className="text-xs text-primary font-semibold">Усі ліди</Link>}>
              {view.unhandled.length ? (
                <div className="space-y-1.5">
                  {view.unhandled.slice(0, 8).map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs border-b border-border/60 pb-1.5">
                      <span className="truncate">{l.title}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{new Date(l.created_at).toLocaleDateString("uk-UA")}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="Усі ліди кваліфіковані" />}
            </Panel>
          </div>

          <Panel title="Потребує уваги" action={<span className="text-xs text-muted-foreground">{data?.alerts.length ?? 0} відкритих</span>}>
            {(data?.alerts ?? []).length ? (
              <div className="space-y-2">
                {(data?.alerts ?? []).map((a) => (
                  <div key={a.id} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${a.severity === "critical" ? "bg-destructive" : "bg-warning"}`} />
                          {a.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{a.description}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!a.linked_task_id ? (
                          <button className="rounded border border-border px-2 py-1 text-[11px] font-semibold"
                            onClick={async () => {
                              await taskFn({ data: { kind: "alert", id: a.id, title: a.title, description: a.description ?? "" } })
                                .then(() => { toast.success("Задачу створено"); qc.invalidateQueries({ queryKey: ["mkt"] }); })
                                .catch((e: Error) => toast.error(e.message));
                            }}>Задача</button>
                        ) : <span className="text-[11px] text-success self-center">Задача створена</span>}
                        <button className="rounded border border-border px-2 py-1 text-[11px] font-semibold"
                          onClick={async () => { await resolveFn({ data: { id: a.id, status: "resolved" } }); qc.invalidateQueries({ queryKey: ["mkt"] }); }}>
                          Закрити
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="Попереджень немає. Натисніть «Перевірити правила», щоб оновити." />}
          </Panel>
        </>
      ) : null}
    </MarketingShell>
  );
}
