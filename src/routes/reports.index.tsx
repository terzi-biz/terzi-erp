import { createFileRoute, Link } from "@tanstack/react-router";
import { ReportPage, KpiRow, SummaryTable, money, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";
import { REPORT_TABS } from "./reports";

export const Route = createFileRoute("/reports/")({
  head: () => ({ meta: [
    { title: "Центр звітів — TERZI ERP" },
    { name: "description", content: "Канонічні звіти TERZI: воронка, задачі, телефонія, Finmap, маркетинг, операції, фінанси та адміністрування." },
    { property: "og:title", content: "Центр звітів — TERZI ERP" },
    { property: "og:description", content: "Єдиний період і канонічні джерела для всіх управлінських звітів TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ReportsOverview,
});

function ReportsOverview() {
  const { query, data } = useOverview();
  if (query.isLoading) return <EmptyState text="Завантаження зведення…" />;
  if (query.isError) return <EmptyState text="Немає доступу до аналітики за цей період" />;

  const k = data?.kpi ?? {};
  return (
    <ReportPage title="Огляд" description="Зведення періоду й перехід до деталізованих звітів.">
      <KpiRow items={[
        { label: "Заявки", value: num(k.leads) },
        { label: "Кваліфіковані", value: num(k.qualified) },
        { label: "Договори", value: num(k.contracts) },
        { label: "Сума договорів", value: money(k.contract_value) },
      ]} />
      <SummaryTable
        columns={[{ key: "report", label: "Звіт" }, { key: "value", label: "Ключовий показник", align: "right" }]}
        rows={[
          { __key: "funnel", report: <Link to="/reports/funnel" className="font-semibold text-primary">Воронка</Link>, value: `${num(k.leads)} → ${num(k.contracts)}` },
          { __key: "tasks", report: <Link to="/reports/tasks" className="font-semibold text-primary">Задачі</Link>, value: `${num(data?.tasks?.period)} / прострочено ${num(data?.tasks?.overdue)}` },
          { __key: "tel", report: <Link to="/reports/telephony" className="font-semibold text-primary">Телефонія</Link>, value: `${num(data?.telephony?.total)} дзвінків` },
          { __key: "mkt", report: <Link to="/reports/marketing" className="font-semibold text-primary">Marketing</Link>, value: money(k.marketing_spend) },
          { __key: "ops", report: <Link to="/reports/operations" className="font-semibold text-primary">Operations</Link>, value: `${num(data?.operations?.bookings)} бронювань` },
          { __key: "fin", report: <Link to="/reports/finance" className="font-semibold text-primary">Finance</Link>, value: "Канонічні дані Finmap" },
        ]}
      />
      <p className="text-[10px] text-muted-foreground">Вкладки: {REPORT_TABS.map((t) => t.label).join(" · ")}</p>
    </ReportPage>
  );
}
