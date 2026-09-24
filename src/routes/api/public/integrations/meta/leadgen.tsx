import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta Lead Ads webhook → канонічний lead intake.
 * GET: hub.challenge (META_WEBHOOK_VERIFY_TOKEN). POST: X-Hub-Signature-256 (META_APP_SECRET).
 * Деталі ліда — з Graph API (META_ADS_ACCESS_TOKEN, потрібен leads_retrieval).
 * Ідемпотентність: external_id = meta_lead:<leadgen_id> у lead_intake_events (без добового вікна).
 */
export const Route = createFileRoute("/api/public/integrations/meta/leadgen")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { metaEnv } = await import("@/lib/integrations/foundation/meta-ads.server");
        const { verifyToken } = metaEnv();
        const url = new URL(request.url);
        if (
          verifyToken &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === verifyToken
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const meta = await import("@/lib/integrations/foundation/meta-ads.server");
        const { appSecret } = meta.metaEnv();
        const raw = await request.text();
        if (!appSecret) return Response.json({ ok: false, error: "Not configured" }, { status: 503 });
        if (!meta.verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
          return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
        }
        let body: unknown;
        try { body = JSON.parse(raw || "{}"); } catch { return Response.json({ ok: false }, { status: 400 }); }

        const { parseMetaLeadgenIds, processMetaLeadgen } = await import("@/lib/leads/inbound-adapter");
        const { handleLeadIntake } = await import("@/lib/leads/intake.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const results = [];
        for (const { leadgenId } of parseMetaLeadgenIds(body)) {
          const r = await processMetaLeadgen(leadgenId, {
            fetchLead: meta.fetchMetaLead,
            intake: (p) => handleLeadIntake(supabaseAdmin as never, p, { ipHash: null, signatureOk: true }),
          });
          if (r.status !== "accepted" && r.status !== "duplicate") {
            // Лише ID ліда й статус — без телефону/e-mail/токена.
            console.error("meta leadgen not ingested", { leadgenId, status: r.status, error: r.error });
          }
          results.push({ leadgen_id: r.leadgenId, status: r.status });
        }
        // 200 завжди після валідного підпису: Meta не повинна нескінченно ретраїти помилки прав.
        return Response.json({ ok: true, results });
      },
    },
  },
});
