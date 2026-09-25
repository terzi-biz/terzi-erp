import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { RefsPanel } from "@/components/warehouse/RefsPanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/refs")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Склади — Склад TERZI" },
    { name: "description", content: "Довідник складів і нова позиція" },
    { property: "og:title", content: "Склади — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { warehouses, items, invalidate } = useWarehouseData({ orders: false, reservations: false });
  return (
    <WarehouseShell title="Склади" subtitle="Довідник складів і нова позиція номенклатури">
      <RefsPanel warehouses={warehouses} items={items} onChange={invalidate} />
    </WarehouseShell>
  );
}

