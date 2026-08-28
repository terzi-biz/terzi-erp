/** Операції модуля «Інтеграції та API» (лише сервер). */
import { admin, loadActor, requireAccessManager, requirePermission, writeAudit } from "../access.server";
import { buildContext, enqueueEvent, loadIntegration, maskHint, processEvent, readSecret, runQueue, testIntegration } from "./core.server";
import { getAdapter, listAdapterKeys } from "./adapter.server";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "integration"
  );
}

async function canView(userId: string) {
  const actor = await loadActor(userId);
  if (actor.canManage) return actor;
  return requirePermission(userId, "integrations", "view");
}

export async function listProvidersOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db.from("integration_providers").select("*").order("sort_order");
  const implemented = new Set(listAdapterKeys());
  return (data ?? []).map((p: any) => ({ ...p, has_adapter: implemented.has(p.key) }));
}

export async function listIntegrationsOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const [{ data: rows }, { data: providers }, { data: hooks }, { data: secrets }] = await Promise.all([
    db.from("integrations").select("*").order("created_at", { ascending: true }),
    db.from("integration_providers").select("key,name,auth_kind,category,supports_inbound,supports_outbound"),
    db.from("integration_webhooks").select("*"),
    db.from("integration_secrets").select("id,integration_id,secret_key,secret_ref,masked_hint,rotated_at"),
  ]);
  const pMap = new Map((providers ?? []).map((p: any) => [p.key, p]));
  const implemented = new Set(listAdapterKeys());
  return (rows ?? []).map((r: any) => ({
    ...r,
    provider_name: pMap.get(r.provider_key)?.name ?? r.provider_key,
    auth_kind: pMap.get(r.provider_key)?.auth_kind ?? "api_key",
    has_adapter: implemented.has(r.provider_key),
    webhooks: (hooks ?? []).filter((h: any) => h.integration_id === r.id),
    secrets: (secrets ?? [])
      .filter((s: any) => s.integration_id === r.id)
      .map((s: any) => ({ ...s, is_set: Boolean(readSecret(s.secret_ref)) })),
  }));
}

export async function createIntegrationOp(
  userId: string,
  input: { providerKey: string; name: string; config?: Record<string, unknown> },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const base = slugify(`${input.providerKey}-${input.name}`);
  let slug = base;
  for (let i = 2; i < 40; i++) {
    const { data: taken } = await db.from("integrations").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  const { data, error } = await db
    .from("integrations")
    .insert({
      provider_key: input.providerKey,
      name: input.name,
      slug,
      config: (input.config ?? {}) as any,
      created_by: userId,
      status: "disconnected",
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: "create",
    entityType: "integration",
    entityId: (data as any)?.id,
    entityLabel: input.name,
    newValue: { provider: input.providerKey, slug },
    isCritical: true,
  });
  return data;
}

export async function updateIntegrationOp(
  userId: string,
  input: { id: string; name?: string; enabled?: boolean; config?: Record<string, unknown>; status?: string },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { data: before } = await db.from("integrations").select("*").eq("id", input.id).maybeSingle();
  if (!before) throw new Error("Підключення не знайдено");
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.config !== undefined) patch.config = input.config;
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
    patch.status = input.enabled ? ((before as any).last_test_ok ? "active" : "connecting") : "disabled";
  }
  if (input.status !== undefined) patch.status = input.status;
  const { data, error } = await db.from("integrations").update(patch as any).eq("id", input.id).select("*").maybeSingle();
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: input.enabled !== undefined ? (input.enabled ? "enable" : "disable") : "update",
    entityType: "integration",
    entityId: input.id,
    entityLabel: (before as any).name,
    oldValue: { name: (before as any).name, enabled: (before as any).enabled, config: (before as any).config },
    newValue: patch,
    isCritical: true,
  });
  return data;
}

export async function deleteIntegrationOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { data: before } = await db.from("integrations").select("name,provider_key").eq("id", id).maybeSingle();
  const { error } = await db.from("integrations").delete().eq("id", id);
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: "delete",
    entityType: "integration",
    entityId: id,
    entityLabel: (before as any)?.name ?? null,
    oldValue: before,
    isCritical: true,
  });
  return { ok: true };
}

export async function testIntegrationOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const res = await testIntegration(id);
  await writeAudit(actor, {
    module: "integrations",
    action: "test",
    entityType: "integration",
    entityId: id,
    newValue: { ok: res.ok, message: res.message },
  });
  return res;
}

