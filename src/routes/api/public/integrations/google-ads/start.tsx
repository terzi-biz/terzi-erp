import { createFileRoute } from "@tanstack/react-router";

/**
 * Одноразовий вхід для отримання refresh_token Google Ads.
 * Доступний лише поки GOOGLE_ADS_REFRESH_TOKEN не заданий.
 */
export const Route = createFileRoute("/api/public/integrations/google-ads/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleAdsEnv, GOOGLE_ADS_SCOPE } = await import(
          "@/lib/integrations/foundation/google-ads.server"
        );
        const env = googleAdsEnv();
        if (env.refreshToken) return new Response("Google Ads вже авторизовано", { status: 409 });
        if (!env.clientId) return new Response("Не задано GOOGLE_OAUTH_CLIENT_ID", { status: 400 });

        const origin = new URL(request.url).origin;
        const params = new URLSearchParams({
          client_id: env.clientId,
          redirect_uri: `${origin}/api/public/integrations/google-ads/callback`,
          response_type: "code",
          scope: GOOGLE_ADS_SCOPE,
          access_type: "offline",
          prompt: "consent",
        });
        return new Response(null, {
          status: 302,
          headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` },
        });
      },
    },
  },
});
