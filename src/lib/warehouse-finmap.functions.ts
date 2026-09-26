import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Склад ↔ Finmap: тільки ЗВ'ЯЗОК приходу з уже наявною витратою з Finmap.
 * У Finmap нічого не надсилається, нові фінансові операції не створюються,
 * курсор синхронізації не змінюється. Доступ — фінансові ролі (RLS is_finance_user).
 */
const ENTITY = "stock_document";

export const getStockDocFinmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ docId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: doc } = await sb
      .from("stock_documents").select("id, doc_type, doc_date, supplier, total_cost").eq("id", data.docId).maybeSingle();
    if (!doc) throw new Error("Документ не знайдено");

    const { data: links, error: le } = await sb
      .from("finance_transaction_links")
      .select("id, transaction_id, amount, status, finance_transactions(id, op_date, amount_uah, amount, comment, kind)")
      .eq("entity_type", ENTITY).eq("entity_id", data.docId);
    if (le) return { allowed: false, doc, links: [], candidates: [] };

    // Кандидати: витрати Finmap ±10 днів від дати документа; сума близька (±2%) або всі, якщо суми немає.
    const d = new Date(doc.doc_date);
    const from = new Date(d.getTime() - 10 * 86400000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const { data: tx } = await sb
      .from("finance_transactions")
      .select("id, op_date, amount_uah, amount, comment, kind")
      .eq("kind", "expense").gte("op_date", from).lte("op_date", to)
      .order("op_date", { ascending: false }).limit(200);
    const total = Number(doc.total_cost) || 0;
    const linked = new Set((links ?? []).map((l: any) => l.transaction_id));
    const candidates = (tx ?? [])
      .filter((t: any) => !linked.has(t.id))
      .map((t: any) => {
        const amt = Math.abs(Number(t.amount_uah ?? t.amount) || 0);
        const diff = total > 0 ? Math.abs(amt - total) / total : null;
        return { ...t, amount_abs: amt, diff };
      })
      .filter((t) => total <= 0 || (t.diff != null && t.diff <= 0.02))
      .slice(0, 20);
    return { allowed: true, doc, links: links ?? [], candidates };
  });

export const linkStockDocFinmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ docId: z.string().uuid(), transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: doc } = await sb.from("stock_documents").select("id, doc_type, status").eq("id", data.docId).maybeSingle();
    if (!doc) throw new Error("Документ не знайдено");
    if (doc.doc_type !== "in") throw new Error("Зв'язок з оплатою можливий лише для приходу");
    const { data: tx } = await sb.from("finance_transactions").select("id, kind").eq("id", data.transactionId).maybeSingle();
    if (!tx || tx.kind !== "expense") throw new Error("Операцію Finmap не знайдено або це не витрата");
    const { error } = await sb.from("finance_transaction_links").insert({
      transaction_id: data.transactionId, entity_type: ENTITY, entity_id: data.docId,
      status: "manual", confidence: 1, created_by: context.userId,
    } as any);
    if (error) throw new Error(error.code === "23505" ? "Вже пов'язано" : "Немає прав або помилка зв'язку");
    return { ok: true };
  });

export const unlinkStockDocFinmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("finance_transaction_links").delete().eq("id", data.linkId).eq("entity_type", ENTITY);
    if (error) throw new Error("Не вдалося прибрати зв'язок");
    return { ok: true };
  });
