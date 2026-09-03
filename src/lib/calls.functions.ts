import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dateRangeSchema } from "./crm-analytics.schema";
import { callFeed } from "./calls.server";

/** Стрічка дзвінків за період із джерелом, співрозмовником і співробітником. */
export const listCallsFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ context, data }) => callFeed(context.supabase, data));
