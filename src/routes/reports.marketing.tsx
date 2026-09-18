import { createFileRoute } from "@tanstack/react-router";
import { ReportPage, KpiRow, SummaryTable, money, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";
import { resolveChannel, getChannel, acceptsSpend } from "@/lib/marketing/channels";

export const Route = createFileRoute("/reports/marketing")({
  head: () => ({ meta: [
    { title: "Звіт «Marketing» — TERZI ERP" },
    { name: "description", content: "Канали TERZI: заявки, кваліфіковані, договори, витрати та CPL за канонічною атрибуцією." },
    { property: "og:title", content: "Звіт «Marketing» — TERZI ERP" },
    { property: "og:description", content: "Ефективність рекламних і органічних каналів TERZI за період." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: MarketingReport,
});

function MarketingReport() {
  const { query, data } = useOverview();
  if (query.isLoading) return <EmptyState text="Завантаження маркетингу…" />;
  if (query.isError) return <EmptyState text="Немає доступу до маркетингових даних" />;

  const sources = (data?.sources ?? []) as any[];
  const rows = sources.map((s) => {
    const channel = resolveChannel({ source: s.source });
    const spendAllowed = channel ? acceptsSpend(channel.key) : false;
    const spend = spendAllowed ? Number(s.spend) || 0 : null;
    return {
      __key: s.source,
      channel: channel?.label ?? s.source ?? "Потребує перевірки",
      leads: num(s.leads),
      qualified: num(s.qualified),
      contracts: num(s.contracts),
      spend: spendAllowed ? money(spend) : "—",
      cpl: spendAllowed && spend && s.leads ? money(spend / s.leads) : "—",
    };
  });
  const unresolved = sources.filter((s) => !resolveChannel({ source: s.source })).length;

  return (
    <ReportPage title="Marketing" description="Канали нормалізовані канонічним реєстром; витрати показуються лише для платних каналів.">
      <KpiRow items={[
        { label: "Витрати", value: money(data?.kpi?.marketing_spend) },
        { label: "Заявки", value: num(data?.kpi?.leads) },
        { label: "Кваліфіковані", value: num(data?.kpi?.qualified) },
        { label: "Джерел без каналу", value: num(unresolved), note: unresolved ? "потребує перевірки" : undefined },
      ]} />
      <SummaryTable
        columns={[
          { key: "channel", label: "Канал" },
          { key: "leads", label: "Ліди", align: "right" },
          { key: "qualified", label: "Кваліф.", align: "right" },
          { key: "contracts", label: "Договори", align: "right" },
          { key: "spend", label: "Витрати", align: "right" },
          { key: "cpl", label: "CPL", align: "right" },
        ]}
        rows={rows}
      />
      <p className="text-[10px] text-muted-foreground">Ліди без джерела: {num(data?.data_quality?.leads_no_source)}.</p>
    </ReportPage>
  );
}
