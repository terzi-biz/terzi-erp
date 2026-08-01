/**
 * HTTP-клієнт Binotel REST API 4.0 (лише сервер).
 * Аутентифікація — key/secret у тілі JSON-запиту. Ключі ніколи не логуються
 * і не потрапляють у превʼю запиту (маскування в core.logAttempt).
 */
import { BINOTEL_BASE_URL, BINOTEL_ENDPOINTS, type BinotelEndpointKey } from "../binotel-constants";
import { logAttempt } from "../core.server";

export class BinotelError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export type BinotelCredentials = { key: string; secret: string; baseUrl?: string | null };

export type BinotelCallOptions = {
  integrationId?: string | null;
  /** Не писати запис у журнал (для дуже частих службових викликів). */
  quiet?: boolean;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Binotel відхиляє надто часті запити (код 106) — тримаємо мінімальний
 * інтервал між викликами в межах одного процесу.
 */
const MIN_GAP_MS = 4500;
let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** Один запит до REST 4.0 із повторами на 429/5xx та на «занадто часті запити». */
export async function binotelRequest<T = any>(
  creds: BinotelCredentials,
  endpoint: BinotelEndpointKey | string,
  params: Record<string, unknown> = {},
  opts: BinotelCallOptions = {},
): Promise<T> {
  const path = (BINOTEL_ENDPOINTS as Record<string, string>)[endpoint] ?? String(endpoint);
  const base = (creds.baseUrl || BINOTEL_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/${path.replace(/^\/+/, "")}`;
  const body = JSON.stringify({ key: creds.key, secret: creds.secret, ...params });

  let lastErr: BinotelError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
    } catch (e: any) {
      lastErr = new BinotelError(`Мережева помилка Binotel: ${e?.message ?? e}`, 0, true);
      await sleep(500 * (attempt + 1));
      continue;
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 2000) };
    }

    if (!opts.quiet) {
      await logAttempt({
        integrationId: opts.integrationId ?? null,
        attempt: attempt + 1,
        level: res.ok ? "info" : "warn",
        message: `Binotel ${path}`,
        httpStatus: res.status,
        durationMs: Date.now() - started,
        request: { endpoint: path, params },
        response: json,
      });
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new BinotelError(`Binotel HTTP ${res.status}`, res.status, true);
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 800 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new BinotelError(`Binotel HTTP ${res.status}`, res.status, false);

    const status = String(json?.status ?? "").toLowerCase();
    if (status && status !== "success") {
      throw new BinotelError(json?.message ? `Binotel: ${json.message}` : "Binotel повернув помилку", res.status, false);
    }
    return json as T;
  }
  throw lastErr ?? new BinotelError("Binotel недоступний", 0, true);
}

/** Витягує масив співробітників із будь-якого з можливих форматів відповіді. */
export function extractCollection(payload: any, keys: string[]): any[] {
  for (const k of keys) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      return Object.entries(v).map(([id, item]) =>
        item && typeof item === "object" ? { id, ...(item as Record<string, unknown>) } : { id, value: item },
      );
    }
  }
  return [];
}
