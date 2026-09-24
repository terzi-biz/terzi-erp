import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ControlCenterAdmin } from "@/components/settings/ControlCenterAdmin";
import { ScreedGradesAdmin } from "@/components/ScreedGradesAdmin";
import { RoofingNormsAdmin } from "@/components/RoofingNormsAdmin";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/system")({
  component: SystemPage,
  head: () => ({ meta: [
    { title: "Система і модулі — TERZI ERP" },
    { name: "description", content: "Модулі, кастомні поля, довідники, марки стяжки та нормативи руберойду TERZI ERP." },
    { property: "og:title", content: "Система і модулі — TERZI ERP" },
    { property: "og:description", content: "Конфігурація модулів і довідників TERZI ERP без змін коду." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

const TABS = [
  { id: "control_center", label: "Модулі, поля, довідники" },
  { id: "grades", label: "Марки стяжки" },
  { id: "roofing_norms", label: "Нормативи руберойду" },
] as const;

function SystemPage() {
  const { query, canManageSettings } = useSettingsAccess();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("control_center");

  if (query.isPending) return <div className="h-64 rounded-md bg-muted animate-pulse" aria-busy="true" />;

  return (
    <div>
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${tab === t.id ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "control_center" && <ControlCenterAdmin canEdit={canManageSettings} />}
      {tab === "grades" && <ScreedGradesAdmin canEdit={canManageSettings} />}
      {tab === "roofing_norms" && <RoofingNormsAdmin canEdit={canManageSettings} />}
    </div>
  );
}
