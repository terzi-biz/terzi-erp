/** Операції синхронізації та підготовки провайдерів (лише сервер). */
import { admin, loadActor, requireAccessManager, requirePermission, writeAudit } from "../access.server";
import { buildContext, enqueueEvent, loadIntegration, processEvent } from "./core.server";
import { getAdapter } from "./adapter.server";
import { runKeyCrmSync } from "./keycrm/sync.server";
import { KEYCRM_ENTITIES, type SyncMode } from "./keycrm-constants";

async function canView(userId: string) {
  const actor = await loadActor(userId);
  if (actor.canManage) return actor;
  return requirePermission(userId, "integrations", "view");
}

/* ----------------------------- sync settings ----------------------------- */

export async function listSyncSettingsOp(userId: string, integrationId: string) {
  await canView(userId);
  const db = await admin();
  const [{ data: settings }, { data: state }] = await Promise.all([
    db.from("integration_sync_settings").select("*").eq("integration_id", integrationId),
    db.from("integration_sync_state").select("*").eq("integration_id", integrationId),
  ]);
  const sMap = new Map((settings ?? []).map((s: any) => [s.entity, s]));
  const stMap = new Map((state ?? []).map((s: any) => [s.entity, s]));
  return KEYCRM_ENTITIES.map((e) => ({
    entity: e.key,
    label: e.label,
    target: e.target,
    outbound: e.outbound,
    note: e.note ?? null,
    mode: (sMap.get(e.key)?.mode ?? "off") as SyncMode,
    poll_enabled: sMap.get(e.key)?.poll_enabled ?? false,
    poll_interval_min: sMap.get(e.key)?.poll_interval_min ?? 15,
    last_sync_at: stMap.get(e.key)?.last_sync_at ?? null,
    last_status: stMap.get(e.key)?.last_status ?? null,
    last_error: stMap.get(e.key)?.last_error ?? null,
    stats: stMap.get(e.key)?.stats ?? {},
  }));
}

export async function saveSyncSettingOp(
  userId: string,
  input: { integrationId: string; entity: string; mode: SyncMode; pollEnabled?: boolean; pollIntervalMin?: number },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { error } = await db.from("integration_sync_settings").upsert(
    {
      integration_id: input.integrationId,
      entity: input.entity,
      mode: input.mode,
      poll_enabled: input.pollEnabled ?? false,
      poll_interval_min: input.pollIntervalMin ?? 15,
    },
    { onConflict: "integration_id,entity" },
  );
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: "sync_settings",
    entityType: "integration",
    entityId: input.integrationId,
    newValue: { entity: input.entity, mode: input.mode, poll: input.pollEnabled },
  });
  return { ok: true };
}

/* -------------------------------- run sync ------------------------------- */

export async function runSyncOp(userId: string, input: { integrationId: string; entities?: string[]; full?: boolean; dryRun?: boolean }) {
  const actor = await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  if (integration.provider_key !== "keycrm") throw new Error("Синхронізація доступна лише для keyCRM");
  const ctx = await buildContext(integration);
  const results = await runKeyCrmSync(ctx, { entities: input.entities, full: input.full, dryRun: input.dryRun });
  await writeAudit(actor, {
    module: "integrations",
    action: input.dryRun ? "sync_dry_run" : "sync_run",
    entityType: "integration",
    entityId: integration.id,
    newValue: { entities: input.entities ?? "auto", dryRun: Boolean(input.dryRun), results },
  });
  return results;
}

/* ------------------- односторонній режим keyCRM → ERP -------------------- */

