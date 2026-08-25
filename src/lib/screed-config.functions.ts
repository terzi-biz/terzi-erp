import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { screedConfigPayloadSchema } from "./screed-config.schema";
import type { ScreedConfigPayload } from "./screed-grades";

/** Повертає збережену матрицю марок і тарифи, або null якщо ще не налаштовано. */
export const getScreedConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("screed_config")
      .select("payload,updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw new Error("Не вдалося завантажити налаштування стяжки");
    if (!data) return null;
    const parsed = screedConfigPayloadSchema.safeParse(data.payload);
    if (!parsed.success) return null;
    return { payload: parsed.data as ScreedConfigPayload, updatedAt: data.updated_at as string };
  });

export const saveScreedConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => screedConfigPayloadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error("Не вдалося перевірити права доступу");
    const canEdit = (roles ?? []).some((r) => r.role === "admin" || r.role === "director");
    if (!canEdit) throw new Error("Редагування доступне лише адміністраторам");

    const { error } = await context.supabase
      .from("screed_config")
      .upsert({ id: "default", payload: data, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Не вдалося зберегти налаштування стяжки");
    return { ok: true as const };
  });
