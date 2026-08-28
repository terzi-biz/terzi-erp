/**
 * Чисті правила єдиного Webhook Core (без БД, придатні для тестів).
 * Використовуються ядром `core.server.ts`; другого ядра не створюємо.
 */
import { replayWindowMinutes } from "../integrations-constants";

export type IdempotencySource = "provider_event_id" | "adapter_key" | "payload_hash";

export type IdempotencyInput = {
  providerKey: string | null | undefined;
  integrationId: string | null | undefined;
  eventType: string;
  providerEventId?: string | null;
  adapterKey?: string | null;
  payloadHash: string;
};

/**
 * Ідемпотентність: спершу provider + provider_event_id, потім ключ адаптера,
 * інакше детермінований fallback provider/eventType/payload hash.
 */
export function buildIdempotencyKey(input: IdempotencyInput): { key: string; source: IdempotencySource } {
  const provider = input.providerKey ?? input.integrationId ?? "sys";
  if (input.providerEventId) {
    return { key: `${provider}:${input.providerEventId}`, source: "provider_event_id" };
  }
  if (input.adapterKey) return { key: input.adapterKey, source: "adapter_key" };
  return { key: `${provider}:${input.eventType}:${input.payloadHash}`, source: "payload_hash" };
}

export type ReplayCheck = { replay: boolean; ageMs: number | null; windowMin: number; reason: string | null };

/** Перевірка event_ts у межах provider-specific вікна (майбутнє понад 5 хв теж відхиляємо). */
export function checkReplayWindow(
  providerKey: string | null | undefined,
  eventTs: string | number | Date | null | undefined,
  now: number = Date.now(),
): ReplayCheck {
  const windowMin = replayWindowMinutes(providerKey);
  if (eventTs == null || eventTs === "") return { replay: false, ageMs: null, windowMin, reason: null };
  const ts = eventTs instanceof Date ? eventTs.getTime() : new Date(eventTs).getTime();
  if (!Number.isFinite(ts)) return { replay: false, ageMs: null, windowMin, reason: null };
  const ageMs = now - ts;
  if (ageMs > windowMin * 60_000) {
    return { replay: true, ageMs, windowMin, reason: `Подія старша за вікно ${windowMin} хв` };
  }
  if (ageMs < -5 * 60_000) {
    return { replay: true, ageMs, windowMin, reason: "Час події у майбутньому" };
  }
  return { replay: false, ageMs, windowMin, reason: null };
}

export type ErrorClass = "retryable" | "permanent" | "unsupported";

const PERMANENT_MARKERS = [
  "не знайдено",
  "вимкнено",
  "не підтримує",
  "не реалізовано",
  "invalid signature",
  "невірний підпис",
  "validation",
];

/** Повторюємо лише те, що має шанс минути саме собою. */
export function classifyError(input: {
  message?: string | null;
  httpStatus?: number | null;
  unsupported?: boolean;
}): ErrorClass {
  if (input.unsupported) return "unsupported";
  const status = input.httpStatus ?? null;
  if (status != null) {
    if (status === 408 || status === 429 || status >= 500) return "retryable";
    if (status >= 400) return "permanent";
  }
  const msg = (input.message ?? "").toLowerCase();
  if (PERMANENT_MARKERS.some((m) => msg.includes(m))) return "permanent";
  return "retryable";
}

/** Похідний статус для журналу та фільтрів UI. */
export function effectiveStatus(row: { status: string; unsupported?: boolean | null }): string {
  return row.unsupported ? "unsupported_event" : row.status;
}
