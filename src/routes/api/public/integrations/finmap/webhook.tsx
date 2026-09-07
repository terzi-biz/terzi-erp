import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Вхідний вебхук Finmap: приймає подію → зберігає сирий payload → дедуплікує →
 * підтягує сутність із Finmap → upsert → повторний розрахунок фінансів.
 *
 * Доступ: перевіряється секретний токен у заголовку/шляху ДО будь-якого запису.
 */

function tokenOk(req: Request, url: URL): boolean {
  const expected = process.env["FINMAP_WEBHOOK_TOKEN"];
  if (!expected) return false;
  const got = req.headers.get("x-finmap-token") ?? url.searchParams.get("token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/integrations/finmap/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (!tokenOk(request, url)) return new Response("Invalid token", { status: 401 });

        const raw = await request.text();
        let payload: any = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch { return new Response("Invalid JSON", { status: 400 }); }

        const hash = createHash("sha256").update(raw).digest("hex");
        const eventType = String(payload?.event ?? payload?.type ?? "finmap.operation");
        const providerEventId = payload?.id ?? payload?.operationId ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Дедуплікація за provider_event_id, інакше за hash payload.
        const dedupe = providerEventId
          ? await supabaseAdmin.from("finmap_webhook_events").select("id,duplicate_count").eq("provider_event_id", String(providerEventId)).maybeSingle()
          : await supabaseAdmin.from("finmap_webhook_events").select("id,duplicate_count").eq("payload_hash", hash).maybeSingle();

        if (dedupe.data) {
          await supabaseAdmin.from("finmap_webhook_events")
            .update({ duplicate_count: (dedupe.data.duplicate_count ?? 0) + 1 }).eq("id", dedupe.data.id);
          return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers: { "content-type": "application/json" } });
        }

        const { data: event, error } = await supabaseAdmin.from("finmap_webhook_events").insert({
          event_type: eventType,
          provider_event_id: providerEventId ? String(providerEventId) : null,
          payload_hash: hash, payload, status: "pending", attempts: 1,
        }).select().single();
        if (error) return new Response("Storage error", { status: 500 });

        try {
          const { syncOperations, syncAccounts } = await import("@/lib/finance/finmap-sync.server");
          await syncAccounts(supabaseAdmin);
          await syncOperations(supabaseAdmin, { pageSize: 200, maxPages: 3 });
          await supabaseAdmin.from("finmap_webhook_events")
            .update({ status: "done", processed_at: new Date().toISOString() }).eq("id", event.id);
        } catch (e: any) {
          await supabaseAdmin.from("finmap_webhook_events")
            .update({ status: "failed", error: String(e?.message ?? e) }).eq("id", event.id);
          return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
