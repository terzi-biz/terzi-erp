import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalcNormsEditor } from "@/components/settings/CalcNormsEditor";
import { ScreedGradesAdmin } from "@/components/ScreedGradesAdmin";
import { RoofingNormsAdmin } from "@/components/RoofingNormsAdmin";
import { ConsumablesAdmin } from "@/components/settings/ConsumablesAdmin";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/norms")({
  component: NormsPage,
  head: () => ({ meta: [
    { title: "Норми витрат і коефіцієнти — TERZI ERP" },
    { name: "description", content: "Норми праймеру й газу, марки стяжки, нормативи руберойду, мінімалка бригади, амортизація та спільні параметри кошторисів TERZI." },
    { property: "og:title", content: "Норми витрат і коефіцієнти — TERZI ERP" },
    { property: "og:description", content: "Усі норми калькуляторів TERZI в одному місці — діють одразу для нових кошторисів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

const TABS = [
  { id: "common", label: "Загальні норми" },
  { id: "screed", label: "Стяжка: марки і фібра" },
  { id: "roofing", label: "Руберойд: газ, праймер, нахлести" },
  { id: "consumables", label: "Витратні матеріали і гази" },
] as const;

function NormsPage() {
  const { query, canManageSettings } = useSettingsAccess();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("common");

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
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${tab === t.id ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "common" && <CalcNormsEditor canEdit={canManageSettings} />}
      {tab === "screed" && <ScreedGradesAdmin canEdit={canManageSettings} />}
      {tab === "roofing" && <RoofingNormsAdmin canEdit={canManageSettings} />}
      {tab === "consumables" && <ConsumablesAdmin canEdit={canManageSettings} />}
    </div>
  );
}
