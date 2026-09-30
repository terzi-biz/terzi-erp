import { createFileRoute } from "@tanstack/react-router";
import { ControlCenterAdmin } from "@/components/settings/ControlCenterAdmin";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/system")({
  component: SystemPage,
  head: () => ({ meta: [
    { title: "Система і модулі — TERZI ERP" },
    { name: "description", content: "Модулі, кастомні поля та довідники TERZI ERP." },
    { property: "og:title", content: "Система і модулі — TERZI ERP" },
    { property: "og:description", content: "Конфігурація модулів і довідників TERZI ERP без змін коду." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function SystemPage() {
  const { query, canManageSettings } = useSettingsAccess();
  if (query.isPending) return <div className="h-64 rounded-md bg-muted animate-pulse" aria-busy="true" />;
  return <ControlCenterAdmin canEdit={canManageSettings} />;
}
