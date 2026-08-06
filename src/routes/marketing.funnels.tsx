import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState, fmtNum, fmtPct } from "@/components/marketing/MarketingShell";
import { getMarketingOverview, listMarketingRefs } from "@/lib/marketing.functions";
import { sumMetrics, buildFunnel } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/funnels")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Воронки — Маркетинг TERZI" },
    { name: "description", content: "Воронка TERZI: покази, кліки, звернення, цільові ліди, заміри, КП, договори, передоплати, об'єкти." },
    { property: "og:title", content: "Воронки — Маркетинг TERZI" },
    { property: "og:description", content: "Аналіз втрат клієнтів на кожному етапі маркетингової воронки." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: FunnelsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

function FunnelsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [channel, setChannel] = useState("");

  const overviewFn = useServerFn(getMarketingOverview);
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });
  const { data, isLoading } = useQuery({ queryKey: ["mkt", "overview", from, to], queryFn: () => overviewFn({ data: { from, to } }) });

  const funnel = useMemo(() => {
    if (!data) return null;
    const metrics = channel ? data.metrics.filter((m) => m.channel_id === channel) : data.metrics;
    const leads = channel ? data.leads.filter((l) => l.marketing_channel_id === channel) : data.leads;
    const sum = sumMetrics(metrics as never);
    return buildFunnel({
      impressions: sum.impressions,
      clicks: sum.clicks,
      requests: leads.length,
      qualified: leads.filter((l) => l.lead_quality === "цільовий").length,
      measurementsBooked: data.measurements.length,
      measurementsDone: data.measurements.filter((m) => m.status === "done").length,
      quotes: data.estimates.length,
      contracts: data.orders.filter((o) => ["contract", "sold"].includes(String(o.commercial_status))).length,
      prepayments: data.orders.filter((o) => ["contract", "sold"].includes(String(o.commercial_status))).length,
      completed: data.orders.filter((o) => String(o.commercial_status) === "sold").length,
    });
  }, [data, channel]);

  return (
    <MarketingShell title="Воронки" subtitle="Де саме втрачаються клієнти між кліком і виконаним об'єктом">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="">Усі канали</option>
          {(refs?.channels ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <Panel title="Загальна воронка">
        {isLoading ? <EmptyState text="Завантаження…" /> : funnel ? (
          <div className="space-y-2">
            {funnel.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-xs">
                  <span>{s.label}</span>
                  <span className="tabular-nums font-semibold">{fmtNum(s.value)} · від попереднього {fmtPct(s.fromPrev)}</span>
                </div>
                <div className="h-2 rounded bg-secondary overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, s.fromTop || (s.value ? 100 : 0))}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState text="Немає даних" />}
      </Panel>
    </MarketingShell>
  );
}
