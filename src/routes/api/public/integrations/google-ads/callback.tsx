import { createFileRoute } from "@tanstack/react-router";

/**
 * Повернення Google OAuth: показує refresh_token один раз,
 * щоб адміністратор зберіг його як секрет GOOGLE_ADS_REFRESH_TOKEN.
 * Значення не логується і не зберігається в базі.
 */
export const Route = createFileRoute("/api/public/integrations/google-ads/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleAdsEnv } = await import("@/lib/integrations/foundation/google-ads.server");
        const env = googleAdsEnv();
        if (env.refreshToken) return new Response("Google Ads вже авторизовано", { status: 409 });
        if (!env.clientId || !env.clientSecret) {
          return new Response("Не задано GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET", { status: 400 });
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) return new Response("Missing code", { status: 400 });

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: env.clientId,
            client_secret: env.clientSecret,
            redirect_uri: `${url.origin}/api/public/integrations/google-ads/callback`,
            grant_type: "authorization_code",
          }),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || !json.refresh_token) {
          return new Response(
            `Не вдалося отримати refresh_token: ${String(json.error_description ?? json.error ?? res.status)}`,
            { status: 400 },
          );
        }
        const html = `<!doctype html><meta charset="utf-8"><title>Google Ads</title>
<body style="font-family:system-ui;padding:24px;max-width:720px">
<h1>Refresh token отримано</h1>
<p>Скопіюйте значення нижче та збережіть його як секрет <b>GOOGLE_ADS_REFRESH_TOKEN</b>. Сторінка більше не покаже його.</p>
<textarea readonly rows="4" style="width:100%;font-family:monospace">${String(json.refresh_token)}</textarea>
</body>`;
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
