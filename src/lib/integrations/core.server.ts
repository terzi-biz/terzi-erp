/**
 * Ядро інтеграцій: контекст адаптера, секрети, черга подій, повтори,
 * idempotency, маскування чутливих даних у журналі.
 */
import process from "node:process";
import { admin } from "../access.server";
import { getAdapter, type AdapterContext, type IntegrationRow } from "./adapter.server";
import { sha256Hex } from "./signature.server";
import { RETRY_BACKOFF_MIN } from "../integrations-constants";

const SENSITIVE = /(token|secret|password|pass|api[-_]?key|authorization|signature|refresh|client[-_]?secret)/i;
const MAX_PREVIEW = 4000;

export function maskDeep(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => maskDeep(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "***" : maskDeep(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_PREVIEW) return `${value.slice(0, MAX_PREVIEW)}…`;
  return value;
}

/** Секрети живуть лише у змінних середовища; у базі зберігається тільки посилання. */
export function readSecret(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const v = process.env[ref];
  return v && v.length > 0 ? v : null;
}

export function maskHint(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export async function loadIntegration(idOrSlug: string): Promise<IntegrationRow | null> {
  const db = await admin();
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data } = await db
    .from("integrations")
    .select("id,provider_key,name,slug,status,enabled,config")
    .eq(isUuid ? "id" : "slug", idOrSlug)
    .maybeSingle();
  return (data as IntegrationRow | null) ?? null;
}

export async function buildContext(integration: IntegrationRow): Promise<AdapterContext> {
  const db = await admin();
  const { data: refs } = await db
    .from("integration_secrets")
    .select("secret_key,secret_ref")
    .eq("integration_id", integration.id);
  const map = new Map((refs ?? []).map((r: any) => [r.secret_key as string, r.secret_ref as string]));
  return {
    integration,
    config: (integration.config ?? {}) as Record<string, unknown>,
    secret: (key: string) => readSecret(map.get(key)),
  };
}

export async function logAttempt(entry: {
  eventId?: string | null;
  integrationId?: string | null;
  attempt?: number;
  level?: "info" | "warn" | "error";
  message?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  request?: unknown;
  response?: unknown;
}) {
  const db = await admin();
  await db.from("integration_event_logs").insert({
    event_id: entry.eventId ?? null,
    integration_id: entry.integrationId ?? null,
    attempt: entry.attempt ?? 0,
    level: entry.level ?? "info",
    message: entry.message ?? null,
    http_status: entry.httpStatus ?? null,
    duration_ms: entry.durationMs ?? null,
    request_preview: (maskDeep(entry.request) ?? null) as any,
    response_preview: (maskDeep(entry.response) ?? null) as any,
  });
}

export type EnqueueInput = {
  integrationId: string | null;
  providerKey: string | null;
  direction: "inbound" | "outbound";
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

/** Ідемпотентна постановка події в чергу: дублікат не створює нового запису. */
export async function enqueueEvent(input: EnqueueInput): Promise<{ id: string | null; duplicate: boolean }> {
  const db = await admin();
  const dedupHash = await sha256Hex(
    `${input.integrationId ?? ""}|${input.eventType}|${JSON.stringify(input.payload ?? {})}`,
  );
  const key = input.idempotencyKey ?? `${input.integrationId ?? "sys"}:${dedupHash}`;

  const { data: existing } = await db.from("integration_events").select("id").eq("idempotency_key", key).maybeSingle();
  if (existing) return { id: (existing as any).id as string, duplicate: true };

  const { data, error } = await db
    .from("integration_events")
    .insert({
      integration_id: input.integrationId,
      provider_key: input.providerKey,
      direction: input.direction,
      event_type: input.eventType,
      payload: input.payload as any,
      idempotency_key: key,
      dedup_hash: dedupHash,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      status: "pending",
      next_retry_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Гонка: паралельний запит уже створив подію з тим самим ключем.
    const { data: again } = await db.from("integration_events").select("id").eq("idempotency_key", key).maybeSingle();
    if (again) return { id: (again as any).id as string, duplicate: true };
    throw error;
  }
  return { id: (data as any)?.id ?? null, duplicate: false };
}

function nextRetryIso(attempt: number): string {
  const minutes = RETRY_BACKOFF_MIN[Math.min(attempt, RETRY_BACKOFF_MIN.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Обробка однієї події. Повертає підсумковий статус. */
export async function processEvent(eventId: string): Promise<{ status: string; message?: string }> {
  const db = await admin();
  const { data: ev } = await db.from("integration_events").select("*").eq("id", eventId).maybeSingle();
  if (!ev) return { status: "missing" };
  const event = ev as any;
  if (event.status === "done") return { status: "done" };

  const attempt = (event.attempt ?? 0) + 1;
  await db.from("integration_events").update({ status: "processing", locked_at: new Date().toISOString() }).eq("id", eventId);

  const started = Date.now();
  let ok = false;
  let message = "";
  let data: unknown = null;

  try {
    const integration = event.integration_id ? await loadIntegration(event.integration_id) : null;
    if (!integration) throw new Error("Підключення не знайдено");
    if (!integration.enabled) throw new Error("Інтеграцію вимкнено");
    const adapter = getAdapter(integration.provider_key);
    if (!adapter) throw new Error(`Адаптер «${integration.provider_key}» ще не реалізовано`);
    const ctx = await buildContext(integration);
    const handler = event.direction === "inbound" ? adapter.handleInbound : adapter.send;
    if (!handler) throw new Error("Адаптер не підтримує цей напрям подій");
    const res = await handler(ctx, (event.payload ?? {}) as Record<string, unknown>, event.event_type);
    ok = res.ok;
    message = res.message ?? "";
    data = res.data ?? null;
    if (!ok) throw new Error(message || "Адаптер повернув помилку");
  } catch (e: any) {
    ok = false;
    message = e?.message ?? String(e);
  }

  const duration = Date.now() - started;
  const maxAttempts = event.max_attempts ?? 5;
  const status = ok ? "done" : attempt >= maxAttempts ? "dead" : "failed";

  await db
    .from("integration_events")
    .update({
      status,
      attempt,
      locked_at: null,
      last_error: ok ? null : message,
      result: ok ? ((maskDeep(data) ?? null) as any) : null,
      next_retry_at: ok || status === "dead" ? event.next_retry_at : nextRetryIso(attempt),
    })
    .eq("id", eventId);

  await logAttempt({
    eventId,
    integrationId: event.integration_id,
    attempt,
    level: ok ? "info" : status === "dead" ? "error" : "warn",
    message: message || (ok ? "Успішно" : null),
    durationMs: duration,
    request: event.payload,
    response: data,
  });

  if (event.integration_id) {
    await db
      .from("integrations")
      .update(
        ok
          ? { last_success_at: new Date().toISOString(), status: "active", last_error: null }
          : { last_error: message, last_error_at: new Date().toISOString(), status: status === "dead" ? "error" : undefined },
      )
      .eq("id", event.integration_id);
  }

  return { status, message };
}

/** Завершує подію, яку маршрут уже успішно обробив синхронно. */
export async function completeEvent(eventId: string | null, result: unknown): Promise<void> {
  if (!eventId) return;
  const db = await admin();
  await db
    .from("integration_events")
    .update({
      status: "done",
      locked_at: null,
      last_error: null,
      result: (maskDeep(result) ?? null) as any,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", eventId);
}

/** Тік черги: невелика пачка, щоб уміщатися в ліміти serverless-воркера. */
export async function runQueue(limit = 10): Promise<{ processed: number; done: number; failed: number }> {
  const db = await admin();
  const { data } = await db
    .from("integration_events")
    .select("id")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(Math.min(limit, 25));

  let done = 0;
  let failed = 0;
  for (const row of (data ?? []) as any[]) {
    const res = await processEvent(row.id);
    if (res.status === "done") done += 1;
    else failed += 1;
  }
  return { processed: (data ?? []).length, done, failed };
}

/** Перевірка з'єднання з UI. */
export async function testIntegration(integrationId: string): Promise<{ ok: boolean; message: string }> {
  const db = await admin();
  const integration = await loadIntegration(integrationId);
  if (!integration) return { ok: false, message: "Підключення не знайдено" };
  const adapter = getAdapter(integration.provider_key);
  let ok = false;
  let message = "";
  const started = Date.now();
  try {
    if (!adapter) throw new Error(`Адаптер «${integration.provider_key}» ще не реалізовано`);
    if (!adapter.testConnection) throw new Error("Адаптер не підтримує перевірку з'єднання");
    const ctx = await buildContext(integration);
    const res = await adapter.testConnection(ctx);
    ok = res.ok;
    message = res.message ?? (ok ? "З'єднання успішне" : "Помилка з'єднання");
  } catch (e: any) {
    message = e?.message ?? String(e);
  }
  await db
    .from("integrations")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: ok,
      status: ok ? (integration.enabled ? "active" : "disabled") : "error",
      last_error: ok ? null : message,
      last_error_at: ok ? null : new Date().toISOString(),
    })
    .eq("id", integrationId);
  await logAttempt({
    integrationId,
    level: ok ? "info" : "error",
    message: `Перевірка з'єднання: ${message}`,
    durationMs: Date.now() - started,
  });
  return { ok, message };
}
