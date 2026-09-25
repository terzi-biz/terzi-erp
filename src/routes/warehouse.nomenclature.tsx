import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { NomenclaturePanel } from "@/components/warehouse/NomenclaturePanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/nomenclature")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Номенклатура — Склад TERZI" },
    { name: "description", content: "Сімейства і варіанти матеріалів" },
    { property: "og:title", content: "Номенклатура — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { items, itemsLoading } = useWarehouseData({ orders: false, reservations: false });
  return (
    <WarehouseShell title="Номенклатура" subtitle="Сімейства і варіанти">
      <NomenclaturePanel items={items} isLoading={itemsLoading} />
    </WarehouseShell>
  );
}

