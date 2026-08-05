/**
 * Binotel — маніфест провайдера у режимі підготовки.
 * ЖОДНОГО вигаданого endpoint, ключа, підпису чи події: усі поля порожні
 * й заповнюються після отримання офіційної документації Binotel.
 */

export const BINOTEL_STATUS_LABEL = "Очікує документацію та доступи Binotel";

export type ManifestField = { key: string; label: string; required: boolean; secret: boolean; placeholder?: string };

/** Порожній schema-driven маніфест: структура фіксована, значення — від Binotel. */
export const BINOTEL_MANIFEST_TEMPLATE = {
  status: "awaiting_documentation",
  base_url: null as string | null,
  credential_fields: [] as ManifestField[],
  rest_endpoints: {} as Record<string, { method: string; path: string; description?: string }>,
  webhook_events: [] as { key: string; label?: string }[],
  websocket_events: [] as { key: string; label?: string }[],
  signature_validation: { mode: "unknown" as "unknown" | "none" | "hmac_sha256" | "token", header: null as string | null },
  rate_limits: {} as Record<string, number>,
  retry_policy: { backoff_minutes: [1, 5, 30, 120, 360] },
  call_field_mapping: {} as Record<string, string>,
  recording_configuration: { url_field: null as string | null, link_ttl_minutes: null as number | null, auth: null as string | null },
  click_to_call_configuration: { enabled: false, method: null as string | null, path: null as string | null },
};

/** Перелік даних, які потрібно отримати від Binotel (показується в картці). */
export const BINOTEL_REQUIREMENTS: { key: string; label: string }[] = [
  { key: "rest_docs", label: "REST API документація" },
  { key: "webhook_docs", label: "Webhook API документація" },
  { key: "websocket_docs", label: "WebSocket API документація" },
  { key: "credentials", label: "API credentials (ключ/секрет)" },
  { key: "payload_examples", label: "Приклади payload" },
  { key: "events_list", label: "Список подій" },
  { key: "webhook_verification", label: "Правила перевірки вебхука" },
  { key: "ws_auth", label: "Правила WebSocket-авторизації" },
  { key: "rate_limits", label: "Rate limits" },
  { key: "click_to_call", label: "Click-to-Call метод" },
  { key: "recording_fetch", label: "Отримання запису розмови" },
  { key: "recording_ttl", label: "Строк дії посилання на запис" },
  { key: "company_numbers", label: "Номери компанії" },
  { key: "internal_lines", label: "Внутрішні лінії" },
  { key: "test_credentials", label: "Тестові credentials" },
];

/** Дії, які адаптер уміє виконати відразу після заповнення маніфесту. */
export const BINOTEL_CAPABILITIES: { key: string; label: string; ready: boolean }[] = [
  { key: "webhook_intake", label: "Приймання вебхуків (тестовий і бойовий endpoint)", ready: true },
  { key: "queue", label: "Черга подій, idempotency, повтори, журнал", ready: true },
  { key: "phone_norm", label: "Нормалізація телефонів і пошук клієнта", ready: true },
  { key: "lead_create", label: "Створення ліда з дзвінка", ready: true },
  { key: "missed_task", label: "Задача по пропущеному дзвінку", ready: true },
  { key: "link_entities", label: "Привʼязка дзвінка до клієнта, ліда, замовлення, замовлення", ready: true },
  { key: "line_map", label: "Звʼязок внутрішніх ліній зі співробітниками", ready: true },
  { key: "click_to_call", label: "Click-to-Call (інтерфейс готовий, метод API — після документації)", ready: false },
  { key: "recording", label: "Запис розмови (потрібні правила отримання посилання)", ready: false },
  { key: "websocket", label: "WebSocket-події (потрібна авторизація і перелік подій)", ready: false },
];
