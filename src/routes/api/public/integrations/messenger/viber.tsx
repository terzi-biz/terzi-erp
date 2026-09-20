import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Вхідні події Viber. Підпис X-Viber-Content-Signature перевіряється ДО обробки. */
export const Route = createFileRoute("/api/public/integrations/messenger/viber")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (process.env as Record<string, string | undefined>).VIBER_BOT_TOKEN;
        if (!token) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("x-viber-content-signature") ?? "";
        const expected = createHmac("sha256", token).update(raw).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

        const body = JSON.parse(raw) as Record<string, any>;
        if (body.event === "webhook") return new Response("ok");

        const { recordInboundMessage } = await import("@/lib/integrations/external/messenger.server");
        await recordInboundMessage({
          provider: "viber",
          externalId: String(body.message_token ?? ""),
          name: body.sender?.name ?? body.user?.name ?? null,
          phone: null,
          text: body.message?.text ?? null,
          raw: body,
        });
        return new Response("ok");
      },
    },
  },
});
