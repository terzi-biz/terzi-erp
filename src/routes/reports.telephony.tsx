import { createFileRoute } from "@tanstack/react-router";
import { ReportPage, KpiRow, SummaryTable, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";

export const Route = createFileRoute("/reports/telephony")({
  head: () => ({ meta: [
    { title: "Звіт «Телефонія» — TERZI ERP" },
    { name: "description", content: "Дзвінки TERZI за період: вхідні, вихідні, пропущені, передзвони та унікальні номери." },
    { property: "og:title", content: "Звіт «Телефонія» — TERZI ERP" },
    { property: "og:description", content: "Аналітика дзвінків Binotel у розрізі періоду." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: TelephonyReport,
});

function TelephonyReport() {
  const { query, data } = useOverview();
  if (query.isLoading) return <EmptyState text="Завантаження дзвінків…" />;
  if (query.isError) return <EmptyState text="Немає доступу до телефонії" />;
  const t = data?.telephony ?? {};

  return (
    <ReportPage title="Телефонія" description="Джерело — дзвінки Binotel у CRM; передзвін визначається пізнішим вихідним дзвінком на той самий номер.">
      <KpiRow items={[
        { label: "Усього", value: num(t.total) },
        { label: "Пропущені", value: num(t.missed), note: `передзвонили ${num(t.missed_called_back)}` },
        { label: "Унікальні номери", value: num(t.unique_numbers) },
        { label: "Середня тривалість", value: t.avg_duration ? `${Math.round(t.avg_duration)} с` : "—" },
      ]} />
      <SummaryTable
        columns={[{ key: "metric", label: "Показник" }, { key: "value", label: "Значення", align: "right" }]}
        rows={[
          { __key: "in", metric: "Вхідні", value: num(t.inbound) },
          { __key: "out", metric: "Вихідні", value: num(t.outbound) },
          { __key: "ans", metric: "Відповіли", value: num(t.answered) },
          { __key: "missed", metric: "Пропущені", value: num(t.missed) },
          { __key: "cb", metric: "Пропущені без передзвону", value: num((t.missed ?? 0) - (t.missed_called_back ?? 0)) },
          { __key: "mu", metric: "Унікальні пропущені номери", value: num(t.missed_unique) },
          { __key: "unlinked", metric: "Дзвінки без звʼязку з Lead/Client/Order", value: num(data?.data_quality?.calls_unlinked) },
        ]}
      />
    </ReportPage>
  );
}
