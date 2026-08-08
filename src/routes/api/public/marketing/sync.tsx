import { createFileRoute } from "@tanstack/react-router";

/**
 * Планова синхронізація маркетингу з CRM.
 * Викликається pg_cron із заголовком x-terzi-worker-secret.
 * Проставляє лідам канал/кампанію, перераховує правила та рекомендації.
 */
export const Route = createFileRoute("/api/public/marketing/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { default: process } = await import("node:process");
        const expected = process.env.INTEGRATIONS_WORKER_SECRET;
        if (!expected) return new Response("Worker secret is not configured", { status: 503 });
        const provided = request.headers.get("x-terzi-worker-secret") ?? "";
        if (provided.length !== expected.length) return new Response("Unauthorized", { status: 401 });
        let diff = 0;
        for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
        if (diff !== 0) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncLeadAttribution } = await import("@/lib/marketing/attribution.server");
        const attribution = await syncLeadAttribution(supabaseAdmin as never);

        let alerts: unknown = null;
        let recommendations: unknown = null;
        try {
          const { evaluateMarketingRules, buildRecommendations } = await import("@/lib/marketing/rules.server");
          alerts = await evaluateMarketingRules(supabaseAdmin as never, "00000000-0000-0000-0000-000000000000");
          recommendations = await buildRecommendations(supabaseAdmin as never, "00000000-0000-0000-0000-000000000000");
        } catch (e) {
          alerts = { error: e instanceof Error ? e.message : "rules failed" };
        }

        await supabaseAdmin.from("audit_logs").insert({
          module: "marketing",
          action: "attribution_sync_cron",
          entity_type: "crm_leads",
          new_value: attribution as never,
          is_critical: false,
        } as never);

        return Response.json({ ok: true, attribution, alerts, recommendations });
      },
    },
  },
});
