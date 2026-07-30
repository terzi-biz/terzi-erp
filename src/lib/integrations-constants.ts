/** Спільні довідники модуля «Інтеграції та API» (безпечні для клієнта). */

export type IntegrationStatus = "disconnected" | "connecting" | "active" | "error" | "disabled";
export type IntegrationAuthKind = "none" | "api_key" | "oauth2" | "hmac" | "basic";
export type EventDirection = "inbound" | "outbound";
export type EventStatus = "pending" | "processing" | "done" | "failed" | "dead";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  disconnected: "Не підключено",
  connecting: "Підключення",
  active: "Активне",
  error: "Помилка",
  disabled: "Вимкнено",
};

export const STATUS_TONE: Record<IntegrationStatus, string> = {
  disconnected: "bg-muted text-muted-foreground",
  connecting: "bg-primary/15 text-primary",
  active: "bg-emerald-500/15 text-emerald-600",
  error: "bg-destructive/15 text-destructive",
  disabled: "bg-secondary text-muted-foreground",
};

export const AUTH_LABEL: Record<IntegrationAuthKind, string> = {
  none: "Без авторизації",
  api_key: "API-ключ",
  oauth2: "OAuth 2.0",
  hmac: "Підпис HMAC",
  basic: "Basic",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  pending: "У черзі",
  processing: "Обробка",
  done: "Виконано",
  failed: "Помилка",
  dead: "Зупинено",
};

export const EVENT_STATUS_TONE: Record<EventStatus, string> = {
  pending: "bg-primary/15 text-primary",
  processing: "bg-amber-500/15 text-amber-600",
  done: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-destructive/15 text-destructive",
  dead: "bg-destructive/25 text-destructive",
};

export const DIRECTION_LABEL: Record<EventDirection, string> = {
  inbound: "Вхідні",
  outbound: "Вихідні",
};

/** Сутності ERP, доступні для мапінгу полів. */
export const MAPPING_ENTITIES: { key: string; label: string; fields: string[] }[] = [
  { key: "lead", label: "Лід", fields: ["name", "phone", "email", "source", "note", "address"] },
  { key: "client", label: "Клієнт", fields: ["name", "phone", "email", "address", "notes", "status"] },
  { key: "object", label: "Об'єкт", fields: ["name", "address", "district", "object_type", "notes", "source"] },
  { key: "call", label: "Дзвінок", fields: ["phone", "direction", "duration", "recording_url", "started_at"] },
  { key: "message", label: "Повідомлення", fields: ["chat_id", "text", "author", "sent_at"] },
  { key: "task", label: "Задача", fields: ["title", "description", "due_at", "assignee"] },
];

/** Затримки повторів (хвилини) — синхронізовано з ядром черги. */
export const RETRY_BACKOFF_MIN = [1, 5, 30, 120, 360];

export function retryDelayLabel(attempt: number): string {
  const m = RETRY_BACKOFF_MIN[Math.min(attempt, RETRY_BACKOFF_MIN.length - 1)];
  return m < 60 ? `${m} хв` : `${m / 60} год`;
}
