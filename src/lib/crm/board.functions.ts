import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Ліди для дошки з іменем клієнта, телефоном і відповідальним менеджером. */
export const listBoardLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { boardLeads } = await import("./board.server");
    return await boardLeads(context.supabase, {});
  });

/** Повна картка ліда: дані, коментарі, задачі та дзвінки. */
export const getLeadCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { leadCard } = await import("./board.server");
    return await leadCard(context.supabase, data.lead_id);
  });

const patchSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    title: z.string().min(1).max(200).optional(),
    stage_id: z.string().uuid().nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    budget: z.number().nonnegative().nullable().optional(),
    area: z.number().nonnegative().nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    source: z.string().max(100).nullable().optional(),
    direction: z.string().max(100).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    phone_e164: z.string().max(30).nullable().optional(),
    next_action_at: z.string().nullable().optional(),
    lost_reason: z.string().max(500).nullable().optional(),
  }).default({}),
  fields: z.record(z.string(), z.any()).optional(),
});

/** Збереження змін із картки ліда. */
export const saveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => patchSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { saveLeadCard } = await import("./board.server");
    return await saveLeadCard(context.supabase, context.userId, data);
  });

/** Довідник співробітників для фільтра «Менеджер» і призначення відповідального. */
export const listCrmStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listStaffDirectory } = await import("../staff.server");
    return await listStaffDirectory();
  });
