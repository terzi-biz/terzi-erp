import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API: верифікація вебхука (GET) і вхідні повідомлення (POST).
 * Підпис Meta перевіряється ДО будь-якої обробки payload.
 */
function signatureValid(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest("hex");
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export const Route = createFileRoute("/api/public/integrations/messenger/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = process.env as Record<string, string | undefined>;
        const url = new URL(request.url);
        const verify = env.WHATSAPP_VERIFY_TOKEN;
        if (
          verify &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === verify
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const env = process.env as Record<string, string | undefined>;
        const appSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
        const raw = await request.text();
        if (!appSecret) return new Response("Not configured", { status: 503 });
        if (!signatureValid(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let body: Record<string, any>;
        try {
          body = JSON.parse(raw || "{}") as Record<string, any>;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const { recordInboundMessage } = await import("@/lib/integrations/external/messenger.server");
        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const value = change.value ?? {};
            const contactName = value.contacts?.[0]?.profile?.name ?? null;
            for (const m of value.messages ?? []) {
              await recordInboundMessage({
                provider: "whatsapp",
                externalId: String(m.id ?? ""),
                name: contactName,
                phone: m.from ? `+${String(m.from).replace(/\D/g, "")}` : null,
                text: m.text?.body ?? m.button?.text ?? null,
                raw: { entry_id: entry.id ?? null, message: m, metadata: value.metadata ?? null },
              });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
