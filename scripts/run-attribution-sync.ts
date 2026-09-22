/**
 * Разовий запуск наскрізної атрибуції та синхронізації Meta Ads (ручний, сервер).
 * Використання: bun scripts/run-attribution-sync.ts [днів]
 */
import { createClient } from "@supabase/supabase-js";
import { syncLeadAttribution } from "../src/lib/marketing/attribution.server";
import { buildLeadTouchpoints } from "../src/lib/marketing/touchpoints.server";
import { recordSyncRun } from "../src/lib/integrations/sync-run.server";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } }) as never;

const attribution = await syncLeadAttribution(db);
const touchpoints = await buildLeadTouchpoints(db);
await recordSyncRun(db, {
  providerKey: "attribution",
  name: "Наскрізна атрибуція",
  entity: "marketing_touchpoints",
  ok: true,
  stats: { processed: touchpoints.leads, created: touchpoints.created, updated: attribution.attributed, skipped: touchpoints.needsReview },
});
console.log(JSON.stringify({ attribution, touchpoints }, null, 2));