/** Секрети зберігаються лише у сховищі секретів; тут — прив'язка ключа до змінної. */
export async function setSecretRefOp(userId: string, input: { integrationId: string; secretKey: string; secretRef: string }) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const value = readSecret(input.secretRef);
  const { error } = await db
    .from("integration_secrets")
    .upsert(
      {
        integration_id: input.integrationId,
        secret_key: input.secretKey,
        secret_ref: input.secretRef,
        masked_hint: maskHint(value),
        rotated_at: new Date().toISOString(),
        updated_by: userId,
        updated_by_name: actor.name,
      },
      { onConflict: "integration_id,secret_key" },
    );
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: "secret_bind",
    entityType: "integration",
    entityId: input.integrationId,
    newValue: { key: input.secretKey, ref: input.secretRef, present: Boolean(value) },
    isCritical: true,
  });
  return { ok: true, present: Boolean(value) };
}

export async function removeSecretRefOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { data: before } = await db.from("integration_secrets").select("*").eq("id", id).maybeSingle();
  await db.from("integration_secrets").delete().eq("id", id);
  await writeAudit(actor, {
    module: "integrations",
    action: "secret_unbind",
    entityType: "integration",
    entityId: (before as any)?.integration_id ?? null,
    oldValue: { key: (before as any)?.secret_key, ref: (before as any)?.secret_ref },
    isCritical: true,
  });
  return { ok: true };
}

export async function saveWebhookOp(
  userId: string,
  input: {
    id?: string;
    integrationId: string;
    direction: "inbound" | "outbound";
    targetUrl?: string | null;
    events?: string[];
    signatureMode?: string;
    signatureHeader?: string | null;
    secretRef?: string | null;
    enabled?: boolean;
  },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const payload: Record<string, unknown> = {
    integration_id: input.integrationId,
    direction: input.direction,
    target_url: input.targetUrl ?? null,
    events: (input.events ?? []) as any,
    signature_mode: input.signatureMode ?? "hmac_sha256",
    signature_header: input.signatureHeader ?? "x-signature",
    secret_ref: input.secretRef ?? null,
    enabled: input.enabled ?? true,
  };
  if (!input.id && input.direction === "inbound") {
    const integration = await loadIntegration(input.integrationId);
    const base = slugify(`${integration?.slug ?? "hook"}`);
    let slug = base;
    for (let i = 2; i < 40; i++) {
      const { data: taken } = await db.from("integration_webhooks").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    payload.slug = slug;
  }
  const q = input.id
    ? db.from("integration_webhooks").update(payload as any).eq("id", input.id)
    : db.from("integration_webhooks").insert(payload as any);
  const { data, error } = await q.select("*").maybeSingle();
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: input.id ? "webhook_update" : "webhook_create",
    entityType: "integration_webhook",
    entityId: (data as any)?.id ?? null,
    newValue: { ...payload, secret_ref: input.secretRef ? "***" : null },
    isCritical: true,
  });
  return data;
}

export async function deleteWebhookOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  await db.from("integration_webhooks").delete().eq("id", id);
  await writeAudit(actor, { module: "integrations", action: "webhook_delete", entityType: "integration_webhook", entityId: id, isCritical: true });
  return { ok: true };
}

export async function listMappingsOp(userId: string, integrationId: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db
    .from("integration_field_mappings")
    .select("*")
    .eq("integration_id", integrationId)
    .order("entity")
    .order("sort_order");
  return data ?? [];
}

export async function saveMappingOp(
  userId: string,
  input: {
    id?: string;
    integrationId: string;
    entity: string;
    direction: "inbound" | "outbound";
    sourceField: string;
    targetField: string;
    transform?: string | null;
    defaultValue?: string | null;
    required?: boolean;
  },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const payload = {
    integration_id: input.integrationId,
    entity: input.entity,
    direction: input.direction,
    source_field: input.sourceField,
    target_field: input.targetField,
    transform: input.transform ?? null,
    default_value: input.defaultValue ?? null,
    required: input.required ?? false,
  };
  const q = input.id
    ? db.from("integration_field_mappings").update(payload).eq("id", input.id)
    : db.from("integration_field_mappings").insert(payload);
  const { data, error } = await q.select("*").maybeSingle();
  if (error) throw error;
  await writeAudit(actor, {
    module: "integrations",
    action: input.id ? "mapping_update" : "mapping_create",
    entityType: "integration_mapping",
    entityId: (data as any)?.id ?? null,
    newValue: payload,
  });
  return data;
}

export async function deleteMappingOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  await db.from("integration_field_mappings").delete().eq("id", id);
  await writeAudit(actor, { module: "integrations", action: "mapping_delete", entityType: "integration_mapping", entityId: id });
  return { ok: true };
}

