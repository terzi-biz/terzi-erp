import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Зіставлення відповідальних keyCRM з користувачами ERP.
 * Автоматично — тільки за e-mail або телефоном (у синхронізації).
 * Тут — ручний вибір для тих, кого не вдалося зіставити, плюс дозаповнення
 * лідів і замовлень за збереженим payload keyCRM.
 */

const KEYCRM = "keycrm";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function requireAdmin(supabase: any, userId: string) {
  const [a, d] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "director" }),
  ]);
  if (a.data !== true && d.data !== true) throw new Error("Доступно лише адміністратору або директору");
}

export const listKeycrmManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = await admin();
    const [{ data: links }, { data: profiles }] = await Promise.all([
      db
        .from("integration_sync_links")
        .select("id,external_id,internal_id,payload,integration_id")
        .eq("entity", "managers"),
      db.from("profiles").select("user_id,display_name,email,phone").order("display_name"),
    ]);
    const leadCounts = new Map<string, number>();
    const { data: leads } = await db.from("crm_leads").select("assigned_to").not("assigned_to", "is", null);
    for (const l of leads ?? []) leadCounts.set(l.assigned_to, (leadCounts.get(l.assigned_to) ?? 0) + 1);

    return {
      managers: (links ?? [])
        .map((l: any) => ({
          externalId: String(l.external_id),
          integrationId: l.integration_id as string,
          name: (l.payload?.full_name ?? l.payload?.name ?? `keyCRM #${l.external_id}`) as string,
          email: (l.payload?.email ?? null) as string | null,
          userId: (l.internal_id ?? null) as string | null,
          leads: l.internal_id ? (leadCounts.get(l.internal_id) ?? 0) : 0,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "uk")),
      users: (profiles ?? []).map((p: any) => ({
        id: p.user_id as string,
        name: (p.display_name ?? p.email ?? p.user_id) as string,
        email: p.email as string | null,
      })),
    };
  });

/** Ручне зіставлення + дозаповнення лідів і замовлень цього відповідального. */
export const setKeycrmManagerMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ externalId: z.string().min(1).max(40), userId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = await admin();
    const { error } = await db
      .from("integration_sync_links")
      .update({ internal_id: data.userId, internal_table: data.userId ? "profiles" : null })
      .eq("entity", "managers")
      .eq("external_id", data.externalId);
    if (error) throw new Error(`Не вдалося зберегти зіставлення: ${error.message}`);
    if (!data.userId) return { mapped: false, leads: 0, orders: 0 };

    // Дозаповнення за збереженим payload keyCRM: ліди й замовлення цього відповідального.
    const backfill = async (entity: "lead_cards" | "orders", table: "crm_leads" | "orders", column: string) => {
      const { data: links } = await db
        .from("integration_sync_links")
        .select("internal_id,payload")
        .eq("entity", entity)
        .not("internal_id", "is", null);
      const ids = (links ?? [])
        .filter((l: any) => String(l.payload?.manager_id ?? l.payload?.manager?.id ?? "") === data.externalId)
        .map((l: any) => l.internal_id as string);
      let done = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const part = ids.slice(i, i + 200);
        const { data: upd } = await db
          .from(table)
          .update({ [column]: data.userId })
          .in("id", part)
          .is(column, null)
          .select("id");
        done += (upd ?? []).length;
      }
      return done;
    };

    const leads = await backfill("lead_cards", "crm_leads", "assigned_to");
    const orders = await backfill("orders", "orders", "manager_id");
    return { mapped: true, leads, orders, provider: KEYCRM };
  });
