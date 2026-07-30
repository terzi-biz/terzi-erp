import { createFileRoute } from "@tanstack/react-router";

/** Обмін коду OAuth на токени. State одноразовий і має обмежений термін дії. */
export const Route = createFileRoute("/api/public/integrations/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("Missing code or state", { status: 400 });

        const { admin } = await import("@/lib/access.server");
        const { buildContext, loadIntegration, logAttempt } = await import("@/lib/integrations/core.server");
        const db = await admin();

        const { data: st } = await db.from("integration_oauth_states").select("*").eq("state", state).maybeSingle();
        if (!st || (st as any).used_at || new Date((st as any).expires_at) < new Date()) {
          return new Response("Invalid or expired state", { status: 400 });
        }
        await db.from("integration_oauth_states").update({ used_at: new Date().toISOString() }).eq("state", state);

        const integration = await loadIntegration((st as any).integration_id);
        if (!integration) return new Response("Integration not found", { status: 404 });
        const ctx = await buildContext(integration);
        const cfg = ctx.config as any;
        const tokenUrl = cfg?.token_url as string | undefined;
        if (!tokenUrl) return new Response("token_url is not configured", { status: 400 });

        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: (st as any).redirect_uri ?? "",
          client_id: String(cfg?.client_id ?? ""),
        });
        const clientSecret = ctx.secret("client_secret");
        if (clientSecret) body.set("client_secret", clientSecret);
        if ((st as any).code_verifier) body.set("code_verifier", (st as any).code_verifier);

        const started = Date.now();
        const resp = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body,
        });
        const text = await resp.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text.slice(0, 500) };
        }

        if (!resp.ok || !json.access_token) {
          await db
            .from("integrations")
            .update({ status: "error", last_error: "OAuth: не вдалося отримати токен", last_error_at: new Date().toISOString() })
            .eq("id", integration.id);
          await logAttempt({ integrationId: integration.id, level: "error", message: "OAuth: обмін коду не вдався", httpStatus: resp.status, durationMs: Date.now() - started });
          return new Response("OAuth exchange failed", { status: 400 });
        }

        await db.from("integration_tokens").upsert(
          {
            integration_id: integration.id,
            access_token: json.access_token,
            refresh_token: json.refresh_token ?? null,
            token_type: json.token_type ?? "Bearer",
            scopes: json.scope ?? null,
            expires_at: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null,
          },
          { onConflict: "integration_id" },
        );
        await db
          .from("integrations")
          .update({ status: "active", enabled: true, last_success_at: new Date().toISOString(), last_error: null })
          .eq("id", integration.id);
        await logAttempt({ integrationId: integration.id, level: "info", message: "OAuth: токен отримано", httpStatus: 200, durationMs: Date.now() - started });

        return new Response(null, { status: 302, headers: { Location: "/integrations?oauth=ok" } });
      },
    },
  },
});
