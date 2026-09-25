import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatUah } from "@/lib/screed-calc";
import { isBelowMin } from "@/lib/warehouse-calc";
import { WarehouseShell, WarehouseKpi } from "@/components/warehouse/WarehouseShell";
import { StockTable } from "@/components/warehouse/StockTable";
import { useWarehouseData } from "@/components/warehouse/useWarehouseData";

export const Route = createFileRoute("/warehouse")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Запаси — Склад TERZI" },
    { name: "description", content: "Залишки матеріалів на складі TERZI: кількості, резерв, собівартість." },
    { property: "og:title", content: "Запаси — Склад TERZI" },
    { property: "og:description", content: "Залишки, резерв і вартість запасів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: WarehouseStockPage,
});

function WarehouseStockPage() {
  const { items, docs, itemsLoading } = useWarehouseData({ orders: false, reservations: false });
  const kpi = useMemo(() => {
    const priced = items.filter((i) => i.avg_cost != null);
    return {
      positions: items.length,
      value: priced.reduce((s, i) => s + (Number(i.qty) || 0) * Number(i.avg_cost), 0),
      pricedCount: priced.length,
      openDocs: docs.filter((d) => d.status === "draft").length,
      low: items.filter((i) => isBelowMin(Number(i.qty) || 0, Number(i.min_qty) || 0)).length,
    };
  }, [items, docs]);

  return (
    <WarehouseShell title="Запаси" subtitle="Залишки номенклатури, резерв і вартість">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <WarehouseKpi label="Позицій" value={String(kpi.positions)} />
          <WarehouseKpi
            label="Вартість запасів"
            value={kpi.pricedCount ? formatUah(kpi.value) : "немає даних"}
            hint={
              kpi.pricedCount < kpi.positions
                ? `покриття: ${kpi.pricedCount} з ${kpi.positions}`
                : undefined
            }
          />
          <WarehouseKpi label="Відкриті документи" value={String(kpi.openDocs)} />
          <WarehouseKpi
            label="Нижче мінімуму"
            value={String(kpi.low)}
            tone={kpi.low ? "warn" : "default"}
          />
        </div>
        <StockTable items={items} isLoading={itemsLoading} />
      </div>
    </WarehouseShell>
  );
}
