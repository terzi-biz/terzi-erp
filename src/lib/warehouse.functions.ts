import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uuid, nullableUuid, lineInput } from "@/lib/warehouse.schema";

/** Склад: довідники, залишки, документи руху, резерв, інвентаризація. */

export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("warehouses").select("*").order("is_default", { ascending: false }).order("name");
    if (error) { console.error("listWarehouses", error); throw new Error("Не вдалося завантажити склади"); }
    return data ?? [];
  });

export const saveWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(200),
    kind: z.string().max(50).default("main"),
    address: z.string().max(400).optional().nullable(),
    is_default: z.boolean().optional(),
    archived: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("warehouses").update(rest).eq("id", id).select().single()
      : await context.supabase.from("warehouses").insert(rest).select().single();
    if (error) { console.error("saveWarehouse", error); throw new Error("Не вдалося зберегти склад"); }
    return out;
  });

/** Колонки собівартості (avg_cost / total_cost / price) закриті на рівні
 *  привілеїв БД; їх повертає лише RPC `stock_costs()` для ролей finance/admin. */
const ITEM_COLS = "id,name,sku,unit,category,module,catalog_item_id,min_qty,archived,created_at,updated_at";
const DOC_COLS = "id,number,doc_type,status,doc_date,warehouse_id,target_warehouse_id,order_id,supplier,note,created_by,posted_at,posted_by,created_at,updated_at";
const LINE_COLS = "id,document_id,item_id,qty,note,created_at";

type CostRow = { kind: string; id: string; parent_id: string | null; cost: number | null };

async function loadCosts(supabase: any) {
  const { data } = await supabase.rpc("stock_costs");
  const map = new Map<string, number>();
  for (const r of (data ?? []) as CostRow[]) map.set(`${r.kind}:${r.id}`, Number(r.cost) || 0);
  return map;
}

export const listStockItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: items, error }, { data: balances }, costs] = await Promise.all([
      context.supabase.from("stock_items").select(ITEM_COLS).eq("archived", false).order("name"),
      context.supabase.from("stock_balances").select("*"),
      loadCosts(context.supabase),
    ]);
    if (error) { console.error("listStockItems", error); throw new Error("Не вдалося завантажити номенклатуру"); }
    const byItem = new Map<string, { qty: number; reserved: number }>();
    for (const b of (balances ?? []) as any[]) {
      const cur = byItem.get(b.item_id) ?? { qty: 0, reserved: 0 };
      cur.qty += Number(b.qty) || 0;
      cur.reserved += Number(b.reserved_qty) || 0;
      byItem.set(b.item_id, cur);
    }
    return (items ?? []).map((i: any) => ({
      ...i,
      avg_cost: costs.get(`item:${i.id}`) ?? null,
      qty: byItem.get(i.id)?.qty ?? 0,
      reserved_qty: byItem.get(i.id)?.reserved ?? 0,
      balances: ((balances ?? []) as any[]).filter((b) => b.item_id === i.id),
    }));
  });

export const saveStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(300),
    sku: z.string().max(100).optional().nullable(),
    unit: z.string().max(30).default("шт"),
    category: z.string().max(120).optional().nullable(),
    module: z.string().max(50).optional().nullable(),
    catalog_item_id: nullableUuid,
    min_qty: z.number().min(0).default(0),
    archived: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: out, error } = id
      ? await context.supabase.from("stock_items").update(rest).eq("id", id).select(ITEM_COLS).single()
      : await context.supabase.from("stock_items").insert(rest).select(ITEM_COLS).single();
    if (error) { console.error("saveStockItem", error); throw new Error("Не вдалося зберегти позицію"); }
    return out;
  });

export const listStockDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data, error }, costs] = await Promise.all([
      context.supabase
        .from("stock_documents")
        .select(`${DOC_COLS}, lines:stock_document_lines(${LINE_COLS}), warehouse:warehouse_id(name), order:order_id(number,name)`)
        .order("created_at", { ascending: false })
        .limit(300),
      loadCosts(context.supabase),
    ]);
    if (error) { console.error("listStockDocuments", error); throw new Error("Не вдалося завантажити документи"); }
    return (data ?? []).map((d: any) => ({
      ...d,
      total_cost: costs.get(`document:${d.id}`) ?? null,
      lines: (d.lines ?? []).map((l: any) => ({ ...l, price: costs.get(`line:${l.id}`) ?? null })),
    }));
  });

