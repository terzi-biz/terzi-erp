import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["lead", "active", "done", "archived"]).default("lead"),
});

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_id: context.userId };
    const { data: out, error } = data.id
      ? await context.supabase.from("clients").update(row).eq("id", data.id).select().single()
      : await context.supabase.from("clients").insert(row).select().single();
    if (error) throw error;
    return out;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
