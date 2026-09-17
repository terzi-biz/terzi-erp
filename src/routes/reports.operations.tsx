import { createFileRoute } from "@tanstack/react-router";
import { ReportPage, KpiRow, SummaryTable, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";

export const Route = createFileRoute("/reports/operations")({
  head: () => ({ meta: [
    { title: "Звіт «Operations» — TERZI ERP" },
    { name: "description", content: "Операції TERZI: заміри, бронювання бригад, події календаря та проблемні точки періоду." },
    { property: "og:title", content: "Звіт «Operations» — TERZI ERP" },
    { property: "og:description", content: "Замірники, бригади та графік робіт TERZI за період." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: OperationsReport,
});

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function OperationsReport() {
  const { query, data } = useOverview();
  if (query.isLoading) return <EmptyState text="Завантаження операцій…" />;
  if (query.isError) return <EmptyState text="Немає доступу до операційних даних" />;

  const funnel = (data?.funnel ?? []) as any[];
  const scheduled = funnel.find((f) => f.key === "measurements_scheduled")?.count;
  const completed = funnel.find((f) => f.key === "measurements_completed")?.count;

  return (
    <ReportPage title="Operations" description="Заміри, бригади й календар за канонічним графіком робіт.">
      <KpiRow items={[
        { label: "Заміри призначено", value: num(scheduled) },
        { label: "Заміри виконано", value: num(completed) },
        { label: "Бронювання бригад", value: num(data?.operations?.bookings) },
        { label: "Бригад задіяно", value: num(data?.operations?.crews) },
      ]} />
      <SummaryTable
        empty="Подій календаря немає"
        columns={[{ key: "title", label: "Подія" }, { key: "direction", label: "Напрям" }, { key: "start", label: "Початок", align: "right" }]}
        rows={((data?.calendar?.events ?? []) as any[]).map((e) => ({ __key: e.id, title: e.title ?? "Подія", direction: e.direction ?? "—", start: dt(e.starts_at) }))}
      />
      <p className="text-[10px] text-muted-foreground">
        Заміри без замірника: {num(data?.data_quality?.measurements_no_surveyor)} · подій у періоді: {num(data?.calendar?.count)}.
        Завантаження бригад у відсотках недоступне — немає даних про норму часу, показуємо лише фактичні бронювання.
      </p>
    </ReportPage>
  );
}