export async function listEventsOp(
  userId: string,
  filters: { integrationId?: string | null; status?: string | null; direction?: string | null; search?: string | null; limit?: number },
) {
  await canView(userId);
  const db = await admin();
  let q = db.from("integration_events").select("*").order("created_at", { ascending: false }).limit(filters.limit ?? 100);
  if (filters.integrationId) q = q.eq("integration_id", filters.integrationId);
  if (filters.status) q = q.eq("status", filters.status as any);
  if (filters.direction) q = q.eq("direction", filters.direction as any);
  if (filters.search) {
    const safe = filters.search.replace(/[%,()]/g, " ").trim();
    if (safe) q = q.ilike("event_type", `%${safe}%`);
  }
  const { data } = await q;
  return data ?? [];
}

export async function listEventLogsOp(userId: string, eventId: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db
    .from("integration_event_logs")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function retryEventOp(userId: string, eventId: string) {
  const actor = await loadActor(userId);
  if (!actor.canManage) await requirePermission(userId, "integrations", "retry");
  const db = await admin();
  // Непідтримувану подію не можна повторити навіть вручну: вона термінальна
  // і не має створювати CRM-наслідків.
  const { data: current } = await db
    .from("integration_events")
    .select("id,unsupported,event_type")
    .eq("id", eventId)
    .maybeSingle();
  if (!current) throw new Error("Подію не знайдено");
  if ((current as any).unsupported) {
    return {
      status: "unsupported_event",
      message: `Подію «${(current as any).event_type}» не підтримано — ручний повтор недоступний`,
    };
  }
  await db
    .from("integration_events")
    .update({ status: "pending", next_retry_at: new Date().toISOString(), locked_at: null })
    .eq("id", eventId);
  const res = await processEvent(eventId, { force: true });
  await writeAudit(actor, {
    module: "integrations",
    action: "event_retry",
    entityType: "integration_event",
    entityId: eventId,
    newValue: res,
  });
  return res;
}

export async function cancelEventOp(userId: string, eventId: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  await db.from("integration_events").update({ status: "dead", last_error: "Скасовано вручну" }).eq("id", eventId);
  await writeAudit(actor, { module: "integrations", action: "event_cancel", entityType: "integration_event", entityId: eventId });
  return { ok: true };
}

/** Ручна постановка тестової події (для перевірки ядра). */
export async function enqueueTestEventOp(userId: string, input: { integrationId: string; eventType: string; payload?: Record<string, unknown> }) {
  const actor = await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  const res = await enqueueEvent({
    integrationId: integration.id,
    providerKey: integration.provider_key,
    direction: "outbound",
    eventType: input.eventType,
    payload: input.payload ?? {},
  });
  await writeAudit(actor, {
    module: "integrations",
    action: "event_enqueue",
    entityType: "integration_event",
    entityId: res.id,
    newValue: { type: input.eventType, duplicate: res.duplicate },
  });
  if (res.id && !res.duplicate) await processEvent(res.id);
  return res;
}

export async function queueStatsOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const { data } = await db.from("integration_events").select("status");
  const stats: Record<string, number> = { pending: 0, processing: 0, done: 0, failed: 0, dead: 0 };
  for (const r of (data ?? []) as any[]) stats[r.status] = (stats[r.status] ?? 0) + 1;
  return stats;
}

export async function runQueueOp(userId: string) {
  const actor = await requireAccessManager(userId);
  const res = await runQueue(10);
  await writeAudit(actor, { module: "integrations", action: "queue_run", newValue: res });
  return res;
}

/** Старт OAuth: створюємо одноразовий state і повертаємо URL авторизації провайдера. */
export async function startOAuthOp(userId: string, input: { integrationId: string; redirectUri: string }) {
  const actor = await requireAccessManager(userId);
  const integration = await loadIntegration(input.integrationId);
  if (!integration) throw new Error("Підключення не знайдено");
  const adapter = getAdapter(integration.provider_key);
  if (!adapter) throw new Error(`Адаптер «${integration.provider_key}» ще не реалізовано`);
  const ctx = await buildContext(integration);
  const authUrl = (ctx.config as any)?.auth_url as string | undefined;
  if (!authUrl) throw new Error("У налаштуваннях підключення не задано auth_url");

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const db = await admin();
  await db.from("integration_oauth_states").insert({
    state,
    integration_id: integration.id,
    redirect_uri: input.redirectUri,
    created_by: userId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  await writeAudit(actor, { module: "integrations", action: "oauth_start", entityType: "integration", entityId: integration.id, isCritical: true });

  const clientId = (ctx.config as any)?.client_id ?? "";
  const scope = (ctx.config as any)?.scope ?? "";
  const url = new URL(authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", String(clientId));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", state);
  if (scope) url.searchParams.set("scope", String(scope));
  return { url: url.toString() };
}
