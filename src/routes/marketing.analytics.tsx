import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState, fmtMoney, fmtNum, fmtPct } from "@/components/marketing/MarketingShell";
import { getMarketingOverview, listMarketingRefs } from "@/lib/marketing.functions";
import { num, computeKpi } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/analytics")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Аналітика — Маркетинг TERZI" },
    { name: "description", content: "Аналітика ефективності реклами TERZI: витрати, CPL, CPQL, ROMI та дохід у розрізі каналів і кампаній." },
    { property: "og:title", content: "Аналітика — Маркетинг TERZI" },
    { property: "og:description", content: "Порівняння каналів і кампаній TERZI за вартістю ліда та окупністю." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: AnalyticsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

function AnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [dim, setDim] = useState<"channel" | "campaign">("channel");

  const overviewFn = useServerFn(getMarketingOverview);
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });
  const { data, isLoading } = useQuery({ queryKey: ["mkt", "overview", from, to], queryFn: () => overviewFn({ data: { from, to } }) });

  const rows = useMemo(() => {
    if (!data) return [];
    const keyOf = (m: { channel_id: string | null; campaign_id: string | null }) => (dim === "channel" ? m.channel_id : m.campaign_id) ?? "—";
    const map = new Map<string, { spend: number; clicks: number; impressions: number; leads: number; qualified: number; revenue: number }>();
    const get = (k: string) => {
      let v = map.get(k);
      if (!v) { v = { spend: 0, clicks: 0, impressions: 0, leads: 0, qualified: 0, revenue: 0 }; map.set(k, v); }
      return v;
    };
    for (const m of data.metrics) {
      const v = get(keyOf(m));
      v.spend += num(m.spend); v.clicks += num(m.clicks); v.impressions += num(m.impressions);
    }
    for (const l of data.leads) {
      const k = (dim === "channel" ? l.marketing_channel_id : l.marketing_campaign_id) ?? "—";
      const v = get(k);
      v.leads += 1;
      if (l.lead_quality === "цільовий") v.qualified += 1;
      if (l.status === "won") v.revenue += num(l.budget);
    }
    const nameOf = (id: string) => id === "—" ? "Без атрибуції"
      : (dim === "channel" ? refs?.channels.find((c) => c.id === id)?.name : refs?.campaigns.find((c) => c.id === id)?.name) ?? "—";
    return [...map.entries()].map(([id, v]) => ({ id, name: nameOf(id), ...v, ...computeKpi(v) }))
      .sort((a, b) => b.spend - a.spend);
  }, [data, dim, refs]);

  return (
    <MarketingShell title="Аналітика" subtitle="Витрати, вартість ліда, вартість цільового ліда та окупність реклами">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <select value={dim} onChange={(e) => setDim(e.target.value as "channel" | "campaign")} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="channel">За каналами</option>
          <option value="campaign">За кампаніями</option>
        </select>
      </div>

      <Panel title="Ефективність">
        {isLoading ? <EmptyState text="Завантаження…" /> : rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-1">{dim === "channel" ? "Канал" : "Кампанія"}</th>
                  <th className="text-right">Витрати</th><th className="text-right">Кліки</th><th className="text-right">CTR</th>
                  <th className="text-right">Ліди</th><th className="text-right">Цільові</th>
                  <th className="text-right">CPL</th><th className="text-right">CPQL</th>
                  <th className="text-right">Дохід</th><th className="text-right">ROMI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-1.5">{r.name}</td>
                    <td className="text-right tabular-nums">{fmtMoney(r.spend)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.clicks)}</td>
                    <td className="text-right tabular-nums">{fmtPct(r.ctr)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.leads)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.qualified)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(r.cpl)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(r.cpql)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                    <td className={`text-right tabular-nums ${r.romi < 0 ? "text-destructive" : "text-success"}`}>{fmtPct(r.romi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Немає даних за період" />}
      </Panel>
    </MarketingShell>
  );
}
