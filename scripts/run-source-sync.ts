/**
 * Разова реальна синхронізація зовнішніх джерел (Meta Ads, Finmap) із записом телеметрії.
 * Використання: bun scripts/run-source-sync.ts
 */
import { createClient } from "@supabase/supabase-js";
import { recordSyncRun } from "../src/lib/integrations/sync-run.server";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } }) as never;

const today = new Date();
const from = new Date(today.getTime() - 89 * 864e5).toISOString().slice(0, 10);
const to = today.toISOString().slice(0, 10);
const out: Record<string, unknown> = {};

try {
  const { syncMetaInsights } = await import("../src/lib/integrations/foundation/meta-ads.server");
  const res = await syncMetaInsights({ from, to });
  out.meta = res;
  await recordSyncRun(db, {
    providerKey: "meta_ads",
    name: "Meta Ads",
    entity: "marketing_daily_metrics",
    ok: true,
    stats: { processed: res.inserted + res.updated, created: res.inserted, updated: res.updated },
  });
} catch (e) {
  out.meta = { error: e instanceof Error ? e.message : String(e) };
  await recordSyncRun(db, { providerKey: "meta_ads", name: "Meta Ads", entity: "marketing_daily_metrics", ok: false, error: String(out.meta) });
}

try {
  const { runFinmapSync } = await import("../src/lib/finance/finmap-sync.server");
  const res = await runFinmapSync(db, { mode: "incremental", from, to });
  out.finmap = res;
  const totals = res.reduce(
    (a, r) => ({ processed: a.processed + (r.fetched ?? 0), created: a.created + (r.inserted ?? 0), updated: a.updated + (r.updated ?? 0) }),
    { processed: 0, created: 0, updated: 0 },
  );
  await recordSyncRun(db, { providerKey: "finmap", name: "Finmap", entity: "finance_transactions", ok: true, stats: totals });
} catch (e) {
  out.finmap = { error: e instanceof Error ? e.message : String(e) };
  await recordSyncRun(db, { providerKey: "finmap", name: "Finmap", entity: "finance_transactions", ok: false, error: String(out.finmap) });
}

console.log(JSON.stringify(out, null, 2));
