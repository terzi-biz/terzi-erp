import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RECEIPT_DOC_TYPES } from "@/lib/warehouse-calc";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { DocsPanel } from "@/components/warehouse/DocsPanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/receipts")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Приходи — Склад TERZI" },
    { name: "description", content: "Прихід і повернення матеріалів на склад TERZI." },
    { property: "og:title", content: "Приходи — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: WarehouseReceiptsPage,
});

function WarehouseReceiptsPage() {
  const { docs, items, warehouses, orders, invalidate } = useWarehouseData();
  return (
    <WarehouseShell title="Приходи" subtitle="Документи приходу та повернення">
      <DocsPanel
        docs={docs}
        items={items}
        warehouses={warehouses}
        orders={orders}
        onChange={invalidate}
        allowedTypes={RECEIPT_DOC_TYPES}
        defaultDocType="in"
        emptyLabel="Приходів ще немає."
      />
    </WarehouseShell>
  );
}
