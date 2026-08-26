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
        const eq = (a: string, b: string) => {
          if (!a || !b || a.length !== b.length) return false;
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
          return diff === 0;
        };
        const apikey = request.headers.get("apikey") ?? "";
        const authorized =
          eq(request.headers.get("x-terzi-worker-secret") ?? "", process.env.INTEGRATIONS_WORKER_SECRET ?? "") ||
          eq(apikey, process.env.SUPABASE_ANON_KEY ?? "") ||
          eq(apikey, process.env.SUPABASE_PUBLISHABLE_KEY ?? "") ||
          eq(apikey, process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
        if (!authorized) return new Response("Unauthorized", { status: 401 });

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
        // Планове підтягування історії дзвінків Binotel (останню добу).
        let binotel: unknown = null;
        try {
          const { getBinotelIntegration, binotelSyncCallHistoryCron } = await import(
            "@/lib/integrations/binotel/ops.server"
          );
          const integration = await getBinotelIntegration();
          binotel = integration?.enabled ? await binotelSyncCallHistoryCron(1) : { skipped: true };
        } catch (e) {
          binotel = { error: e instanceof Error ? e.message : "binotel sync failed" };
        }

        return Response.json({ ok: true, ...res, polls, binotel });
      },
    },
  },
});
