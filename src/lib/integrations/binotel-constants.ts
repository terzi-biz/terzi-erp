/**
 * Binotel — константи провайдера (безпечні для клієнта).
 * Джерело: Binotel REST API 4.0 + Webhook API (CALL SETTINGS / CALL COMPLETED).
 * Тут немає жодного ключа чи секрету — лише адреси методів і словники значень.
 */

export const BINOTEL_BASE_URL = "https://api.binotel.com/api/4.0";

/** Методи REST API 4.0, які використовує ERP (перевірені реальними запитами). */
export const BINOTEL_ENDPOINTS = {
  employees: "settings/list-of-employees.json",
  callsForPeriod: "stats/list-of-calls-for-period.json",
  callRecord: "stats/call-record.json",
  clickToCall: "calls/internal-number-to-external-number.json",
} as const;

export type BinotelEndpointKey = keyof typeof BINOTEL_ENDPOINTS;

/** Секрети (лише імена змінних середовища; значення живуть на сервері). */
export const BINOTEL_SECRET_KEYS = ["api_key", "api_secret", "company_id", "webhook_token"] as const;
export const BINOTEL_SECRET_REFS: Record<(typeof BINOTEL_SECRET_KEYS)[number], string> = {
  api_key: "BINOTEL_API_KEY",
  api_secret: "BINOTEL_API_SECRET",
  company_id: "BINOTEL_COMPANY_ID",
  webhook_token: "BINOTEL_WEBHOOK_TOKEN",
};

export const BINOTEL_SECRET_LABEL: Record<(typeof BINOTEL_SECRET_KEYS)[number], string> = {
  api_key: "API key",
  api_secret: "API secret",
  company_id: "Company ID",
  webhook_token: "Токен вебхуків",
};

/** disposition Binotel → нормалізований статус дзвінка в ERP. */
export const BINOTEL_DISPOSITION: Record<string, string> = {
  ANSWER: "answered",
  TRANSFER: "transferred",
  NOANSWER: "missed",
  BUSY: "busy",
  CANCEL: "cancelled",
  CONGESTION: "failed",
  CHANUNAVAIL: "failed",
  VM: "voicemail",
  "VM-SUCCESS": "voicemail_with_message",
  ONLINE: "online",
};

export const CALL_STATUS_LABEL: Record<string, string> = {
  answered: "Відповіли",
  transferred: "Переведено",
  missed: "Пропущений",
  busy: "Зайнято",
  cancelled: "Скасовано",
  failed: "Не вдалось",
  voicemail: "Голосова пошта",
  voicemail_with_message: "Залишив повідомлення",
  online: "Онлайн-дзвінок",
};

export function normalizeDisposition(raw: unknown): string {
  const key = String(raw ?? "").trim().toUpperCase();
  return BINOTEL_DISPOSITION[key] ?? (key ? "unknown" : "unknown");
}

/** callType Binotel: 0 — вхідний, 1 — вихідний. */
export function normalizeDirection(raw: unknown): "inbound" | "outbound" {
  const v = String(raw ?? "").trim();
  if (v === "1" || v.toLowerCase() === "outbound" || v.toLowerCase() === "out") return "outbound";
  return "inbound";
}

export const MAPPING_STATUS_LABEL: Record<string, string> = {
  unmapped: "Не зіставлено",
  auto: "Зіставлено автоматично",
  manual: "Зіставлено вручну",
  conflict: "Конфлікт",
};

/** Український формат номера: +380XXXXXXXXX там, де це можливо. */
export function toE164Ua(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("380")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  return `+${digits}`;
}
