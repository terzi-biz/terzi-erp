/**
 * HTTP-клієнт keyCRM Open API v1.
 * Обмеження: 60 запитів/хв на один API-ключ, спільна черга через таблицю лічильників,
 * обробка 429 з Retry-After, експоненційний бекоф, пагінація.
 */
import { admin } from "../access.server";
import { KEYCRM_BASE_URL, KEYCRM_RPM } from "../keycrm-constants";

export class KeyCrmError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Слот у вікні 60 секунд. Якщо ліміт вичерпано — коротке очікування або повтор пізніше. */
async function acquireSlot(integrationId: string, rpm: number) {
  const db = await admin();
  const now = Date.now();
  const { data } = await db
    .from("integration_rate_limits")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("bucket", "keycrm")
    .maybeSingle();

  const row = data as any;
  if (row?.retry_after_until && new Date(row.retry_after_until).getTime() > now) {
    const waitMs = new Date(row.retry_after_until).getTime() - now;
    if (waitMs > 5000) throw new KeyCrmError(`Ліміт keyCRM: повтор через ${Math.ceil(waitMs / 1000)} с`, 429, true);
    await sleep(waitMs);
  }

  const windowStart = row ? new Date(row.window_started_at).getTime() : 0;
  const fresh = now - windowStart < 60_000;
  if (fresh && (row?.request_count ?? 0) >= rpm) {
    const waitMs = 60_000 - (now - windowStart);
    if (waitMs > 5000) throw new KeyCrmError(`Ліміт 60 запитів/хв вичерпано, повтор через ${Math.ceil(waitMs / 1000)} с`, 429, true);
    await sleep(waitMs);
    await db
      .from("integration_rate_limits")
      .upsert(
        { integration_id: integrationId, bucket: "keycrm", window_started_at: new Date().toISOString(), request_count: 1, retry_after_until: null },
        { onConflict: "integration_id,bucket" },
      );
    return;
  }

  await db.from("integration_rate_limits").upsert(
    {
      integration_id: integrationId,
      bucket: "keycrm",
      window_started_at: fresh ? row.window_started_at : new Date().toISOString(),
      request_count: fresh ? (row.request_count ?? 0) + 1 : 1,
      retry_after_until: null,
    },
    { onConflict: "integration_id,bucket" },
  );
}

async function markRetryAfter(integrationId: string, seconds: number) {
  const db = await admin();
  await db.from("integration_rate_limits").upsert(
    {
      integration_id: integrationId,
      bucket: "keycrm",
      window_started_at: new Date().toISOString(),
      request_count: KEYCRM_RPM,
      retry_after_until: new Date(Date.now() + seconds * 1000).toISOString(),
    },
    { onConflict: "integration_id,bucket" },
  );
}

export type KeyCrmClient = {
  request: (method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown }) => Promise<any>;
  get: (path: string, query?: Record<string, unknown>) => Promise<any>;
  post: (path: string, body: unknown) => Promise<any>;
  put: (path: string, body: unknown) => Promise<any>;
  /** Посторінкове читання списку: повертає всі елементи до ліміту сторінок. */
  paginate: (path: string, query?: Record<string, unknown>, maxPages?: number) => Promise<any[]>;
};

export function createKeyCrmClient(opts: {
  integrationId: string;
  apiKey: string;
  baseUrl?: string;
  rpm?: number;
}): KeyCrmClient {
  const baseUrl = (opts.baseUrl || KEYCRM_BASE_URL).replace(/\/+$/, "");
  const rpm = opts.rpm || KEYCRM_RPM;

  async function request(method: string, path: string, o: { query?: Record<string, unknown>; body?: unknown } = {}) {
    const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(o.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    let lastErr: KeyCrmError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await acquireSlot(opts.integrationId, rpm);
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
        });
      } catch (e: any) {
        lastErr = new KeyCrmError(`Мережева помилка keyCRM: ${e?.message ?? e}`, 0, true);
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after") ?? "5");
        await markRetryAfter(opts.integrationId, Number.isFinite(ra) ? ra : 5);
        throw new KeyCrmError(`keyCRM повернув 429 (Retry-After ${ra} с)`, 429, true);
      }
      if (res.status === 401 || res.status === 403) {
        throw new KeyCrmError("keyCRM: неавторизовано — перевірте API-ключ", res.status, false);
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 2000) };
      }
      if (!res.ok) {
        const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`;
        const retryable = res.status >= 500;
        lastErr = new KeyCrmError(`keyCRM: ${msg}`, res.status, retryable);
        if (!retryable) throw lastErr;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return json;
    }
    throw lastErr ?? new KeyCrmError("keyCRM: невідома помилка", 0, true);
  }

  const client: KeyCrmClient = {
    request,
    get: (path, query) => request("GET", path, { query }),
    post: (path, body) => request("POST", path, { body }),
    put: (path, body) => request("PUT", path, { body }),
    async paginate(path, query = {}, maxPages = 10) {
      const out: any[] = [];
      const limit = Number(query.limit ?? 50);
      for (let page = 1; page <= maxPages; page++) {
        const res = await request("GET", path, { query: { ...query, page, limit } });
        const items: any[] = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
        out.push(...items);
        const total = res?.total ?? null;
        const lastPage = res?.last_page ?? null;
        if (items.length < limit) break;
        if (lastPage && page >= lastPage) break;
        if (total && out.length >= total) break;
      }
      return out;
    },
  };
  return client;
}
