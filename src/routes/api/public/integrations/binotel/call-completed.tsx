import { createFileRoute } from "@tanstack/react-router";

/**
 * Binotel Webhook API — CALL COMPLETED.
 * Фіксує завершений дзвінок, за потреби створює контакт, лід
 * і задачу по пропущеному дзвінку. Ідемпотентно за generalCallID.
 */
export const Route = createFileRoute("/api/public/integrations/binotel/call-completed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const rawBody = await request.text();
        const { verifyBinotelToken, parseBinotelBody } = await import("@/lib/integrations/binotel/webhook.server");
        const { handleCallCompleted } = await import("@/lib/integrations/binotel/calls.server");
        const { getBinotelIntegration } = await import("@/lib/integrations/binotel/ops.server");
        const { logAttempt, enqueueEvent } = await import("@/lib/integrations/core.server");

        const integration = await getBinotelIntegration();
        const ok = await verifyBinotelToken(request, integration?.id ?? null);
        if (!ok) {
          await logAttempt({
            integrationId: integration?.id ?? null,
            level: "error",
            message: "Binotel CALL COMPLETED: невірний токен",
            httpStatus: 401,
            durationMs: Date.now() - started,
          });
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = parseBinotelBody(rawBody, request.headers.get("content-type"));
        const generalCallId = String(payload.generalCallID ?? payload.generalCallId ?? "") || null;

        // Реєстрація події в черзі інтеграцій (журнал + захист від дублікатів).
        const queued = await enqueueEvent({
          integrationId: integration?.id ?? null,
          providerKey: "binotel",
          direction: "inbound",
          eventType: "binotel.call_completed",
          payload,
          idempotencyKey: generalCallId ? `binotel:call_completed:${generalCallId}` : null,
          entityType: "call",
          entityId: generalCallId,
        } as any);

        try {
          const res = await handleCallCompleted(integration?.id ?? null, payload);
          await logAttempt({
            eventId: queued?.id ?? null,
            integrationId: integration?.id ?? null,
            level: "info",
            message: `Binotel CALL COMPLETED · ${res.status}${res.created_lead ? " · створено лід" : ""}${res.task_id ? " · задача" : ""}`,
            httpStatus: 200,
            durationMs: Date.now() - started,
            request: payload,
            response: res,
          });
          return Response.json({ ok: true, ...res });
        } catch (e: any) {
          await logAttempt({
            eventId: queued?.id ?? null,
            integrationId: integration?.id ?? null,
            level: "error",
            message: `Binotel CALL COMPLETED: ${e?.message ?? "помилка обробки"}`,
            httpStatus: 500,
            durationMs: Date.now() - started,
            request: payload,
          });
          return Response.json({ ok: false, error: "processing_failed" }, { status: 500 });
        }
      },
      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
