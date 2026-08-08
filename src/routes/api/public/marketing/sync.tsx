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
        const eq = (a: string, b: string) => {
          if (!a || !b || a.length !== b.length) return false;
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
          return diff === 0;
        };
        const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
        const workerSecret = process.env.INTEGRATIONS_WORKER_SECRET ?? "";
        const authorized =
          eq(request.headers.get("apikey") ?? "", anonKey) ||
          eq(request.headers.get("x-terzi-worker-secret") ?? "", workerSecret);
        if (!authorized) return new Response("Unauthorized", { status: 401 });


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