/** Стан одностороннього режиму + дані вхідного вебхука. */
export async function getOneWayStatusOp(userId: string, integrationId: string) {
  await canView(userId);
  const db = await admin();
  const integration = await loadIntegration(integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  const { data: hook } = await db
    .from("integration_webhooks")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("direction", "inbound")
    .maybeSingle();
  const { data: settings } = await db
    .from("integration_sync_settings")
    .select("entity,mode")
    .eq("integration_id", integrationId);
  const outbound = (settings ?? []).filter((s: any) => s.mode === "erp_master" || s.mode === "bidirectional");
  return {
    one_way: Boolean(((integration.config ?? {}) as any).one_way_inbound),
    outbound_entities: outbound.map((s: any) => s.entity),
    webhook: hook
      ? {
          slug: (hook as any).slug,
          enabled: (hook as any).enabled,
          token: (hook as any).endpoint_token ?? null,
          last_call_at: (hook as any).last_call_at ?? null,
          events: KEYCRM_WEBHOOK_EVENTS.map((e) => e.key),
        }
      : null,
  };
}

/**
 * Вмикає односторонню синхронізацію keyCRM → ERP:
 * усі сутності переводяться в режим «keyCRM — головна», зворотний запис
 * блокується, а вхідний вебхук вмикається з секретним токеном.
 */
export async function setOneWayInboundOp(userId: string, input: { integrationId: string; enabled: boolean }) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  if (integration.provider_key !== "keycrm") throw new Error("Доступно лише для keyCRM");

  if (input.enabled) {
    for (const e of KEYCRM_ENTITIES) {
      await db.from("integration_sync_settings").upsert(
        { integration_id: integration.id, entity: e.key, mode: "external_master" as SyncMode, poll_enabled: true, poll_interval_min: 15 },
        { onConflict: "integration_id,entity" },
      );
    }
  }

  await db
    .from("integrations")
    .update({ config: { ...((integration.config ?? {}) as Record<string, unknown>), one_way_inbound: input.enabled } as any })
    .eq("id", integration.id);

  // Вхідний вебхук: створюємо за потреби і гарантуємо наявність токена
  const { data: hook } = await db
    .from("integration_webhooks")
    .select("*")
    .eq("integration_id", integration.id)
    .eq("direction", "inbound")
    .maybeSingle();

  let row: any = hook;
  const token = (hook as any)?.endpoint_token ?? `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  if (!hook) {
    const slug = `keycrm-${integration.id.slice(0, 8)}`;
    const { data: created } = await db
      .from("integration_webhooks")
      .insert({
        integration_id: integration.id,
        direction: "inbound",
        slug,
        enabled: input.enabled,
        signature_mode: "token",
        signature_header: "x-endpoint-token",
        endpoint_token: token,
        events: KEYCRM_WEBHOOK_EVENTS.map((e) => e.key) as any,
      } as any)
      .select("*")
      .maybeSingle();
    row = created;
  } else {
    const { data: updated } = await db
      .from("integration_webhooks")
      .update({
        enabled: input.enabled,
        endpoint_token: token,
        signature_mode: "token",
        signature_header: "x-endpoint-token",
        events: KEYCRM_WEBHOOK_EVENTS.map((e) => e.key) as any,
      } as any)
      .eq("id", (hook as any).id)
      .select("*")
      .maybeSingle();
    row = updated;
  }

  await writeAudit(actor, {
    module: "integrations",
    action: input.enabled ? "sync_one_way_on" : "sync_one_way_off",
    entityType: "integration",
    entityId: integration.id,
    newValue: { one_way_inbound: input.enabled },
    isCritical: true,
  });

  return {
    ok: true,
    one_way: input.enabled,
    webhook: row ? { slug: row.slug, token: row.endpoint_token, enabled: row.enabled, events: KEYCRM_WEBHOOK_EVENTS.map((e) => e.key) } : null,
  };
}

export async function pushRecordOp(userId: string, input: { integrationId: string; entity: string; internalId: string }) {
  const actor = await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  if (((integration.config ?? {}) as any).one_way_inbound) {
    throw new Error("Увімкнено односторонній режим keyCRM → ERP: зворотний запис заблоковано");
  }
  const res = await enqueueEvent({

    integrationId: integration.id,
    providerKey: integration.provider_key,
    direction: "outbound",
    eventType: "keycrm.push",
    payload: { entity: input.entity, internalId: input.internalId },
    idempotencyKey: `push:${integration.id}:${input.entity}:${input.internalId}:${Date.now()}`,
  });
  if (res.id) await processEvent(res.id);
  await writeAudit(actor, {
    module: "integrations",
    action: "sync_push",
    entityType: "integration",
    entityId: integration.id,
    newValue: input,
  });
  return res;
}

/* ------------------------------- conflicts ------------------------------- */

export async function listConflictsOp(userId: string, integrationId?: string | null) {
  await canView(userId);
  const db = await admin();
  let q = db.from("integration_conflicts").select("*").order("created_at", { ascending: false }).limit(100);
  if (integrationId) q = q.eq("integration_id", integrationId);
  const { data } = await q;
  return data ?? [];
}

export async function resolveConflictOp(userId: string, input: { id: string; resolution: "keep_erp" | "keep_external" | "ignore" }) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { data: row } = await db.from("integration_conflicts").select("*").eq("id", input.id).maybeSingle();
  if (!row) throw new Error("Конфлікт не знайдено");
  const c = row as any;

  if (input.resolution === "keep_external") {
    const integration = await loadIntegration(c.integration_id);
    if (integration) {
      const ctx = await buildContext(integration);
      const { applyExternal } = await import("./keycrm/sync.server");
      await applyExternal(ctx, c.entity, c.external_value, "external_master");
    }
  } else if (input.resolution === "keep_erp" && c.internal_id) {
    await pushRecordOp(userId, { integrationId: c.integration_id, entity: c.entity, internalId: c.internal_id });
  }

  await db
    .from("integration_conflicts")
    .update({ status: input.resolution === "ignore" ? "ignored" : "resolved", resolution: input.resolution, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("id", input.id);
  await writeAudit(actor, { module: "integrations", action: "conflict_resolve", entityType: "integration", entityId: c.integration_id, newValue: input });
  return { ok: true };
}

/* ------------------------------- line map -------------------------------- */

export async function listLineMapOp(userId: string, integrationId: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db.from("integration_line_map").select("*").eq("integration_id", integrationId).order("extension");
  return data ?? [];
}

export async function saveLineMapOp(
  userId: string,
  input: { integrationId: string; extension: string; userId?: string | null; displayName?: string | null; companyNumber?: string | null },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { error } = await db.from("integration_line_map").upsert(
    {
      integration_id: input.integrationId,
      extension: input.extension,
      user_id: input.userId ?? null,
      display_name: input.displayName ?? null,
      company_number: input.companyNumber ?? null,
    },
    { onConflict: "integration_id,extension" },
  );
  if (error) throw error;
  await writeAudit(actor, { module: "integrations", action: "line_map_save", entityType: "integration", entityId: input.integrationId, newValue: input });
  return { ok: true };
}

export async function deleteLineMapOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  await db.from("integration_line_map").delete().eq("id", id);
  await writeAudit(actor, { module: "integrations", action: "line_map_delete", entityType: "integration_line", entityId: id });
  return { ok: true };
}

/* ---------------------------- provider manifest --------------------------- */

export async function getProviderManifestOp(userId: string, providerKey: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db.from("integration_providers").select("key,name,manifest,docs_url,description").eq("key", providerKey).maybeSingle();
  return data ?? null;
}

export async function saveProviderManifestOp(userId: string, input: { providerKey: string; manifest: Record<string, unknown> }) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { error } = await db.from("integration_providers").update({ manifest: input.manifest as any }).eq("key", input.providerKey);
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: "provider_manifest",
    entityType: "integration_provider",
    entityId: input.providerKey,
    newValue: { keys: Object.keys(input.manifest) },
    isCritical: true,
  });
  return { ok: true };
}

/* --------------------------- adapter self-test ---------------------------- */

/** Тестування окремих функцій адаптера з інтерфейсу. */
export async function adapterSelfTestOp(userId: string, input: { integrationId: string; action: string; payload?: Record<string, unknown> }) {
  await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  const adapter = getAdapter(integration.provider_key);
  if (!adapter) throw new Error("Адаптер не зареєстровано");
  const ctx = await buildContext(integration);

  if (input.action === "connection") {
    if (!adapter.testConnection) return { ok: false, message: "Адаптер не підтримує перевірку зʼєднання" };
    return await adapter.testConnection(ctx);
  }
  if (input.action === "normalize") {
    if (!adapter.normalizeEvent) return { ok: false, message: "Адаптер не підтримує нормалізацію" };
    const norm = adapter.normalizeEvent(ctx, input.payload ?? {}, new Headers());
    return { ok: true, message: `Подія: ${norm.eventType}`, data: norm };
  }
  if (input.action === "inbound") {
    if (!adapter.handleInbound) return { ok: false, message: "Адаптер не підтримує вхідні події" };
    const norm = adapter.normalizeEvent
      ? adapter.normalizeEvent(ctx, input.payload ?? {}, new Headers())
      : { eventType: "test", payload: (input.payload ?? {}) as Record<string, unknown> };
    return await adapter.handleInbound(ctx, norm.payload, norm.eventType);
  }
  if (input.action === "outbound") {
    if (!adapter.send) return { ok: false, message: "Адаптер не підтримує вихідні події" };
    return await adapter.send(ctx, input.payload ?? {}, String(input.payload?.eventType ?? "keycrm.ping"));
  }
  return { ok: false, message: `Невідома дія: ${input.action}` };
}

/* --------------------------- scheduled polling ---------------------------- */

/** Викликається воркером: опитування keyCRM за інтервалами. */
export async function runDuePolls(): Promise<any[]> {
  const db = await admin();
  const { data: integrations } = await db
    .from("integrations")
    .select("id,provider_key,name,enabled")
    .eq("provider_key", "keycrm")
    .eq("enabled", true);

  const out: any[] = [];
  for (const row of (integrations ?? []) as any[]) {
    const [{ data: settings }, { data: state }] = await Promise.all([
      db.from("integration_sync_settings").select("*").eq("integration_id", row.id).eq("poll_enabled", true),
      db.from("integration_sync_state").select("entity,last_run_at").eq("integration_id", row.id),
    ]);
    const runMap = new Map((state ?? []).map((s: any) => [s.entity, s.last_run_at]));
    const due = (settings ?? []).filter((s: any) => {
      if (s.mode === "off" || s.mode === "erp_master") return false;
      const last = runMap.get(s.entity);
      return !last || Date.now() - new Date(last as string).getTime() >= s.poll_interval_min * 60_000;
    });
    if (!due.length) continue;
    const integration = await loadIntegration(row.id);
    if (!integration) continue;
    const ctx = await buildContext(integration);
    out.push({ integration: row.name, results: await runKeyCrmSync(ctx, { entities: due.map((d: any) => d.entity) }) });
  }
  return out;
}

/* ------------------------ початковий імпорт keyCRM ------------------------ */

export async function listImportRunsOp(userId: string, integrationId: string) {
  await canView(userId);
  const { listImportRuns } = await import("./keycrm/import.server");
  return listImportRuns(integrationId);
}

export async function startImportOp(userId: string, input: { integrationId: string; entities?: string[] }) {
  const actor = await requireAccessManager(userId);
  const { startImport } = await import("./keycrm/import.server");
  const res = await startImport(input.integrationId, input.entities);
  await writeAudit(actor, {
    module: "integrations",
    action: "import_start",
    entityType: "integration",
    entityId: input.integrationId,
    newValue: res,
    isCritical: true,
  });
  return res;
}

export async function importChunkOp(
  userId: string,
  input: { integrationId: string; entity: string; pageSize?: number; dryRun?: boolean },
) {
  await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  const ctx = await buildContext(integration);
  const { importChunk } = await import("./keycrm/import.server");
  return importChunk(ctx, input.entity, { pageSize: input.pageSize, dryRun: input.dryRun });
}
