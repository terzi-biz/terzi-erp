import { createFileRoute } from "@tanstack/react-router";

/**
 * Планова інкрементальна синхронізація Finmap (pg_cron, кожні 15 хв).
 * Тільки mode:"incremental" — курсор обмежений у syncOperations,
 * статуси manual/matched/ignored не перетираються. Після операцій — авто-матчинг
 * до замовлень/клієнтів, тому дебіторка й фактична собівартість оновлюються самі.
 */
export const Route = createFileRoute("/api/public/integrations/finmap/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const eq = (a: string, b: string) => {
          if (!a || !b || a.length !== b.length) return false;
          let d = 0;
          for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
          return d === 0;
        };
        const apikey = request.headers.get("apikey") ?? "";
        const ok =
          eq(apikey, process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "") ||
          eq(apikey, process.env["SUPABASE_ANON_KEY"] ?? "") ||
          eq(request.headers.get("x-terzi-worker-secret") ?? "", process.env["INTEGRATIONS_WORKER_SECRET"] ?? "");
        if (!ok) return new Response("Unauthorized", { status: 401 });

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
