import { createFileRoute } from "@tanstack/react-router";

/**
 * Планова інкрементальна синхронізація Finmap (pg_cron, кожні 15 хв).
 * Тільки mode:"incremental" — курсор обмежений у syncOperations,
 * статуси manual/matched/ignored не перетираються. Після операцій — авто-матчинг
 * до замовлень/клієнтів, тому дебіторка й фактична собівартість оновлюються самі.
 * Авторизація лише через x-terzi-worker-secret (env INTEGRATIONS_WORKER_SECRET
 * або private.cron_worker_secret через rpc verify_cron_worker_secret);
 * publishable/anon ключ не приймається.
 */
export const Route = createFileRoute("/api/public/integrations/finmap/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeWorkerRequest, workerUnauthorized } = await import("@/lib/integrations/worker-auth.server");
        if (!(await authorizeWorkerRequest(request, "/api/public/integrations/finmap/cron"))) return workerUnauthorized();


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runFinmapSync } = await import("@/lib/finance/finmap-sync.server");
        try {
          const results = await runFinmapSync(supabaseAdmin, { mode: "incremental" });
          const summary = results.map((r) => ({ entity: r.entity, status: r.status, inserted: r.inserted, updated: r.updated }));
          return Response.json({ ok: results.every((r) => r.status !== "error"), summary });
        } catch (e) {
          console.error("finmap cron", e);
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
