import { createFileRoute } from "@tanstack/react-router";

/** Повернення провайдера після згоди користувача. State одноразовий. */
export const Route = createFileRoute("/api/public/integrations/external/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
        const state = url.searchParams.get("state");
        const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (denied) return redirectTo(url.origin, `Авторизацію скасовано: ${denied}`);
        if (!code || !state) return redirectTo(url.origin, "Відсутній код або state");

        const { admin } = await import("@/lib/access.server");
        const db = await admin();
        const { data: st } = await db.from("integration_oauth_states").select("*").eq("state", state).maybeSingle();
        const row = st as Record<string, any> | null;
        if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
          return redirectTo(url.origin, "Термін авторизації минув, спробуйте ще раз");
        }
        await db.from("integration_oauth_states").update({ used_at: new Date().toISOString() }).eq("state", state);

        const { data: integration } = await db.from("integrations").select("provider_key").eq("id", row.integration_id).maybeSingle();
        const provider = (integration as Record<string, any> | null)?.provider_key as string | undefined;
        if (!provider) return redirectTo(url.origin, "Підключення не знайдено");

        try {
          const { exchangeCode, testExternal } = await import("@/lib/integrations/external/providers.server");
          await exchangeCode(provider, code, url.origin);
          await testExternal(provider, url.origin);
        } catch (err) {
          const { markError } = await import("@/lib/integrations/external/store.server");
          const message = err instanceof Error ? err.message : "Помилка авторизації";
          await markError(provider, message, "error");
          return redirectTo(url.origin, message);
        }
        return new Response(null, { status: 302, headers: { location: `/integrations?connected=${provider}` } });
      },
    },
  },
});

function redirectTo(_origin: string, message: string) {
  return new Response(null, {
    status: 302,
    headers: { location: `/integrations?oauth_error=${encodeURIComponent(message)}` },
  });
}
