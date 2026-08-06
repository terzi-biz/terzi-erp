import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState, fmtMoney, fmtPct } from "@/components/marketing/MarketingShell";
import { CrudPanel } from "@/components/marketing/CrudPanel";
import { getMarketingOverview, listMarketingRefs } from "@/lib/marketing.functions";
import { num } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/budgets")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Бюджети та ліміти — Маркетинг TERZI" },
    { name: "description", content: "План і факт маркетингових бюджетів TERZI, денні ліміти, прогноз витрат і статус оплат." },
    { property: "og:title", content: "Бюджети та ліміти — Маркетинг TERZI" },
    { property: "og:description", content: "Контроль маркетингових бюджетів, темпу витрат і платежів TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: BudgetsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

function BudgetsPage() {
  const now = new Date();
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const [from] = useState(monthStart);
  const [to] = useState(iso(now));

  const refsFn = useServerFn(listMarketingRefs);
  const overviewFn = useServerFn(getMarketingOverview);
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });
  const { data } = useQuery({ queryKey: ["mkt", "overview", from, to], queryFn: () => overviewFn({ data: { from, to } }) });

  const summary = useMemo(() => {
    if (!data) return null;
    const spendByChannel = new Map<string, number>();
    for (const m of data.metrics) if (m.channel_id) spendByChannel.set(m.channel_id, (spendByChannel.get(m.channel_id) ?? 0) + num(m.spend));
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return data.budgets.map((b) => {
      const planned = num(b.planned_amount);
      const actual = b.channel_id ? (spendByChannel.get(b.channel_id) ?? num(b.actual_amount)) : num(b.actual_amount);
      const forecast = (actual / dayOfMonth) * daysInMonth;
      return {
        ...b, planned, actual, forecast,
        rest: planned - actual,
        pace: planned > 0 ? (actual / planned) / (dayOfMonth / daysInMonth) * 100 : 0,
        channelName: refs?.channels.find((c) => c.id === b.channel_id)?.name ?? "Загальний",
      };
    });
  }, [data, refs, now]);

  return (
    <MarketingShell title="Бюджети та ліміти" subtitle="План, факт, залишок, темп витрат, прогноз і статус платежів">
      <Panel title="План і факт поточного місяця">
        {summary?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr><th className="text-left py-1">Канал</th><th className="text-right">План</th><th className="text-right">Факт</th><th className="text-right">Залишок</th><th className="text-right">Темп</th><th className="text-right">Прогноз</th><th className="text-right">Оплата</th></tr>
              </thead>
              <tbody>
                {summary.map((b) => (
                  <tr key={b.id} className="border-t border-border/60">
                    <td className="py-1.5">{b.channelName}</td>
                    <td className="text-right tabular-nums">{fmtMoney(b.planned)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(b.actual)}</td>
                    <td className={`text-right tabular-nums ${b.rest < 0 ? "text-destructive" : ""}`}>{fmtMoney(b.rest)}</td>
                    <td className={`text-right tabular-nums ${b.pace > 120 ? "text-destructive" : ""}`}>{fmtPct(b.pace)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(b.forecast)}</td>
                    <td className="text-right">{b.payment_status === "ok" ? "ок" : b.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Бюджети ще не задані" />}
      </Panel>

      <Panel title="Редагування бюджетів">
        <CrudPanel
          table="marketing_budgets"
          rows={(data?.budgets ?? []) as unknown as Record<string, unknown>[]}
          emptyText="Додайте перший місячний бюджет"
          queryKey={["mkt"]}
          fields={[
            { key: "period_month", label: "Місяць (перше число)", type: "date", required: true },
            { key: "channel_id", label: "Канал", type: "select", options: (refs?.channels ?? []).map((c) => ({ value: c.id, label: c.name })),
              render: (r) => refs?.channels.find((c) => c.id === r.channel_id)?.name ?? "Загальний" },
            { key: "planned_amount", label: "План, ₴", type: "number", required: true },
            { key: "actual_amount", label: "Факт, ₴", type: "number" },
            { key: "daily_limit", label: "Денний ліміт, ₴", type: "number" },
            { key: "payment_status", label: "Статус оплати", type: "select", inTable: false, options: [
              { value: "ok", label: "Ок" }, { value: "pending", label: "Очікує" }, { value: "failed", label: "Не пройшов" }, { value: "no_balance", label: "Немає балансу" },
            ] },
            { key: "next_payment_date", label: "Наступне списання", type: "date", inTable: false },
            { key: "warning_threshold_percent", label: "Поріг попередження, %", type: "number", inTable: false },
          ]}
        />
      </Panel>
    </MarketingShell>
  );
}
