import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportPage, KpiRow, SummaryTable, money, num, useReportPeriod } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/dashboard/control-center";
import { getFinanceReconciliation } from "@/lib/finance/finmap.functions";

export const Route = createFileRoute("/reports/finmap")({
  head: () => ({ meta: [
    { title: "Звіт «Finmap» — TERZI ERP" },
    { name: "description", content: "Звірка Finmap з ERP: операції без замовлення, клієнта чи статті, немапнуті проєкти й контрагенти." },
    { property: "og:title", content: "Звіт «Finmap» — TERZI ERP" },
    { property: "og:description", content: "Якість зіставлення операцій Finmap із сутностями TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: FinmapReport,
});

function FinmapReport() {
  const { period } = useReportPeriod();
  const load = useServerFn(getFinanceReconciliation);
  const q = useQuery({ queryKey: ["reports", "finmap", period.from, period.to], queryFn: () => load({ data: period }), staleTime: 60_000, retry: false });

  if (q.isLoading) return <EmptyState text="Завантаження звірки Finmap…" />;
  if (q.isError) return <EmptyState text="Звірка Finmap доступна лише ролям admin / director / finance" />;
  const d = q.data as any;

  return (
    <ReportPage title="Finmap" description="Фактичні гроші з Finmap і те, що заважає їм зійтися з ERP.">
      <KpiRow items={[
        { label: "Операцій", value: num(d.transactions.total) },
        { label: "Без замовлення", value: num(d.transactions.noOrder.count), note: money(d.transactions.noOrder.amount) },
        { label: "Без клієнта", value: num(d.transactions.noClient.count), note: money(d.transactions.noClient.amount) },
        { label: "Без статті", value: num(d.transactions.noCategory.count), note: money(d.transactions.noCategory.amount) },
      ]} />
      <h3 className="pt-2 text-sm font-black">Найбільші операції без замовлення</h3>
      <SummaryTable
        empty="Усі операції зіставлені із замовленнями"
        columns={[
          { key: "date", label: "Дата" },
          { key: "cp", label: "Контрагент" },
          { key: "cat", label: "Стаття" },
          { key: "amount", label: "Сума", align: "right" },
        ]}
        rows={(d.transactions.top ?? []).map((t: any) => ({ __key: t.id, date: t.op_date, cp: t.counterparty ?? "—", cat: t.category ?? "—", amount: money(t.amount) }))}
      />
      <h3 className="pt-2 text-sm font-black">Проєкти та контрагенти без звʼязку</h3>
      <SummaryTable
        columns={[{ key: "entity", label: "Сутність" }, { key: "total", label: "Усього", align: "right" }, { key: "issue", label: "Потребує звірки", align: "right" }]}
        rows={[
          { __key: "p", entity: "Проєкти Finmap", total: num(d.projects.total), issue: num(d.projects.noOrder) },
          { __key: "c", entity: "Контрагенти", total: num(d.counterparties.total), issue: num(d.counterparties.unmapped) },
          { __key: "cat", entity: "Статті", total: num(d.categories.total), issue: num(d.categories.unclassified) },
        ]}
      />
    </ReportPage>
  );
}
