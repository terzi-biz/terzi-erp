import { createFileRoute } from "@tanstack/react-router";

/**
 * Тік черги інтеграцій. Викликається зовнішнім планувальником (pg_cron) із
 * заголовком x-terzi-worker-secret. Обробляє маленьку пачку подій.
 */
export const Route = createFileRoute("/api/public/integrations/worker")({
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

        const { runQueue } = await import("@/lib/integrations/core.server");
        const res = await runQueue(10);

        // Планове опитування keyCRM за налаштованими інтервалами.
        let polls: unknown[] = [];
        try {
          const { runDuePolls } = await import("@/lib/integrations/sync-ops.server");
          polls = await runDuePolls();
        } catch (e) {
          polls = [{ error: e instanceof Error ? e.message : "poll failed" }];
        }
        return Response.json({ ok: true, ...res, polls });
      },
    },
  },
});
