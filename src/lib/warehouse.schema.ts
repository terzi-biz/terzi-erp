import { z } from "zod";

/** Схеми валідації для складських серверних функцій (окремий модуль:
 *  module-scope константи всередині *.functions.ts видаляються при
 *  serverfn-split і дають ReferenceError у рантаймі). */

export const uuid = z.string().uuid();
export const nullableUuid = uuid.nullable().optional();

export const lineInput = z.object({
  item_id: uuid,
  qty: z.number(),
  price: z.number().min(0).default(0),
  note: z.string().max(300).optional().nullable(),
});

/** Колонки, доступні для читання всім складським ролям. Собівартість
 *  (avg_cost / total_cost / price) закрита на рівні привілеїв БД і
 *  повертається лише через RPC `stock_costs()` для finance/admin. */
export const ITEM_COLS =
  "id,name,sku,unit,category,module,catalog_item_id,min_qty,archived,created_at,updated_at";
export const DOC_COLS =
  "id,number,doc_type,status,doc_date,warehouse_id,target_warehouse_id,order_id,supplier,note,created_by,posted_at,posted_by,created_at,updated_at";
export const LINE_COLS = "id,document_id,item_id,qty,note,created_at";

type CostRow = { kind: string; id: string; parent_id: string | null; cost: number | null };

export async function loadCosts(supabase: any): Promise<Map<string, number>> {
  const { data } = await supabase.rpc("stock_costs");
  const map = new Map<string, number>();
  for (const r of ((data ?? []) as CostRow[])) map.set(`${r.kind}:${r.id}`, Number(r.cost) || 0);
  return map;
}
