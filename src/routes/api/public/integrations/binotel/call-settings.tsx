import { createFileRoute } from "@tanstack/react-router";

/**
 * Binotel Webhook API — CALL SETTINGS.
 * Викликається на початку дзвінка, відповідь має бути синхронною:
 * картка клієнта + маршрутизація на внутрішній номер відповідального.
 * Доступ: секретний токен (?token= або заголовок x-endpoint-token).
 */
export const Route = createFileRoute("/api/public/integrations/binotel/call-settings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const rawBody = await request.text();
        const { verifyBinotelToken, parseBinotelBody } = await import("@/lib/integrations/binotel/webhook.server");
        const { handleCallSettings } = await import("@/lib/integrations/binotel/calls.server");
        const { getBinotelIntegration } = await import("@/lib/integrations/binotel/ops.server");
        const { logAttempt } = await import("@/lib/integrations/core.server");

        const integration = await getBinotelIntegration();
        const ok = await verifyBinotelToken(request, integration?.id ?? null);
        if (!ok) {
          await logAttempt({
            integrationId: integration?.id ?? null,
            level: "error",
            message: "Binotel CALL SETTINGS: невірний токен",
            httpStatus: 401,
            durationMs: Date.now() - started,
          });
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = parseBinotelBody(rawBody, request.headers.get("content-type"));
        try {
          const res = await handleCallSettings(integration?.id ?? null, payload);
          await logAttempt({
            integrationId: integration?.id ?? null,
            level: "info",
            message: `Binotel CALL SETTINGS${res.matched ? " · клієнта знайдено" : " · новий номер"}`,
            httpStatus: 200,
            durationMs: Date.now() - started,
            request: payload,
            response: res.response,
          });
          return Response.json(res.response);
        } catch (e: any) {
          await logAttempt({
            integrationId: integration?.id ?? null,
            level: "error",
            message: `Binotel CALL SETTINGS: ${e?.message ?? "помилка обробки"}`,
            httpStatus: 500,
            durationMs: Date.now() - started,
            request: payload,
          });
          // Помилка ERP не має ламати маршрутизацію дзвінка в АТС.
          return Response.json({ customerData: {} });
        }
      },
      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
