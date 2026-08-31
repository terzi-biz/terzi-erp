import { z } from "zod";

/** Схеми та константи аналітичного шару. Винесено з *.functions.ts,
 *  щоб пережити serverfn-split (у файлі серверних функцій — лише декларації). */

export const rangeSchema = z.object({
  from: z.string().min(10),
  to: z.string().min(10),
});

export const drilldownSchema = rangeSchema.extend({
  metric: z.enum([
    "leads",
    "qualified",
    "measurements",
    "estimates",
    "contracts",
    "orders",
    "payments",
    "calls_missed",
    "dq_leads_no_source",
    "dq_leads_no_manager",
    "dq_calls_unlinked",
    "dq_measurements_no_surveyor",
    "dq_estimates_no_order",
    "dq_orders_no_amount",
  ]),
  limit: z.number().int().min(1).max(500).optional(),
});

export const manualSpendSchema = z.object({
  id: z.string().uuid().optional(),
  spend_date: z.string().min(10),
  source: z.string().min(1),
  campaign: z.string().nullable().optional(),
  amount: z.number().min(0),
  comment: z.string().nullable().optional(),
});

export const sourceMapSchema = z.object({
  raw_source: z.string().min(1),
  normalized: z.string().min(1),
});

export const idSchema = z.object({ id: z.string().uuid() });


export const CONTRACT_STATUSES = ["contract", "awaiting_prepayment", "sold"] as const;

/** Попередній період тієї ж довжини. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const day = 864e5;
  const f = new Date(`${from}T00:00:00Z`).getTime();
  const t = new Date(`${to}T00:00:00Z`).getTime();
  const span = Math.max(day, t - f + day);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(f - span), to: iso(f - day) };
}
