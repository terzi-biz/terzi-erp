import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportPage, KpiRow, SummaryTable, money } from "@/components/reports/report-shell";
import { useReportPeriod } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/dashboard/control-center";
import { getFinanceOverview, getPlanFact } from "@/lib/finance/finmap.functions";

export const Route = createFileRoute("/reports/finance")({
  head: () => ({ meta: [
    { title: "Звіт «Finance» — TERZI ERP" },
    { name: "description", content: "Канонічні фінанси TERZI: каса, надходження, витрати, прибуток, дебіторка та план/факт по статтях." },
    { property: "og:title", content: "Звіт «Finance» — TERZI ERP" },
    { property: "og:description", content: "Управлінські фінансові підсумки TERZI з даних Finmap." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: FinanceReport,
});

const ARTICLE_LABEL: Record<string, string> = {
  revenue: "Дохід", materials: "Матеріали", labour: "Оплата праці", logistics: "Логістика",
  equipment: "Обладнання", subcontract: "Підряд", marketing: "Маркетинг", administration: "Адміністрація", other: "Інше",
};

function FinanceReport() {
  const { period } = useReportPeriod();
  const overviewFn = useServerFn(getFinanceOverview);
  const planFactFn = useServerFn(getPlanFact);
  const ov = useQuery({ queryKey: ["reports", "finance", period.from, period.to], queryFn: () => overviewFn({ data: period }), staleTime: 60_000, retry: false });
  const pf = useQuery({ queryKey: ["reports", "planfact", period.from, period.to], queryFn: () => planFactFn({ data: period }), staleTime: 60_000, retry: false });

  if (ov.isLoading) return <EmptyState text="Завантаження фінансів…" />;
  if (ov.isError) return <EmptyState text="Фінансові дані доступні лише ролям admin / director / finance" />;
  const d = ov.data as any;

  return (
    <ReportPage title="Finance" description="Факт — операції Finmap; план — знімки кошторисів. Legacy-платежі у KPI не використовуються.">
      <KpiRow items={[
        { label: "Каса на рахунках", value: money(d.cashOnAccounts) },
        { label: "Надходження", value: money(d.income) },
        { label: "Витрати", value: money(d.expense) },
        { label: "Прибуток", value: money(d.grossProfit), note: d.margin != null ? `маржа ${Number(d.margin).toFixed(1)}%` : undefined },
      ]} />
      <KpiRow items={[
        { label: "Дебіторка", value: money(d.receivable), note: `прострочено ${money(d.overdue)}` },
        { label: "Кредиторка", value: money(d.payable) },
        { label: "ФОП нарахований", value: money(d.payrollAccrued) },
        { label: "ФОП фактичний", value: money(d.payrollFact) },
      ]} />
      <h3 className="pt-2 text-sm font-black">План / факт по статтях</h3>
      {pf.isError ? <EmptyState text="План/факт недоступний" /> : (
        <SummaryTable
          columns={[
            { key: "article", label: "Стаття" },
            { key: "plan", label: "План", align: "right" },
            { key: "actual", label: "Факт", align: "right" },
            { key: "variance", label: "Відхилення", align: "right" },
          ]}
          rows={((pf.data ?? []) as any[]).map((r) => ({
            __key: r.article,
            article: ARTICLE_LABEL[r.article] ?? r.article,
            plan: money(r.plan), actual: money(r.actual),
            variance: r.variancePercent == null ? money(r.variance) : `${money(r.variance)} (${r.variancePercent.toFixed(0)}%)`,
          }))}
        />
      )}
    </ReportPage>
  );
}
