/**
 * Класифікація подій Binotel (чиста логіка, без БД — придатна для тестів).
 * Підтримуємо лише документовані Webhook-події CALL SETTINGS і CALL COMPLETED.
 * Усе інше (зокрема echo.ping) — unsupported_event: без CRM-побічних дій і без повторів.
 */

export const BINOTEL_SUPPORTED_EVENTS = ["binotel.call_settings", "binotel.call_completed"] as const;
export type BinotelEventType = (typeof BINOTEL_SUPPORTED_EVENTS)[number];

const ALIAS: Record<string, BinotelEventType> = {
  callsettings: "binotel.call_settings",
  call_settings: "binotel.call_settings",
  "call-settings": "binotel.call_settings",
  settings: "binotel.call_settings",
  callcompleted: "binotel.call_completed",
  call_completed: "binotel.call_completed",
  "call-completed": "binotel.call_completed",
  completed: "binotel.call_completed",
};

export type BinotelClassification = {
  eventType: string;
  supported: boolean;
  providerEventId: string | null;
  eventTs: string | null;
  /** Безпечне діагностичне повідомлення (без payload і без PII). */
  reason: string | null;
};

function firstString(raw: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function classifyBinotelEvent(raw: Record<string, any> | null | undefined): BinotelClassification {
  const body = raw ?? {};
  const declaredRaw = firstString(body, ["event", "eventType", "type", "action"]);
  const declared = declaredRaw ? declaredRaw.trim().toLowerCase() : null;
  const generalCallId = firstString(body, ["generalCallID", "generalCallId", "callId", "call_id"]);
  const providerEventId =
    firstString(body, ["eventId", "event_id"]) ??
    (generalCallId ? `${declared && ALIAS[declared] ? ALIAS[declared] : "call"}:${generalCallId}` : null);
  const eventTs = toIso(firstString(body, ["startTime", "start_time", "startedAt", "timestamp", "eventTime"]));

  if (declared && ALIAS[declared]) {
    return { eventType: ALIAS[declared], supported: true, providerEventId, eventTs, reason: null };
  }

  // Незадекларована, але однозначно розпізнана подія завершеного дзвінка.
  const hasCallShape =
    Boolean(generalCallId) &&
    (body.billsec !== undefined || body.disposition !== undefined || body.callType !== undefined);
  if (!declared && hasCallShape) {
    return { eventType: "binotel.call_completed", supported: true, providerEventId, eventTs, reason: null };
  }

  const label = declared ?? "без назви події";
  return {
    eventType: declared ? `binotel.${declared}` : "binotel.unknown",
    supported: false,
    providerEventId,
    eventTs,
    reason: `Подія Binotel «${label}» не підтримується ERP: CRM-записи не створювались`,
  };
}
