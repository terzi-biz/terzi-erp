import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const estimateInput = z.object({
  id: z.string().uuid().optional(),
  number: z.string().min(1).max(100),
  module: z.enum(["screed", "roofing", "insulation", "demolition"]),
  status: z.enum(["draft", "sent", "approved", "inWork", "done", "refused", "archived"]).default("draft"),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(200).optional().nullable(),
  client_phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  manager: z.string().max(200).optional().nullable(),
  area: z.number().nonnegative().optional().nullable(),
  thickness_cm: z.number().nonnegative().optional().nullable(),
  total_client: z.number().nonnegative().default(0),
  total_cost: z.number().nonnegative().default(0),
  gross_profit: z.number().default(0),
  margin_percent: z.number().default(0),
  payload: z.any().default({}),
});

export const listEstimates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("estimates").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => estimateInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_id: context.userId };
    const { data: out, error } = data.id
      ? await context.supabase.from("estimates").update(row).eq("id", data.id).select().single()
      : await context.supabase.from("estimates").insert(row).select().single();
    if (error) throw error;
    return out;
  });

export const deleteEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("estimates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
