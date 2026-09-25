import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarehouseShell } from "@/components/warehouse/WarehouseShell";
import { MonthlyReportPanel } from "@/components/warehouse/MonthlyReportPanel";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse/monthly")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Звіт за місяці — Склад TERZI" },
    { name: "description", content: "Місячний звіт приходів і видач складу TERZI." },
    { property: "og:title", content: "Звіт за місяці — Склад TERZI" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: WarehouseMonthlyPage,
});

function WarehouseMonthlyPage() {
  const { docs } = useWarehouseData({ orders: false, reservations: false });
  return (
    <WarehouseShell title="Звіт за місяці" subtitle="Прихід / видача / сальдо по календарних місяцях">
      <MonthlyReportPanel docs={docs} />
    </WarehouseShell>
  );
}