export const saveStockDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    doc_type: z.enum(["in", "out", "transfer", "writeoff", "return"]),
    doc_date: z.string().min(4),
    warehouse_id: uuid,
    target_warehouse_id: nullableUuid,
    order_id: nullableUuid,
    supplier: z.string().max(200).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    lines: z.array(lineInput).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, lines, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: doc, error } = id
      ? await context.supabase.from("stock_documents").update(payload).eq("id", id).select(DOC_COLS).single()
      : await context.supabase.from("stock_documents").insert(payload).select(DOC_COLS).single();
    if (error) { console.error("saveStockDocument", error); throw new Error("Не вдалося зберегти документ"); }

    await context.supabase.from("stock_document_lines").delete().eq("document_id", doc.id);
    if (lines.length) {
      const { error: le } = await context.supabase.from("stock_document_lines")
        .insert(lines.map((l) => ({ ...l, document_id: doc.id })));
      if (le) { console.error("saveStockDocumentLines", le); throw new Error("Не вдалося зберегти позиції документа"); }
    }
    return doc;
  });


export const postStockDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("post_stock_document", { _doc_id: data.id });
    if (error) { console.error("postStockDocument", error); throw new Error(error.message || "Не вдалося провести документ"); }
    return res;
  });

export const cancelStockDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cancel_stock_document", { _doc_id: data.id });
    if (error) { console.error("cancelStockDocument", error); throw new Error(error.message || "Не вдалося скасувати документ"); }
    return res;
  });

export const listReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: uuid.optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stock_reservations")
      .select("*, item:item_id(name,unit), order:order_id(number,name), warehouse:warehouse_id(name)")
      .order("created_at", { ascending: false });
    if (data.order_id) q = q.eq("order_id", data.order_id);
    const { data: rows, error } = await q;
    if (error) { console.error("listReservations", error); throw new Error("Не вдалося завантажити резерв"); }
    return rows ?? [];
  });

export const saveReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    order_id: uuid,
    warehouse_id: uuid,
    item_id: uuid,
    qty: z.number().min(0),
    note: z.string().max(300).optional().nullable(),
    status: z.enum(["active", "issued", "cancelled"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: out, error } = id
      ? await context.supabase.from("stock_reservations").update(payload).eq("id", id).select().single()
      : await context.supabase.from("stock_reservations").insert(payload).select().single();
    if (error) { console.error("saveReservation", error); throw new Error("Не вдалося зберегти резерв"); }
    return out;
  });

export const deleteReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stock_reservations").delete().eq("id", data.id);
    if (error) { console.error("deleteReservation", error); throw new Error("Не вдалося зняти резерв"); }
    return { ok: true };
  });

export const listStockCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_counts")
      .select("*, lines:stock_count_lines(*), warehouse:warehouse_id(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) { console.error("listStockCounts", error); throw new Error("Не вдалося завантажити інвентаризації"); }
    return data ?? [];
  });

export const saveStockCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    warehouse_id: uuid,
    note: z.string().max(1000).optional().nullable(),
    lines: z.array(z.object({
      item_id: uuid,
      expected_qty: z.number(),
      actual_qty: z.number(),
    })).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, lines, ...rest } = data;
    const payload: any = { ...rest };
    if (!id) payload.created_by = context.userId;
    const { data: act, error } = id
      ? await context.supabase.from("stock_counts").update(payload).eq("id", id).select().single()
      : await context.supabase.from("stock_counts").insert(payload).select().single();
    if (error) { console.error("saveStockCount", error); throw new Error("Не вдалося зберегти акт"); }
    await context.supabase.from("stock_count_lines").delete().eq("count_id", act.id);
    if (lines.length) {
      await context.supabase.from("stock_count_lines").insert(lines.map((l) => ({ ...l, count_id: act.id })));
    }
    return act;
  });

export const postStockCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("post_stock_count", { _count_id: data.id });
    if (error) { console.error("postStockCount", error); throw new Error(error.message || "Не вдалося затвердити інвентаризацію"); }
    return res;
  });
