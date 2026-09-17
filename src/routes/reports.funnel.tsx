import { createFileRoute } from "@tanstack/react-router";
import { ReportPage, KpiRow, SummaryTable, money, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";

export const Route = createFileRoute("/reports/funnel")({
  head: () => ({ meta: [
    { title: "Звіт «Воронка» — TERZI ERP" },
    { name: "description", content: "Канонічна воронка TERZI: заявки, кваліфіковані, заміри, кошториси та договори з конверсіями." },
    { property: "og:title", content: "Звіт «Воронка» — TERZI ERP" },
    { property: "og:description", content: "Когортна воронка продажів TERZI за вибраний період." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: FunnelReport,
});

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);

function FunnelReport() {
  const { query, data } = useOverview();
  if (query.isLoading) return <EmptyState text="Завантаження воронки…" />;
  if (query.isError) return <EmptyState text="Немає доступу до аналітики" />;

  const k = data?.kpi ?? {};
  return (
    <ReportPage title="Воронка" description="Кваліфікація підтверджується історією руху ліда; без історії — потребує перевірки.">
      <KpiRow items={[
        { label: "Заявки", value: num(k.leads) },
        { label: "Кваліфіковані", value: num(k.qualified), note: data?.data_quality?.qualification_needs_review ? `${data.data_quality.qualification_needs_review} потребують перевірки` : undefined },
        { label: "Договори", value: num(k.contracts) },
        { label: "Сума договорів", value: money(k.contract_value) },
      ]} />
      <SummaryTable
        columns={[
          { key: "label", label: "Етап" },
          { key: "count", label: "К-сть", align: "right" },
          { key: "conv", label: "Крок", align: "right" },
          { key: "overall", label: "Від заявок", align: "right" },
        ]}
        rows={(data?.funnel ?? []).map((s: any) => ({ __key: s.key, label: s.label, count: num(s.count), conv: pct(s.conversion), overall: pct(s.overall) }))}
      />
      <h3 className="pt-2 text-sm font-black">Менеджери</h3>
      <SummaryTable
        columns={[
          { key: "name", label: "Менеджер" },
          { key: "leads", label: "Ліди", align: "right" },
          { key: "qualified", label: "Кваліф.", align: "right" },
          { key: "contracts", label: "Договори", align: "right" },
          { key: "value", label: "Сума", align: "right" },
        ]}
        rows={(data?.managers ?? []).map((m: any) => ({ __key: m.user_id ?? m.name, name: m.name, leads: num(m.leads), qualified: num(m.qualified), contracts: num(m.contracts), value: money(m.contract_value) }))}
      />
    </ReportPage>
  );
}
