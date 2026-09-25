import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listWarehouses,
  listStockItems,
  listStockDocuments,
  listReservations,
} from "@/lib/warehouse.functions";
import { listOrders } from "@/lib/orders.functions";

/** Спільні запити складу + інвалідація після мутацій. */
export function useWarehouseData(opts?: { orders?: boolean; reservations?: boolean }) {
  const qc = useQueryClient();
  const whFn = useServerFn(listWarehouses);
  const itemsFn = useServerFn(listStockItems);
  const docsFn = useServerFn(listStockDocuments);
  const resFn = useServerFn(listReservations);
  const ordersFn = useServerFn(listOrders);

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => whFn() });
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["stock-items"],
    queryFn: () => itemsFn(),
  });
  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ["stock-docs"],
    queryFn: () => docsFn(),
  });
  const { data: reservations = [] } = useQuery({
    queryKey: ["stock-reservations"],
    queryFn: () => resFn({ data: {} }),
    enabled: opts?.reservations !== false,
  });
  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersFn(),
    enabled: opts?.orders !== false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-items"] });
    qc.invalidateQueries({ queryKey: ["stock-docs"] });
    qc.invalidateQueries({ queryKey: ["stock-reservations"] });
    qc.invalidateQueries({ queryKey: ["warehouses"] });
  };

  return {
    warehouses: warehouses as any[],
    items: items as any[],
    docs: docs as any[],
    reservations: reservations as any[],
    orders: orders as any[],
    isLoading: itemsLoading || docsLoading,
    itemsLoading,
    invalidate,
  };
}
