import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { WarehouseImportWizard } from "@/components/warehouse/WarehouseImportWizard";

export const Route = createFileRoute("/warehouse/import")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Імпорт — Склад TERZI" },
    { name: "description", content: "Імпорт і перевірка номенклатури" },
    { property: "og:title", content: "Імпорт — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  return (
    <WarehouseShell title="Імпорт" subtitle="Імпорт і черга перевірки">
      <WarehouseImportWizard />
    </WarehouseShell>
  );
}

