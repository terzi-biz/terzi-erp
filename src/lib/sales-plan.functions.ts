import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listPlanOp,
  setSalesPlanUnlockOp,
  upsertCompanyTargetOp,
  upsertManagerTargetsOp,
} from "./sales-plan.server";

const monthSchema = z.object({ month: z.string().min(7) });

export const listSalesPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthSchema.parse(d))
  .handler(async ({ context, data }) => listPlanOp(context.supabase, context.userId, data.month));

export const upsertCompanySalesTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.string().min(7),
        company_target: z.number().min(0),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => upsertCompanyTargetOp(context.supabase, context.userId, data));

export const upsertManagerSalesTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.string().min(7),
        lines: z.array(z.object({ user_id: z.string().uuid(), target: z.number().min(0) })).max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => upsertManagerTargetsOp(context.supabase, context.userId, data));

export const setSalesPlanUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month: z.string().min(7), unlocked: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => setSalesPlanUnlockOp(context.supabase, context.userId, data));
