import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportPage, KpiRow, SummaryTable, num } from "@/components/reports/report-shell";
import { useOverview } from "@/components/reports/use-reports";
import { EmptyState } from "@/components/dashboard/control-center";
import { listTasks } from "@/lib/crm.functions";

export const Route = createFileRoute("/reports/tasks")({
  head: () => ({ meta: [
    { title: "Звіт «Задачі» — TERZI ERP" },
    { name: "description", content: "Задачі CRM TERZI: відкриті, прострочені, виконані та розподіл за типом і пріоритетом." },
    { property: "og:title", content: "Звіт «Задачі» — TERZI ERP" },
    { property: "og:description", content: "Контроль виконання задач менеджерів TERZI за період." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: TasksReport,
});

const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—");

function TasksReport() {
  const { period, query, data } = useOverview();
  const load = useServerFn(listTasks);
  const tasks = useQuery({ queryKey: ["reports", "tasks"], queryFn: () => load(), staleTime: 60_000, retry: false });

  if (query.isLoading || tasks.isLoading) return <EmptyState text="Завантаження задач…" />;
  if (query.isError || tasks.isError) return <EmptyState text="Немає доступу до задач" />;

  const rows = ((tasks.data ?? []) as any[]).filter((t) => {
    const d = (t.due_at ?? t.created_at ?? "").slice(0, 10);
    return d >= period.from && d <= period.to;
  });
  const today = new Date().toISOString().slice(0, 10);
  const byKind = new Map<string, number>();
  for (const t of rows) byKind.set(t.kind ?? "—", (byKind.get(t.kind ?? "—") ?? 0) + 1);

  return (
    <ReportPage title="Задачі" description="Задачі періоду за строком виконання; прострочені — відкриті задачі з минулим строком.">
      <KpiRow items={[
        { label: "Задач періоду", value: num(data?.tasks?.period) },
        { label: "Прострочені", value: num(data?.tasks?.overdue) },
        { label: "Виконані", value: num(rows.filter((t) => t.status === "done").length) },
        { label: "Відкриті", value: num(rows.filter((t) => t.status === "open").length) },
      ]} />
      <SummaryTable
        columns={[{ key: "kind", label: "Тип" }, { key: "count", label: "К-сть", align: "right" }]}
        rows={[...byKind.entries()].map(([kind, count]) => ({ __key: kind, kind, count: num(count) }))}
      />
      <h3 className="pt-2 text-sm font-black">Прострочені задачі</h3>
      <SummaryTable
        empty="Прострочених задач немає"
        columns={[{ key: "title", label: "Задача" }, { key: "kind", label: "Тип" }, { key: "due", label: "Строк", align: "right" }]}
        rows={rows.filter((t) => t.status === "open" && (t.due_at ?? "").slice(0, 10) < today).slice(0, 50)
          .map((t) => ({ __key: t.id, title: t.title, kind: t.kind ?? "—", due: dt(t.due_at) }))}
      />
    </ReportPage>
  );
}
