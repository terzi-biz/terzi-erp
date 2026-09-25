import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { ReservePanel } from "@/components/warehouse/ReservePanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/reserve")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Резерв — Склад TERZI" },
    { name: "description", content: "Резерв під замовлення" },
    { property: "og:title", content: "Резерв — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { reservations, invalidate } = useWarehouseData({ orders: false });
  return (
    <WarehouseShell title="Резерв" subtitle="Резерв матеріалів під замовлення">
      <ReservePanel rows={reservations} onChange={invalidate} />
    </WarehouseShell>
  );
}

