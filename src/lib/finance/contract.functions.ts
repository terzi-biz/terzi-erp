/**
 * Договір, графік платежів і дебіторка по замовленню.
 *
 * Редаговане вручну: сума договору, затверджені додаткові роботи, графік
 * платежів, фінансова примітка. Read-only з Finmap: фактична сума, дата,
 * рахунок і залишок. Кожна ручна зміна пишеться в audit_logs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeReceivables, type StageInput } from "./core";
import { readManagement } from "@/lib/order-management";

const uuid = z.string().uuid();

async function assertFinance(context: any) {
  const { data, error } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  if (error) { console.error("is_finance_user", error); throw new Error("Не вдалося перевірити права доступу"); }
  if (data !== true) throw new Error("Немає доступу до фінансових даних");
  return true;
}

async function audit(context: any, payload: Record<string, unknown>) {
  const { error } = await context.supabase.from("audit_logs").insert({
    actor_id: context.userId, module: "finance", is_critical: true, ...payload,
  });
  if (error) console.error("audit_logs", error);
}

const num = (v: unknown) => Number(v) || 0;

/** Факт по замовленню з Finmap + договір + графік → дебіторка. */
async function loadReceivables(context: any, orderId: string) {
  const [{ data: order }, { data: stages }, { data: tx }] = await Promise.all([
    context.supabase.from("orders").select("id,number,name,client_id,management_data").eq("id", orderId).maybeSingle(),
    context.supabase.from("order_payment_stages").select("*").eq("order_id", orderId).order("position"),
    context.supabase
      .from("finance_transactions")
      .select("id,kind,amount,amount_uah,op_date,counterparty:counterparty_id(client_id,name)")
      .eq("order_id", orderId),
  ]);
  if (!order) throw new Error("Замовлення не знайдено");

  const m = readManagement(order);
  const rows = (tx ?? []) as any[];
  const receipts = rows.filter((t) => t.kind === "income").reduce((s, t) => s + num(t.amount_uah ?? t.amount), 0);
  // Повернення клієнту — витрата на контрагента, зіставленого з клієнтом замовлення.
  const refunds = rows
    .filter((t) => t.kind === "expense" && order.client_id && t.counterparty?.client_id === order.client_id)
    .reduce((s, t) => s + num(t.amount_uah ?? t.amount), 0);

  const result = computeReceivables({
    contractAmount: m.contract_total ?? null,
    approvedExtras: m.approved_extras ?? null,
    receipts,
    refunds,
    today: new Date().toISOString().slice(0, 10),
    stages: ((stages ?? []) as any[]).map<StageInput>((s) => ({
      id: s.id,
      name: s.name,
      amount: s.amount,
      percent: s.percent,
      planned_date: s.planned_date,
      due_date: s.due_date,
      trigger: s.trigger_note,
      status: s.status,
      notes: s.notes,
    })),
  });

  return {
    order_id: orderId,
    contract: {
      contract_total: m.contract_total ?? null,
      approved_extras: m.approved_extras ?? null,
      finance_note: m.finance_note ?? null,
    },
    ...result,
    lastReceipt: rows.filter((t) => t.kind === "income").map((t) => t.op_date).sort().pop() ?? null,
  };
}

export const getOrderReceivables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    return loadReceivables(context, data.order_id);
  });

export const saveOrderContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      order_id: uuid,
      contract_total: z.number().finite().nullable().optional(),
      approved_extras: z.number().finite().nullable().optional(),
      finance_note: z.string().max(4000).nullable().optional(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: order } = await context.supabase
      .from("orders").select("id,number,management_data").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Замовлення не знайдено");

    const before = readManagement(order);
    const patch: Record<string, unknown> = { ...(order.management_data as any ?? {}) };
    if (data.contract_total !== undefined) patch.contract_total = data.contract_total;
    if (data.approved_extras !== undefined) patch.approved_extras = data.approved_extras;
    if (data.finance_note !== undefined) patch.finance_note = data.finance_note;

    const { error } = await context.supabase.from("orders").update({ management_data: patch }).eq("id", data.order_id);
    if (error) { console.error("saveOrderContract", error); throw new Error("Не вдалося зберегти дані договору"); }

    await audit(context, {
      action: "contract.update", entity_type: "order", entity_id: data.order_id,
      entity_label: order.number ?? null, order_id: data.order_id,
      old_value: { contract_total: before.contract_total ?? null, approved_extras: before.approved_extras ?? null },
      new_value: { contract_total: patch.contract_total ?? null, approved_extras: patch.approved_extras ?? null },
      financial_impact: num(patch.contract_total) - num(before.contract_total),
      reason: data.reason ?? null,
    });

    return loadReceivables(context, data.order_id);
  });

const stageSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(200),
  amount: z.number().finite().nullable().optional(),
  percent: z.number().finite().min(0).max(100).nullable().optional(),
  planned_date: z.string().min(4).nullable().optional(),
  due_date: z.string().min(4).nullable().optional(),
  trigger_note: z.string().max(300).nullable().optional(),
  status: z.enum(["planned", "due", "partially_paid", "paid", "overdue", "cancelled"]).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Повна заміна графіка платежів замовлення (етапи задаються оператором). */
export const savePaymentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ order_id: uuid, stages: z.array(stageSchema).max(50), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: before } = await context.supabase
      .from("order_payment_stages").select("*").eq("order_id", data.order_id).order("position");

    const { error: delErr } = await context.supabase
      .from("order_payment_stages").delete().eq("order_id", data.order_id);
    if (delErr) { console.error("savePaymentSchedule.delete", delErr); throw new Error("Не вдалося оновити графік платежів"); }

    if (data.stages.length) {
      const rows = data.stages.map((s, i) => ({
        order_id: data.order_id,
        position: i,
        name: s.name,
        amount: s.amount ?? null,
        percent: s.percent ?? null,
        planned_date: s.planned_date || null,
        due_date: s.due_date || null,
        trigger_note: s.trigger_note ?? null,
        // Статуси planned/due/overdue/paid рахуються з фактів; зберігаємо лише керовані оператором.
        status: s.status === "cancelled" ? "cancelled" : "planned",
        notes: s.notes ?? null,
        created_by: context.userId,
      }));
      const { error } = await context.supabase.from("order_payment_stages").insert(rows);
      if (error) { console.error("savePaymentSchedule.insert", error); throw new Error("Не вдалося зберегти графік платежів"); }
    }

    await audit(context, {
      action: "payment_schedule.update", entity_type: "order", entity_id: data.order_id,
      order_id: data.order_id,
      old_value: { stages: before ?? [] }, new_value: { stages: data.stages },
      reason: data.reason ?? null,
    });

    return loadReceivables(context, data.order_id);
  });
