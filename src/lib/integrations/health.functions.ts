import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDERS, normalizeHealth, type HealthEvidence, type ProviderHealth, type ReadinessMetric } from "./health";

/** Read-only health aggregator. Uses the caller's session (RLS applies); unreadable sources → no evidence. */
export const getIntegrationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const safe = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
      try { const r = await p; return r.error ? null : r.data; } catch { return null; }
    };
    const count = async (q: any): Promise<number | null> => {
      try { const r = await q; return r.error ? null : (r.count ?? 0); } catch { return null; }
    };

    const [ints, legacy, events, fmState, fmLog, channels, lastCall] = await Promise.all([
      safe<any[]>(db.from("integrations").select("provider_key,name,enabled,last_test_at,last_test_ok,last_success_at,last_error,last_error_at")),
      safe<any[]>(db.from("marketing_integrations").select("provider,connection_status,account_name,last_success_at,last_error")),
      safe<any[]>(db.from("integration_events").select("provider_key,created_at").eq("direction", "inbound").order("created_at", { ascending: false }).limit(500)),
      safe<any[]>(db.from("finmap_sync_state").select("entity,last_success_at,last_error,updated_at")),
      safe<any[]>(db.from("finmap_sync_log").select("status,message,created_at").order("created_at", { ascending: false }).limit(20)),
      safe<any[]>(db.from("marketing_channels").select("id,platform")),
      safe<any[]>(db.from("crm_calls").select("started_at").order("started_at", { ascending: false }).limit(1)),
    ]);

    // latest metrics sync per platform
    const metricsByPlatform: Record<string, string | null> = {};
    for (const p of new Set(PROVIDERS.map((m) => m.metricsPlatform).filter(Boolean) as string[])) {
      const ids = (channels ?? []).filter((c) => c.platform === p).map((c) => c.id);
      if (!ids.length) continue;
      const r = await safe<any[]>(db.from("marketing_daily_metrics").select("synced_at").in("channel_id", ids).order("synced_at", { ascending: false }).limit(1));
      metricsByPlatform[p] = r?.[0]?.synced_at ?? null;
    }

    const records: ProviderHealth[] = PROVIDERS.map((meta) => {
      const rows = (ints ?? []).filter((r) => meta.integrationKeys.includes(r.provider_key));
      const best = rows.sort((a, b) => Date.parse(b.last_success_at ?? b.last_test_at ?? 0) - Date.parse(a.last_success_at ?? a.last_test_at ?? 0))[0];
      const leg = (legacy ?? []).find((r) => meta.legacyKeys.includes(r.provider));
      const ev: HealthEvidence = {
        canonical: best ? {
          name: best.name, enabled: best.enabled, lastTestAt: best.last_test_at, lastTestOk: best.last_test_ok,
          lastSuccessAt: best.last_success_at, lastError: best.last_error, lastErrorAt: best.last_error_at,
        } : null,
        lastEventAt: (events ?? []).find((e) => meta.integrationKeys.includes(e.provider_key))?.created_at ?? null,
        lastSyncAt: meta.metricsPlatform ? metricsByPlatform[meta.metricsPlatform] ?? null : null,
        legacy: leg ? { status: leg.connection_status, accountName: leg.account_name, lastSuccessAt: leg.last_success_at, lastError: leg.last_error } : null,
        envConfigured: meta.envKeys.length > 0 && meta.envKeys.every((k) => !!process.env[k]),
        extra: [],
      };
      if (meta.id === "finmap") {
        const ok = (fmState ?? []).map((s) => s.last_success_at).filter(Boolean).sort().pop() ?? null;
        const errLog = (fmLog ?? []).find((l) => l.status === "error");
        ev.lastSyncAt = ok;
        ev.lastSyncError = errLog?.message ?? null;
        ev.lastSyncErrorAt = errLog?.created_at ?? null;
        if (fmState === null) ev.extra!.push("Немає доступу до фінансових даних");
      }
      if (meta.id === "binotel" && lastCall?.[0]?.started_at) ev.extra!.push(`Останній дзвінок: ${lastCall[0].started_at}`);
      if (leg && leg.connection_status === "connected") ev.extra!.push("Legacy-статус маркетингу: «підключено» (довідково)");
      return normalizeHealth(meta, ev);
    });

    // Finmap reconciliation + Binotel linkage + attribution readiness
    const [unmatched, txTotal, calls, callsLinked, tp, tpUtm, tpClick, leads, leadsSrc] = await Promise.all([
      count(db.from("finance_transactions").select("id", { count: "exact", head: true }).eq("match_status", "unmatched")),
      count(db.from("finance_transactions").select("id", { count: "exact", head: true })),
      count(db.from("crm_calls").select("id", { count: "exact", head: true })),
      count(db.from("crm_calls").select("id", { count: "exact", head: true }).or("client_id.not.is.null,lead_id.not.is.null,order_id.not.is.null,contact_id.not.is.null")),
      count(db.from("marketing_touchpoints").select("id", { count: "exact", head: true })),
      count(db.from("marketing_touchpoints").select("id", { count: "exact", head: true }).or("campaign.not.is.null,source.not.is.null")),
      count(db.from("marketing_touchpoints").select("id", { count: "exact", head: true }).or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,fbclid.not.is.null,ttclid.not.is.null")),
      count(db.from("crm_leads").select("id", { count: "exact", head: true })),
      count(db.from("crm_leads").select("id", { count: "exact", head: true }).not("source", "is", null)),
    ]);
    const fm = records.find((r) => r.id === "finmap");
    if (fm && txTotal !== null) fm.facts.push(`Транзакцій: ${txTotal}, не зіставлено: ${unmatched ?? "немає даних"}`);
    const bn = records.find((r) => r.id === "binotel");
    if (bn && calls !== null) bn.facts.push(`Дзвінків прив'язано до CRM: ${callsLinked ?? "?"} з ${calls}`);

    const readiness: ReadinessMetric[] = [
      { label: "Ліди з джерелом", count: leadsSrc, total: leads },
      { label: "Точки контакту з UTM/кампанією", count: tpUtm, total: tp },
      { label: "Точки контакту з click ID (gclid/gbraid/wbraid/fbclid/ttclid)", count: tpClick, total: tp },
      { label: "Дзвінки, прив'язані до CRM", count: callsLinked, total: calls },
    ];
    return { records, readiness, generatedAt: new Date().toISOString() };
  });
