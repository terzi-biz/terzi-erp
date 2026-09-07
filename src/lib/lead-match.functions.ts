import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { suggestLeadMatches } from "./lead-match.server";

/** Кандидати на зв'язок ліда з клієнтом (ім'я, телефон, адреса, напрямок). */
export const suggestLeadClientMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
        min_score: z.number().int().min(0).max(100).optional(),
        lead_id: z.string().uuid().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => suggestLeadMatches(context.supabase, data));

/** Підтверджена користувачем прив'язка ліда до клієнта. */
export const linkLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("crm_leads")
      .update({ client_id: data.client_id })
      .eq("id", data.lead_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("crm_lead_activities").insert({
      lead_id: data.lead_id,
      actor_id: context.userId,
      kind: "note",
      body: "Ліда прив'язано до клієнта (підтверджений кандидат автопідбору)",
    });
    return { ok: true };
  });
