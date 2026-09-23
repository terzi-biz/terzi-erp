import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { roofingConfigPayloadSchema, type RoofingConfigPayload } from "./roofing/norms";

/** Повертає збережені нормативи покрівлі або null, якщо ще не налаштовано. */
export const getRoofingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("roofing_config")
      .select("payload,updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw new Error("Не вдалося завантажити нормативи покрівлі");
    if (!data) return null;
    const parsed = roofingConfigPayloadSchema.safeParse(data.payload);
    if (!parsed.success) return null;
    return { payload: parsed.data as RoofingConfigPayload, updatedAt: data.updated_at as string };
  });

export const saveRoofingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roofingConfigPayloadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireConfigManager } = await import("@/lib/config-kernel/config.server");
    await requireConfigManager(context.userId);
    // Права перевірено канонічно вище; запис service role, щоб override працював незалежно від legacy RLS.
    const { admin } = await import("@/lib/access.server");
    const db = (await admin()) as any;

    const { error } = await db
      .from("roofing_config")
      .upsert({ id: "default", payload: data, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Не вдалося зберегти нормативи покрівлі");
    return { ok: true as const };
  });
