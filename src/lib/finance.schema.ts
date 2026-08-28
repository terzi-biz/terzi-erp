/** Спільні zod-схеми фінансових server functions (окремо від *.functions.ts,
 *  щоб serverfn-split не видаляв runtime-сусідів у модулі з createServerFn). */
import { z } from "zod";

export const uuid = z.string().uuid();
export const nullableUuid = uuid.nullable().optional();

export const accountInput = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(200),
  kind: z.enum(["cash", "bank", "fop"]).default("bank"),
  currency: z.string().max(10).default("UAH"),
  opening_balance: z.number().default(0),
  archived: z.boolean().optional(),
});

export const invoiceInput = z.object({
  id: uuid.optional(),
  order_id: nullableUuid,
  client_id: nullableUuid,
  estimate_id: nullableUuid,
  kind: z.enum(["advance", "stage", "final", "other"]).default("stage"),
  status: z.enum(["draft", "issued", "partial", "paid", "overdue", "cancelled"]).default("draft"),
  issue_date: z.string().min(4),
  due_date: z.string().min(4).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  lines: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        unit: z.string().max(30).default("шт"),
        qty: z.number(),
        price: z.number(),
      }),
    )
    .default([]),
});

export const paymentInput = z.object({
  id: uuid.optional(),
  invoice_id: nullableUuid,
  order_id: nullableUuid,
  account_id: nullableUuid,
  direction: z.enum(["in", "out"]).default("in"),
  amount: z.number().min(0),
  paid_at: z.string().min(4),
  method: z.string().max(60).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const expenseInput = z.object({
  id: uuid.optional(),
  order_id: nullableUuid,
  account_id: nullableUuid,
  category: z.string().max(60).default("other"),
  name: z.string().min(1).max(300),
  amount: z.number().min(0),
  spent_at: z.string().min(4),
  supplier: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const idInput = z.object({ id: uuid });
export const orderIdInput = z.object({ order_id: uuid });
