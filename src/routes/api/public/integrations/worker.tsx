import { createFileRoute } from "@tanstack/react-router";

/**
 * Тік черги інтеграцій. Викликається зовнішнім планувальником (pg_cron).
 * Авторизація лише через x-terzi-worker-secret (env INTEGRATIONS_WORKER_SECRET
 * або private.cron_worker_secret через rpc verify_cron_worker_secret);
 * publishable/anon ключ не приймається. Обробляє маленьку пачку подій.
 */
export const Route = createFileRoute("/api/public/integrations/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { default: process } = await import("node:process");
        const { authorizeWorkerRequest, workerUnauthorized } = await import("@/lib/integrations/worker-auth.server");
        if (!(await authorizeWorkerRequest(request, "/api/public/integrations/worker"))) return workerUnauthorized();


        // Ручний бекфіл keyCRM: вікно сторінок по одній сутності, курсор не зсувається.
        let body: any = null;
        try {
          body = await request.clone().json();
        } catch {
          body = null;
        }
        if (body?.task === "keycrm_backfill") {
          const { loadIntegration, buildContext } = await import("@/lib/integrations/core.server");
          const { runKeyCrmSync } = await import("@/lib/integrations/keycrm/sync.server");
          const integration = await loadIntegration(String(body.integration_id ?? "keycrm"));
          if (!integration) return Response.json({ ok: false, error: "integration_not_found" }, { status: 404 });
          const ctx = await buildContext(integration);
          const results = await runKeyCrmSync(ctx, {
            entities: Array.isArray(body.entities) ? body.entities : undefined,
            full: Boolean(body.full),
            force: Boolean(body.force),
            maxPages: Number(body.max_pages ?? 5),
            page: body.page ? Number(body.page) : undefined,
          });
          return Response.json({ ok: true, task: "keycrm_backfill", results });
        }

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

        // Щогодинна фонова звірка Finmap: інкрементальна синхронізація + автозвʼязування.
        let finmap: unknown = null;
        try {
          if (!process.env.FINMAP_API_KEY) {
            finmap = { skipped: "no_api_key" };
          } else {
            const { admin } = await import("@/lib/access.server");
            const db = await admin();
            const { data: state } = await db
              .from("finmap_sync_state").select("last_success_at").eq("entity", "operations").maybeSingle();
            const last = state?.last_success_at ? Date.parse(state.last_success_at) : 0;
            if (Date.now() - last < 55 * 60_000) {
              finmap = { skipped: "recent", last_success_at: state?.last_success_at ?? null };
            } else {
              const { runFinmapSync } = await import("@/lib/finance/finmap-sync.server");
              finmap = await runFinmapSync(db, { mode: "incremental", userId: null });
            }
          }
        } catch (e) {
          finmap = { error: e instanceof Error ? e.message : "finmap sync failed" };
        }

        return Response.json({ ok: true, ...res, polls, binotel, finmap });
      },

    },
  },
});
