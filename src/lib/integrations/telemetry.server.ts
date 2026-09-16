/**
 * Єдина телеметрія інтеграцій і Reconciliation (лише сервер).
 *
 * Читає наявні таблиці ядра (`integrations`, `integration_sync_state`,
 * `integration_events`, `integration_conflicts`) і будує один DTO для
 * дашборда та звіту Administration. Нових таблиць і формул не створює.
 * Успіх фіксується лише за фактичним `last_success_at` / `last_sync_at`;
 * відсутні дані показуються як `null` («Потребує підключення»), не як 0.
 */
import { admin, loadActor, requirePermission } from "../access.server";

export type IntegrationTelemetry = {
  id: string;
  providerKey: string;
  name: string;
  status: string;
  enabled: boolean;
  /** Останній фактично успішний обмін з провайдером. */
  lastSuccessAt: string | null;
  /** Остання спроба (тест, синхронізація або подія). */
  lastAttemptAt: string | null;
  lastError: string | null;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  queue: { pending: number; processing: number; failed: number; dead: number };
  conflicts: number;
  entities: Array<{ entity: string; lastSyncAt: string | null; status: string | null; error: string | null }>;
  /** true — інтеграція жодного разу не мала успішного обміну. */
  needsConnection: boolean;
};

export type ReconciliationReport = {
  generatedAt: string;
  integrations: IntegrationTelemetry[];
  totals: { processed: number; created: number; updated: number; skipped: number; failed: number; conflicts: number; queued: number };
  lastSuccessAt: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickStat(stats: Record<string, unknown> | null | undefined, keys: string[]): number {
  if (!stats) return 0;
  for (const k of keys) if (stats[k] != null) return num(stats[k]);
  return 0;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export async function buildReconciliationReport(userId: string): Promise<ReconciliationReport> {
  const actor = await loadActor(userId);
  if (!actor.canManage) await requirePermission(userId, "integrations", "view");
  const db = await admin();

  const [{ data: rows }, { data: states }, { data: events }, { data: conflicts }] = await Promise.all([
    db.from("integrations").select("id, provider_key, name, status, enabled, last_success_at, last_error, last_error_at, last_test_at"),
    db.from("integration_sync_state").select("integration_id, entity, last_sync_at, last_run_at, last_status, last_error, stats"),
    db.from("integration_events").select("integration_id, status, updated_at, created_at"),
    db.from("integration_conflicts").select("integration_id, status"),
  ]);

  const list = (rows ?? []) as any[];
  const integrations: IntegrationTelemetry[] = list.map((r) => {
    const st = (states ?? []).filter((s: any) => s.integration_id === r.id) as any[];
    const ev = (events ?? []).filter((e: any) => e.integration_id === r.id) as any[];
    const queue = { pending: 0, processing: 0, failed: 0, dead: 0 };
    let lastEventAt: string | null = null;
    let doneEvents = 0;
    for (const e of ev) {
      if (e.status in queue) (queue as any)[e.status] += 1;
      if (e.status === "done") doneEvents += 1;
      lastEventAt = maxDate(lastEventAt, e.updated_at ?? e.created_at ?? null);
    }

    let processed = 0, created = 0, updated = 0, skipped = 0, failed = 0;
    let lastSyncAt: string | null = null;
    let lastRunAt: string | null = null;
    for (const s of st) {
      const stats = (s.stats ?? {}) as Record<string, unknown>;
      processed += pickStat(stats, ["processed", "total", "fetched"]);
      created += pickStat(stats, ["created", "inserted"]);
      updated += pickStat(stats, ["updated"]);
      skipped += pickStat(stats, ["skipped", "duplicates"]);
      failed += pickStat(stats, ["failed", "errors"]);
      if (s.last_status === "ok" || s.last_status === "success") lastSyncAt = maxDate(lastSyncAt, s.last_sync_at ?? null);
      lastRunAt = maxDate(lastRunAt, s.last_run_at ?? s.last_sync_at ?? null);
    }
    if (!processed) processed = doneEvents;

    const lastSuccessAt = maxDate(r.last_success_at ?? null, lastSyncAt);
    const lastAttemptAt = maxDate(maxDate(lastRunAt, lastEventAt), maxDate(r.last_test_at ?? null, r.last_error_at ?? null));

    return {
      id: r.id,
      providerKey: r.provider_key,
      name: r.name ?? r.provider_key,
      status: r.status ?? "disconnected",
      enabled: Boolean(r.enabled),
      lastSuccessAt,
      lastAttemptAt: maxDate(lastAttemptAt, lastSuccessAt),
      lastError: r.last_error ?? st.find((s: any) => s.last_error)?.last_error ?? null,
      processed,
      created,
      updated,
      skipped,
      failed: failed + queue.failed + queue.dead,
      queue,
      conflicts: (conflicts ?? []).filter((c: any) => c.integration_id === r.id && c.status !== "resolved" && c.status !== "ignored").length,
      entities: st.map((s: any) => ({ entity: s.entity, lastSyncAt: s.last_sync_at ?? null, status: s.last_status ?? null, error: s.last_error ?? null })),
      needsConnection: !lastSuccessAt,
    };
  });

  integrations.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, "uk"));

  const totals = integrations.reduce(
    (acc, i) => ({
      processed: acc.processed + i.processed,
      created: acc.created + i.created,
      updated: acc.updated + i.updated,
      skipped: acc.skipped + i.skipped,
      failed: acc.failed + i.failed,
      conflicts: acc.conflicts + i.conflicts,
      queued: acc.queued + i.queue.pending + i.queue.processing,
    }),
    { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0, conflicts: 0, queued: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    integrations,
    totals,
    lastSuccessAt: integrations.reduce<string | null>((acc, i) => maxDate(acc, i.lastSuccessAt), null),
  };
}
