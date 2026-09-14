import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dateRangeSchema } from "./crm-analytics.schema";
import { z } from "zod";
import { callFeed, entityCalls } from "./calls.server";

const entityCallsSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  measurementId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Стрічка дзвінків за період із джерелом, співрозмовником і співробітником. */
export const listCallsFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ context, data }) => callFeed(context.supabase, data));

/** Дзвінки конкретного клієнта, замовлення або заміру — для картки з програвачем. */
export const listEntityCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    entityCallsSchema.parse(d),
  )
  .handler(async ({ context, data }) => entityCalls(context.supabase, data));
