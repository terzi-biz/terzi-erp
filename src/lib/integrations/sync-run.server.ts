/**
 * Єдиний запис результату синхронізації в телеметрію інтеграцій.
 *
 * Оновлює `integrations` (last_success_at / last_error) і
 * `integration_sync_state` (last_sync_at, stats) — щоб панель Reconciliation
 * показувала реальний останній успіх, час і кількість оброблених операцій.
 * Успіх фіксується лише за фактично успішного виклику провайдера.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<any, any, any>;

export type SyncRunInput = {
  providerKey: string;
  name: string;
  entity: string;
  ok: boolean;
  stats?: Record<string, unknown>;
  error?: string | null;
};

async function ensureIntegration(db: Db, providerKey: string, name: string): Promise<string | null> {
  const { data } = await db.from("integrations").select("id").eq("provider_key", providerKey).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins } = await db
    .from("integrations")
    .insert({ provider_key: providerKey, name, slug: providerKey, status: "disconnected", enabled: true })
    .select("id")
    .maybeSingle();
  return (ins?.id as string) ?? null;
}

export async function recordSyncRun(db: Db, input: SyncRunInput): Promise<void> {
  const now = new Date().toISOString();
  const integrationId = await ensureIntegration(db, input.providerKey, input.name);
  if (!integrationId) return;

  await db
    .from("integrations")
    .update(
      input.ok
        ? { status: "active", enabled: true, last_success_at: now, last_test_at: now, last_test_ok: true, last_error: null }
        : { last_test_at: now, last_test_ok: false, last_error: input.error ?? "Помилка синхронізації", last_error_at: now },
    )
    .eq("id", integrationId);

  const state = {
    integration_id: integrationId,
    entity: input.entity,
    last_run_at: now,
    last_status: input.ok ? "ok" : "error",
    last_error: input.ok ? null : (input.error ?? "Помилка синхронізації"),
    stats: (input.stats ?? {}) as never,
    ...(input.ok ? { last_sync_at: now } : {}),
  };

  const { data: existing } = await db
    .from("integration_sync_state")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("entity", input.entity)
    .maybeSingle();

  if (existing?.id) await db.from("integration_sync_state").update(state).eq("id", existing.id);
  else await db.from("integration_sync_state").insert(state as never);
}
