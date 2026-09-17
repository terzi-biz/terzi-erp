import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportPage, KpiRow, SummaryTable, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";
import { getIntegrationReconciliation } from "@/lib/integrations.functions";

export const Route = createFileRoute("/reports/administration")({
  head: () => ({ meta: [
    { title: "Звіт «Administration» — TERZI ERP" },
    { name: "description", content: "Адміністрування TERZI: стан інтеграцій, reconciliation, свіжість даних і проблеми якості даних." },
    { property: "og:title", content: "Звіт «Administration» — TERZI ERP" },
    { property: "og:description", content: "Синхронізації, черга подій, конфлікти та якість даних TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: AdministrationReport,
});

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function AdministrationReport() {
  const { data } = useOverview();
  const load = useServerFn(getIntegrationReconciliation);
  const rec = useQuery({ queryKey: ["reports", "integrations"], queryFn: () => load(), staleTime: 60_000, retry: false });
  const r = rec.data as any;

  const dq = data?.data_quality ?? {};
  return (
    <ReportPage title="Administration" description="Стан синхронізацій, reconciliation і якість даних. Успіх фіксується лише після фактичного завершення операції.">
      <KpiRow items={[
        { label: "Оброблено", value: num(r?.totals?.processed) },
        { label: "Створено", value: num(r?.totals?.created) },
        { label: "Оновлено", value: num(r?.totals?.updated) },
        { label: "Помилки", value: num(r?.totals?.failed), note: r ? `у черзі ${num(r.totals.queued)} · конфліктів ${num(r.totals.conflicts)}` : undefined },
      ]} />
      {rec.isLoading ? <EmptyState text="Завантаження стану інтеграцій…" />
        : rec.isError ? <EmptyState text="Немає доступу до стану інтеграцій" />
        : (
          <SummaryTable
            empty="Підключень ще немає"
            columns={[
              { key: "name", label: "Інтеграція" },
              { key: "state", label: "Стан" },
              { key: "success", label: "Останній успіх", align: "right" },
              { key: "attempt", label: "Остання спроба", align: "right" },
              { key: "ops", label: "Операції", align: "right" },
            ]}
            rows={(r?.integrations ?? []).map((i: any) => ({
              __key: i.id,
              name: i.name,
              state: i.lastError ? "Помилка" : i.needsConnection ? "Потребує підключення" : "Активна",
              success: dt(i.lastSuccessAt), attempt: dt(i.lastAttemptAt),
              ops: `${num(i.processed)} / ${num(i.created)} / ${num(i.updated)} / ${num(i.failed)}`,
            }))}
          />
        )}
      <h3 className="pt-2 text-sm font-black">Якість даних</h3>
      <SummaryTable
        columns={[{ key: "issue", label: "Проблема" }, { key: "count", label: "К-сть", align: "right" }]}
        rows={[
          { __key: "src", issue: "Ліди без джерела", count: num(dq.leads_no_source) },
          { __key: "mgr", issue: "Ліди без менеджера", count: num(dq.leads_no_manager) },
          { __key: "calls", issue: "Дзвінки без звʼязку", count: num(dq.calls_unlinked) },
          { __key: "meas", issue: "Заміри без замірника", count: num(dq.measurements_no_surveyor) },
          { __key: "est", issue: "Кошториси без замовлення", count: num(dq.estimates_no_order) },
          { __key: "qual", issue: "Кваліфікація потребує перевірки", count: num(dq.qualification_needs_review) },
        ]}
      />
      <p className="text-[10px] text-muted-foreground">
        Деталі підключень і повторний запуск — у <Link to="/integrations" className="font-semibold text-primary">розділі інтеграцій</Link>.
      </p>
    </ReportPage>
  );
}
