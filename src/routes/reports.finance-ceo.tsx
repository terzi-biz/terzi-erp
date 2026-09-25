import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportPage, KpiRow, SummaryTable, PeriodBar, money, useReportPeriod } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/dashboard/control-center";
import { getCeoFinance } from "@/lib/finance/ceo-finance.functions";

export const Route = createFileRoute("/reports/finance-ceo")({
  head: () => ({ meta: [
    { title: "Фінанси компанії — TERZI ERP" },
    { name: "description", content: "Управлінський фінансовий екран CEO: виручка, валовий і операційний прибуток, продажі, виробництво та напрямки." },
    { property: "og:title", content: "Фінанси компанії — TERZI ERP" },
    { property: "og:description", content: "Виручка → валовий прибуток → операційний прибуток по компанії та напрямках TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CeoFinancePage,
});

const ND = "немає даних";
const m = (v: number | null | undefined) => (v == null ? ND : money(v));
const pct = (v: number | null | undefined) => (v == null ? ND : `${v.toFixed(1)}%`);
const n = (v: number | null | undefined) => (v == null ? ND : String(v));

const GROUP_LABEL: Record<string, string> = {
  production: "Виробничий ФОП (у собівартість об'єктів)",
  commercial: "Комерційний ФОП (комерційні витрати)",
  administrative: "Адміністративний ФОП (адмін. витрати)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h3 className="text-sm font-bold uppercase tracking-wider text-primary">{title}</h3>{children}</section>;
}

function CeoFinancePage() {
  const { period } = useReportPeriod();
  const fn = useServerFn(getCeoFinance);
  const q = useQuery({ queryKey: ["reports", "finance-ceo", period.from, period.to], queryFn: () => fn({ data: period }), staleTime: 60_000, retry: false });

  return (
    <ReportPage title="Фінанси компанії" description="Виручка об'єкта = фактичні надходження, прив'язані до замовлення (Finmap). Перекази між рахунками не враховуються. ФОП — нарахування, не виплати.">
      <PeriodBar />
      {q.isLoading ? <EmptyState text="Завантаження…" /> : q.isError ? <EmptyState text="Фінансові дані доступні лише ролям admin / director / finance" /> : (() => {
        const d = q.data!;
        const c = d.company;
        return (
          <div className="space-y-6">
            <Section title="Компанія">
              <KpiRow items={[
                { label: "Виручка", value: m(c.revenue), note: "надходження по об'єктах" },
                { label: "Cash In", value: m(c.cashIn) },
                { label: "Cash Out", value: m(c.cashOut) },
                { label: "Залишок грошей", value: m(c.cashBalance), note: "за рахунками Finmap" },
                { label: "Валовий прибуток", value: m(c.grossProfit) },
                { label: "Валова маржа", value: pct(c.grossMargin) },
                { label: "Операційний прибуток", value: m(c.operatingProfit) },
                { label: "Операційна маржа", value: pct(c.operatingMargin) },
                { label: "Дебіторка", value: m(c.receivable), note: `прострочено ${m(c.receivableOverdue)}` },
                { label: "Комерційні витрати", value: m(c.commercial), note: "маркетинг без прив'язки до об'єкта" },
                { label: "Накладні (overhead)", value: m(c.overhead), note: `у т.ч. ФОП без прив'язки ${m(c.unlinkedPayroll)}` },
                { label: "Податки", value: m(c.taxes) },
              ]} />
            </Section>

            <Section title="Продажі">
              {!d.sales.available ? <EmptyState text="Дані продажів недоступні" /> : (
                <KpiRow items={[
                  { label: "Ліди", value: n(d.sales.leads) },
                  { label: "Заміри виконано", value: n(d.sales.measurements) },
                  { label: "Договори", value: n(d.sales.contracts) },
                  { label: "Сума нових договорів", value: m(d.sales.contractValue) },
                  { label: "CPL", value: m(d.sales.cpl) },
                  { label: "CAC", value: m(d.sales.cac) },
                  { label: "Вартість заміру", value: m(d.sales.costPerMeasurement) },
                  { label: "Конверсія в договір", value: pct(d.sales.conversion) },
                ]} />
              )}
            </Section>

            <Section title="Виробництво">
              <KpiRow items={[
                { label: "Активні об'єкти", value: String(d.production.activeObjects) },
                { label: "Планова виручка", value: m(d.production.planRevenue) },
                { label: "Фактична виручка", value: m(d.production.factRevenue) },
                { label: "Планова собівартість", value: m(d.production.planCost) },
                { label: "Фактична собівартість", value: m(d.production.factCost) },
                { label: "Перевитрата", value: m(d.production.overrun), note: `${d.production.overrunObjects} об'єкт(ів)` },
              ]} />
            </Section>

            <Section title="Напрямки">
              <SummaryTable
                columns={[
                  { key: "label", label: "Напрямок" },
                  { key: "objects", label: "Об'єкти", align: "right" },
                  { key: "revenue", label: "Виручка", align: "right" },
                  { key: "gp", label: "Валовий прибуток", align: "right" },
                  { key: "gm", label: "Маржа", align: "right" },
                  { key: "op", label: "Операційний прибуток", align: "right" },
                ]}
                rows={d.directions.map((r) => ({
                  label: r.label, objects: r.objects,
                  revenue: r.objects ? money(r.revenue) : ND,
                  gp: r.objects ? money(r.grossProfit) : ND,
                  gm: pct(r.grossMargin),
                  op: m(r.operatingProfit),
                }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Операційний прибуток напрямку = валовий прибуток мінус частка комерційних, накладних і податків пропорційно виручці.
                {d.directionNotes.mixed ? ` Об'єктів з кількома послугами (враховано в «Інші роботи»): ${d.directionNotes.mixed}.` : ""}
                {d.directionNotes.unknown ? ` Об'єктів без вказаної послуги: ${d.directionNotes.unknown}.` : ""}
                {" "}Для «Рідка гідроізоляція» в замовленнях ще немає окремої послуги.
              </p>
            </Section>

            <Section title="ФОП за групами">
              {!d.payroll ? <EmptyState text="Немає розрахунків зарплати за місяці періоду" /> : (
                <SummaryTable
                  columns={[
                    { key: "g", label: "Група" },
                    { key: "people", label: "Людей", align: "right" },
                    { key: "base", label: "Фіксована частина", align: "right" },
                    { key: "kpi", label: "KPI", align: "right" },
                    { key: "bonus", label: "Бонуси", align: "right" },
                    { key: "total", label: "Нараховано", align: "right" },
                    { key: "paid", label: "Виплачено", align: "right" },
                  ]}
                  rows={Object.entries(d.payroll).map(([k, g]) => ({
                    g: GROUP_LABEL[k] ?? k, people: g.people, base: money(g.base), kpi: money(g.kpi), bonus: money(g.bonus), total: money(g.total), paid: money(g.paid),
                  }))}
                />
              )}
            </Section>
          </div>
        );
      })()}
    </ReportPage>
  );
}
