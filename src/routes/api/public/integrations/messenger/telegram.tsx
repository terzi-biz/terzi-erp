import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

/** Вхідні повідомлення Telegram. Секретний заголовок перевіряється ДО обробки. */
export const Route = createFileRoute("/api/public/integrations/messenger/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = process.env as Record<string, string | undefined>;
        const expected = env.TELEGRAM_WEBHOOK_SECRET;
        if (expected && request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
          return new Response("Invalid secret", { status: 401 });
        }
        if (!env.TELEGRAM_BOT_TOKEN) return new Response("Not configured", { status: 503 });

        const body = (await request.json().catch(() => null)) as Record<string, any> | null;
        if (!body) return new Response("Bad payload", { status: 400 });

        const msg = body.message ?? body.callback_query?.message ?? null;
        const { recordInboundMessage } = await import("@/lib/integrations/external/messenger.server");
        await recordInboundMessage({
          provider: "telegram",
          externalId: String(body.update_id ?? msg?.message_id ?? ""),
          name: [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ") || null,
          phone: msg?.contact?.phone_number ?? null,
          text: msg?.text ?? msg?.caption ?? null,
          raw: body,
        });
        return new Response("ok");
      },
    },
  },
});
