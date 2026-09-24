import { createFileRoute } from "@tanstack/react-router";
import { CalcNormsEditor } from "@/components/settings/CalcNormsEditor";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/norms")({
  component: NormsPage,
  head: () => ({ meta: [
    { title: "Норми витрат і коефіцієнти — TERZI ERP" },
    { name: "description", content: "Норми праймеру й газу, мінімалка бригади, коефіцієнти, амортизація та спільні параметри кошторисів TERZI." },
    { property: "og:title", content: "Норми витрат і коефіцієнти — TERZI ERP" },
    { property: "og:description", content: "Редагування company-wide норм, що миттєво застосовуються до нових кошторисів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function NormsPage() {
  const { query, canManageSettings } = useSettingsAccess();

  if (query.isPending) return <div className="h-64 rounded-md bg-muted animate-pulse" aria-busy="true" />;
  if (query.isError) {
    return (
      <div className="panel p-5 border-destructive">
        <h2 className="text-lg font-black">Не вдалося перевірити права доступу</h2>
        <p className="text-sm text-muted-foreground mt-1">{query.error instanceof Error ? query.error.message : "Спробуйте ще раз."}</p>
        <button onClick={() => query.refetch()} className="mt-3 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold">Повторити</button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Норми діють для всієї компанії. Збережені значення застосовуються до нових розрахунків і кошторисів; збережені раніше кошториси не перераховуються.
      </p>
      <CalcNormsEditor canEdit={canManageSettings} />
    </div>
  );
}
