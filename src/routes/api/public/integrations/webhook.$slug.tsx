import { createFileRoute } from "@tanstack/react-router";

/**
 * Приймання вхідних вебхуків: /api/public/integrations/webhook/<slug>
 * Підпис перевіряється до розбору JSON, подія лише ставиться в чергу.
 */
export const Route = createFileRoute("/api/public/integrations/webhook/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const started = Date.now();
        const rawBody = await request.text();
        const { admin } = await import("@/lib/access.server");
        const { enqueueEvent, buildContext, loadIntegration, readSecret, logAttempt } = await import("@/lib/integrations/core.server");
        const { getAdapter } = await import("@/lib/integrations/adapter.server");
        const { verifyHmacSha256 } = await import("@/lib/integrations/signature.server");

        const db = await admin();
        const { data: hook } = await db
          .from("integration_webhooks")
          .select("*")
          .eq("slug", params.slug)
          .eq("direction", "inbound")
          .maybeSingle();
        if (!hook || !(hook as any).enabled) return new Response("Not found", { status: 404 });

        const integration = await loadIntegration((hook as any).integration_id);
        if (!integration || !integration.enabled) return new Response("Integration disabled", { status: 409 });

        const adapter = getAdapter(integration.provider_key);
        const ctx = await buildContext(integration);
        const secret = readSecret((hook as any).secret_ref) ?? ((hook as any).endpoint_token ?? null);
        const signatureHeader = (hook as any).signature_header ?? "x-signature";

        let verified = false;
        if (adapter?.verifyWebhook) {
          verified = await adapter.verifyWebhook(ctx, { rawBody, headers: request.headers, secret, signatureHeader, url: request.url });
        } else if ((hook as any).signature_mode === "none") {
          verified = true;
        } else if (secret) {
          verified = await verifyHmacSha256(rawBody, request.headers.get(signatureHeader), secret);
        }
        if (!verified) {
          await logAttempt({
            integrationId: integration.id,
            level: "error",
            message: "Відхилено: невірний підпис вебхука",
            httpStatus: 401,
            durationMs: Date.now() - started,
          });
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed: unknown = {};
        try {
          parsed = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          parsed = { raw: rawBody.slice(0, 4000) };
        }

        const normalized = adapter?.normalizeEvent
          ? adapter.normalizeEvent(ctx, parsed, request.headers)
          : {
              eventType: String((parsed as any)?.event ?? "webhook.received"),
              payload: (parsed ?? {}) as Record<string, unknown>,
              idempotencyKey: request.headers.get("x-idempotency-key"),
            };

        const res = await enqueueEvent({
          integrationId: integration.id,
          providerKey: integration.provider_key,
          direction: "inbound",
          eventType: normalized.eventType,
          payload: normalized.payload,
          idempotencyKey: normalized.idempotencyKey ?? null,
          entityType: normalized.entityType ?? null,
          entityId: normalized.entityId ?? null,
        });

        await db.from("integration_webhooks").update({ last_call_at: new Date().toISOString() }).eq("id", (hook as any).id);
        await logAttempt({
          eventId: res.id,
          integrationId: integration.id,
          level: "info",
          message: res.duplicate ? "Дублікат події (idempotency)" : "Подію прийнято в чергу",
          httpStatus: 200,
          durationMs: Date.now() - started,
          request: parsed,
        });

        return Response.json({ ok: true, duplicate: res.duplicate, event_id: res.id });
      },
      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
