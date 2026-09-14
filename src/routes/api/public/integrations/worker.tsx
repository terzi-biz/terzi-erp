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
