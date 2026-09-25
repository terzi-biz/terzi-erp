import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ISSUE_DOC_TYPES } from "@/lib/warehouse-calc";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { DocsPanel } from "@/components/warehouse/DocsPanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/issues")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Видачі — Склад TERZI" },
    { name: "description", content: "Видача та списання матеріалів зі складу TERZI." },
    { property: "og:title", content: "Видачі — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: WarehouseIssuesPage,
});

function WarehouseIssuesPage() {
  const { docs, items, warehouses, orders, invalidate } = useWarehouseData();
  return (
    <WarehouseShell title="Видачі" subtitle="Документи видачі на замовлення та списання">
      <DocsPanel
        docs={docs}
        items={items}
        warehouses={warehouses}
        orders={orders}
        onChange={invalidate}
        allowedTypes={ISSUE_DOC_TYPES}
        defaultDocType="out"
        emptyLabel="Видач ще немає."
      />
    </WarehouseShell>
  );
}
