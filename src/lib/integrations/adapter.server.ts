import { keycrmAdapter } from "./keycrm/adapter.server";
import { binotelAdapter } from "./binotel/adapter.server";

/**
 * Реєстр адаптерів провайдерів. Ядро не знає нічого про конкретні сервіси —
 * кожен провайдер реалізує цей інтерфейс і реєструється нижче.
 */

export type IntegrationRow = {
  id: string;
  provider_key: string;
  name: string;
  slug: string;
  status: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type AdapterContext = {
  integration: IntegrationRow;
  config: Record<string, unknown>;
  /** Значення секрету за посиланням (ім'я змінної середовища). Ніколи не логується. */
  secret: (secretKey: string) => string | null;
};

export type NormalizedEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** ID події у провайдера — головний ключ ідемпотентності Webhook Core. */
  providerEventId?: string | null;
  /** Час події у провайдера (ISO) — для replay-вікна. */
  eventTs?: string | null;
};

export type AdapterResult = {
  ok: boolean;
  message?: string;
  data?: unknown;
  httpStatus?: number;
  /** Подія відома провайдеру, але не підтримується ERP: термінальний статус без повторів. */
  unsupported?: boolean;
};

export type IntegrationAdapter = {
  key: string;
  /** Перевірка з'єднання з кнопки «Перевірити». */
  testConnection?: (ctx: AdapterContext) => Promise<AdapterResult>;
  /** Перевірка підпису вхідного вебхука. Повертає false → 401. */
  verifyWebhook?: (
    ctx: AdapterContext,
    req: { rawBody: string; headers: Headers; secret: string | null; signatureHeader: string | null; url?: string | null },
  ) => Promise<boolean>;
  /** Приведення сирого запиту до події черги. */
  normalizeEvent?: (ctx: AdapterContext, raw: unknown, headers: Headers) => NormalizedEvent;
  /** Обробка вхідної події (створення ліда, клієнта тощо). */
  handleInbound?: (ctx: AdapterContext, payload: Record<string, unknown>, eventType: string) => Promise<AdapterResult>;
  /** Надсилання вихідної події у зовнішній сервіс. */
  send?: (ctx: AdapterContext, payload: Record<string, unknown>, eventType: string) => Promise<AdapterResult>;
};

/** Службовий адаптер для перевірки ядра: черга, повтори, журнал, idempotency. */
const echoAdapter: IntegrationAdapter = {
  key: "echo",
  async testConnection() {
    return { ok: true, message: "Echo-адаптер відповідає" };
  },
  async verifyWebhook(_ctx, req) {
    // Якщо секрет заданий — перевіряємо HMAC, інакше приймаємо (тестовий адаптер).
    if (!req.secret) return true;
    const { verifyHmacSha256 } = await import("./signature.server");
    return verifyHmacSha256(req.rawBody, req.headers.get(req.signatureHeader ?? "x-signature"), req.secret);
  },
  normalizeEvent(_ctx, raw, headers) {
    const body = (raw ?? {}) as Record<string, unknown>;
    return {
      eventType: String(body.event ?? "echo.ping"),
      payload: body,
      idempotencyKey: headers.get("x-idempotency-key"),
    };
  },
  async handleInbound(_ctx, payload, eventType) {
    if (eventType === "echo.fail") return { ok: false, message: "Навмисна помилка для перевірки повторів" };
    return { ok: true, message: "Оброблено", data: payload };
  },
  async send(_ctx, payload, eventType) {
    return { ok: true, message: `Надіслано (${eventType})`, data: payload };
  },
};

const REGISTRY: Record<string, IntegrationAdapter> = {
  echo: echoAdapter,
  keycrm: keycrmAdapter,
  binotel: binotelAdapter,
};

export function getAdapter(providerKey: string): IntegrationAdapter | null {
  return REGISTRY[providerKey] ?? null;
}

export function registerAdapter(adapter: IntegrationAdapter) {
  REGISTRY[adapter.key] = adapter;
}

export function listAdapterKeys(): string[] {
  return Object.keys(REGISTRY);
}
