import { createFileRoute } from "@tanstack/react-router";

/**
 * Публічний endpoint прийому лідів: сайт, Google Ads, Meta, TikTok.
 *
 * POST /api/public/leads/intake
 * Заголовок: x-terzi-signature: sha256=<HMAC_SHA256(raw_body, LEAD_INTAKE_SECRET)>
 * Тіло: { provider, source, campaign, name, phone, email, message, direction, area,
 *         address, utm:{...}, gclid, fbclid, external_id }
 */
export const Route = createFileRoute("/api/public/leads/intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { default: process } = await import("node:process");
        const secret = process.env.LEAD_INTAKE_SECRET ?? "";
        const raw = await request.text();

        const { verifySignature, hashIp, handleLeadIntake } = await import("@/lib/leads/intake.server");

        const signature = request.headers.get("x-terzi-signature") ?? "";
        if (!secret) return Response.json({ ok: false, error: "Intake not configured" }, { status: 503 });
        if (!verifySignature(raw, signature, secret)) {
          return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw || "{}") as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "";
        const ipHash = ip ? hashIp(ip, secret) : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const result = await handleLeadIntake(supabaseAdmin as never, payload as never, {
          ipHash,
          signatureOk: true,
        });

        const status =
          result.status === "accepted" ? 201 :
          result.status === "duplicate" ? 200 :
          result.status === "rate_limited" ? 429 : 400;

        return Response.json(
          {
            ok: result.status === "accepted" || result.status === "duplicate",
            status: result.status,
            lead_id: result.leadId ?? null,
            request_id: result.requestId ?? null,
            error: result.error ?? null,
          },
          { status },
        );
      },
      GET: async () =>
        Response.json({ ok: true, endpoint: "leads/intake", method: "POST", signature: "x-terzi-signature" }),
    },
  },
});
