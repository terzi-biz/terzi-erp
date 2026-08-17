/**
 * Етап 2 — початковий (повний) імпорт keyCRM → ERP TERZI.
 * Імпорт покроковий: одна сторінка за виклик, курсор і лічильники
 * зберігаються в integration_import_runs, тому процес відновлюваний
 * і не впирається в ліміт часу серверної функції.
 */
import { admin } from "../../access.server";
import { logAttempt } from "../core.server";
import type { AdapterContext } from "../adapter.server";
import { KEYCRM_ENTITIES } from "../keycrm-constants";
import { apiClient, applyExternal, entityPath, getSyncModes } from "./sync.server";

/** Порядок імпорту: довідники → клієнти → ліди → замовлення. */
export const IMPORT_ORDER = [
  "pipelines",
  "pipeline_statuses",
  "order_statuses",
  "sources",
  "managers",
  "companies",
  "buyers",
  "lead_cards",
  "orders",
] as const;

export type ImportEntity = (typeof IMPORT_ORDER)[number];

/** Сутності, які keyCRM віддає одним запитом (без сторінок). */
const SINGLE_SHOT = new Set(["pipeline_statuses", "order_statuses", "sources", "managers", "companies"]);

export function importEntityLabel(key: string) {
  return KEYCRM_ENTITIES.find((e) => e.key === key)?.label ?? key;
}

export async function listImportRuns(integrationId: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_import_runs")
    .select("*")
    .eq("integration_id", integrationId);
  const map = new Map((data ?? []).map((r: any) => [r.entity, r]));
  return IMPORT_ORDER.map((entity) => ({
    entity,
    label: importEntityLabel(entity),
    run: map.get(entity) ?? null,
  }));
}

async function upsertRun(integrationId: string, entity: string, patch: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db
    .from("integration_import_runs")
    .upsert({ integration_id: integrationId, entity, ...patch }, { onConflict: "integration_id,entity" });
  if (error) throw error;
}

/** Скидання прогресу перед новим повним імпортом. */
export async function startImport(integrationId: string, entities?: string[]) {
  const list = (entities?.length ? entities : [...IMPORT_ORDER]).filter((e) =>
    (IMPORT_ORDER as readonly string[]).includes(e),
  );
  for (const entity of list) {
    await upsertRun(integrationId, entity, {
      status: "pending",
      page: 0,
      received: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
      last_error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    });
  }
  return { ok: true, entities: list };
}

async function fetchStatuses(ctx: AdapterContext) {
  const client = apiClient(ctx);
  const base = entityPath(ctx, "pipelines");
  const pipelines = await client.paginate(base, { limit: 50 }, 3);
  const out: any[] = [];
  for (const p of pipelines) {
    const rows = await client.paginate(`${base}/${p.id}/statuses`, { limit: 50 }, 3);
    out.push(...rows.map((r: any) => ({ ...r, pipeline_id: r.pipeline_id ?? p.id })));
  }
  return out;
}

/**
 * Імпорт однієї сторінки сутності.
 * Повертає стан прогресу; done = true, коли сторінок більше немає.
 */
export async function importChunk(
  ctx: AdapterContext,
  entity: string,
  opts: { pageSize?: number; dryRun?: boolean; force?: boolean } = {},
) {
  if (!(IMPORT_ORDER as readonly string[]).includes(entity)) {
    throw new Error(`Сутність «${entity}» не входить у початковий імпорт`);
  }
  const integrationId = ctx.integration.id;
  const db = await admin();
  const { data: existing } = await db
    .from("integration_import_runs")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("entity", entity)
    .maybeSingle();
  const run = (existing as any) ?? null;
  if (run?.status === "done") {
    return { entity, done: true, page: run.page, received: run.received, applied: run.applied, skipped: run.skipped, failed: run.failed };
  }

  const pageSize = Number(opts.pageSize ?? run?.page_size ?? 50);
  const nextPage = Number(run?.page ?? 0) + 1;
  const client = apiClient(ctx);

  let items: any[] = [];
  try {
    if (entity === "pipeline_statuses") items = await fetchStatuses(ctx);
    else if (SINGLE_SHOT.has(entity)) items = await client.paginate(entityPath(ctx, entity), { limit: pageSize }, 5);
    else {
      const res = await client.get(entityPath(ctx, entity), { page: nextPage, limit: pageSize });
      items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const total = Number(res?.total ?? res?.meta?.total ?? NaN);
      if (Number.isFinite(total) && !opts.dryRun) await upsertRun(integrationId, entity, { total_estimate: total });
    }
  } catch (e: any) {
    if (!opts.dryRun) {
      await upsertRun(integrationId, entity, { status: "error", last_error: e?.message ?? String(e) });
    }
    throw e;
  }

  if (opts.dryRun) {
    return {
      entity,
      dryRun: true,
      done: true,
      page: nextPage,
      received: items.length,
      applied: 0,
      skipped: items.length,
      failed: 0,
      sample: items.slice(0, 3).map((i: any) => ({ id: i?.id ?? null, title: i?.title ?? i?.name ?? i?.full_name ?? null })),
    };
  }

  const modes = await getSyncModes(integrationId);
  const mode = modes[entity]?.mode === "bidirectional" ? "bidirectional" : "external_master";

  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await applyExternal(ctx, entity, item, mode as any);
      if (res.skipped) skipped += 1;
      else applied += 1;
    } catch (e: any) {
      failed += 1;
      await logAttempt({
        integrationId,
        level: "warn",
        message: `Імпорт keyCRM ${entity}: ${e?.message ?? e}`,
        request: { entity, id: item?.id },
      });
    }
  }

  const done = SINGLE_SHOT.has(entity) || items.length < pageSize;
  const totals = {
    page: nextPage,
    page_size: pageSize,
    received: Number(run?.received ?? 0) + items.length,
    applied: Number(run?.applied ?? 0) + applied,
    skipped: Number(run?.skipped ?? 0) + skipped,
    failed: Number(run?.failed ?? 0) + failed,
  };
  await upsertRun(integrationId, entity, {
    ...totals,
    status: done ? "done" : "running",
    last_error: null,
    started_at: run?.started_at ?? new Date().toISOString(),
    finished_at: done ? new Date().toISOString() : null,
  });

  return { entity, done, ...totals, pageReceived: items.length, pageApplied: applied };
}
