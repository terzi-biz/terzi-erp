import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerInput = z.object({ provider: z.string().min(2), origin: z.string().url() });

/** Перелік зовнішніх підключень без жодного токена. */
export const listExternalConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listExternal } = await import("./external/providers.server");
    return listExternal();
  });

/** Початок OAuth: повертає посилання провайдера, state одноразовий. */
export const startExternalOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerInput.parse(d))
  .handler(async ({ data }) => {
    const { buildAuthUrl, callbackUrl } = await import("./external/providers.server");
    const { ensureIntegrationRow } = await import("./external/store.server");
    const { admin } = await import("@/lib/access.server");

    const row = await ensureIntegrationRow(data.provider);
    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const db = await admin();
    const { error } = await db.from("integration_oauth_states").insert({
      integration_id: row.id,
      state,
      redirect_uri: callbackUrl(data.origin),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw new Error(`Не вдалося почати авторизацію: ${error.message}`);
    return { url: buildAuthUrl(data.provider, data.origin, state) };
  });

/** Реальний тест підключення. Статус оновлюється лише за відповіддю API. */
export const testExternalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerInput.parse(d))
  .handler(async ({ data }) => {
    const { testExternal } = await import("./external/providers.server");
    return testExternal(data.provider, data.origin);
  });

/** Відключення: токени видаляються, статус повертається до «потрібна авторизація». */
export const disconnectExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const { ensureIntegrationRow, patchConfig } = await import("./external/store.server");
    const { admin } = await import("@/lib/access.server");
    const row = await ensureIntegrationRow(data.provider);
    const db = await admin();
    await db.from("integration_tokens").delete().eq("integration_id", row.id);
    await db.from("integrations").update({ status: "disconnected", enabled: false, last_test_ok: null }).eq("id", row.id);
    await patchConfig(data.provider, { external_status: "authorization_required", account_label: null });
    return { ok: true };
  });
