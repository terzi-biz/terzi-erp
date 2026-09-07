/**
 * Finmap Public API v2.2 — серверний клієнт.
 * Ключ читається лише всередині функцій (process.env), ніколи не потрапляє в браузер, URL чи логи.
 * Документація: https://api.finmap.online/ (OpenAPI 2.2).
 */

export const FINMAP_API_VERSION = "2.2";
const DEFAULT_BASE = "https://api.finmap.online";

export class FinmapError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = "FinmapError";
    this.status = status;
    this.retryable = retryable;
  }
}

function baseUrl(): string {
  const raw = (process.env["FINMAP_API_BASE_URL"] || DEFAULT_BASE).trim();
  return raw.replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env["FINMAP_API_KEY"];
  if (!key) throw new FinmapError("Не налаштовано ключ Finmap (FINMAP_API_KEY)", 401, false);
  return key;
}

export function finmapConfigured(): boolean {
  return !!process.env["FINMAP_API_KEY"];
}

function humanError(status: number, body: string): string {
  const short = body.slice(0, 300);
  switch (status) {
    case 400: return `Finmap відхилив запит (400): ${short}`;
    case 401: return "Finmap: невірний або відкликаний ключ доступу (401)";
    case 403: return "Finmap: недостатньо прав для цієї операції (403)";
    case 404: return "Finmap: ресурс не знайдено (404)";
    case 409: return `Finmap: конфлікт даних (409): ${short}`;
    case 429: return "Finmap: перевищено ліміт запитів (429)";
    default:
      if (status >= 500) return `Finmap тимчасово недоступний (${status})`;
      return `Finmap помилка ${status}: ${short}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** Виклик Finmap із повторами на 429/5xx/timeout і людськими повідомленнями. */
export async function finmapRequest<T = unknown>(
  path: string,
  opts: { method?: Method; body?: unknown; query?: Record<string, string | number | boolean | undefined>; timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const { method = "GET", body, query, timeoutMs = 20_000, retries = 3 } = opts;
  const url = new URL(`${baseUrl()}/v${FINMAP_API_VERSION}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  let lastErr: FinmapError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          apiKey: apiKey(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : null) as T;
      }
      const text = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new FinmapError(humanError(res.status, text), res.status, retryable);
      if (!retryable || attempt === retries) throw lastErr;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
    } catch (e: any) {
      clearTimeout(timer);
      if (e instanceof FinmapError) {
        if (!e.retryable || attempt === retries) throw e;
        lastErr = e;
        continue;
      }
      lastErr = new FinmapError(
        e?.name === "AbortError" ? "Finmap не відповів вчасно (timeout)" : `Finmap недоступний: ${String(e?.message ?? e)}`,
        503,
        true,
      );
      if (attempt === retries) throw lastErr;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr ?? new FinmapError("Finmap недоступний", 503, true);
}

// ---------- типізовані виклики ----------

export type FinmapRef = { id: string; label: string; parentId?: string | null };
export type FinmapAccount = FinmapRef & { currencyId?: string; balance?: number; companyCurrencyBalance?: number };
export type FinmapCategory = FinmapRef & { isSystem?: boolean };
export type FinmapOperation = {
  id: string;
  operationId?: string;
  date: number;
  sum: number;
  type: "income" | "expense" | "transfer" | string;
  subType?: string;
  comment?: string;
  currencyId?: string;
  exchangeRate?: number;
  companyCurrencySum?: number;
  categoryId?: string | null;
  categoryName?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  accountFromId?: string | null;
  accountToId?: string | null;
  accountFromName?: string | null;
  accountToName?: string | null;
  projectIds?: string[];
  projects?: string;
  externalId?: string | null;
  approved?: boolean;
  updatedAt?: string;
};

export const finmap = {
  health: () => finmapRequest<{ status?: string }>("/health"),
  currencies: () => finmapRequest<{ id: string; symbol: string }[]>("/currencies"),
  accounts: (withBalances = true) => finmapRequest<FinmapAccount[]>("/accounts", { query: { withBalances } }),
  projects: () => finmapRequest<FinmapRef[]>("/projects"),
  tags: () => finmapRequest<FinmapRef[]>("/tags"),
  incomeCategories: () => finmapRequest<FinmapCategory[]>("/categories/income"),
  expenseCategories: () => finmapRequest<FinmapCategory[]>("/categories/expense"),
  debitors: () => finmapRequest<FinmapRef[]>("/debitors"),
  suppliers: () => finmapRequest<FinmapRef[]>("/suppliers"),
  employees: () => finmapRequest<FinmapRef[]>("/employees"),
  investors: () => finmapRequest<FinmapRef[]>("/investors"),
  creditors: () => finmapRequest<FinmapRef[]>("/creditors"),
  owners: () => finmapRequest<FinmapRef[]>("/owners"),
  operations: (params: { startDate?: number; endDate?: number; limit?: number; offset?: number }) =>
    finmapRequest<{ list: FinmapOperation[]; total: number }>("/operations/list", { method: "POST", body: params }),
  invoices: () => finmapRequest<any>("/invoices"),
  webhooks: () => finmapRequest<{ id: string; name: string; url: string }[]>("/webhooks"),
  createWebhook: (name: string, url: string) =>
    finmapRequest<{ id: string; name: string; url: string }>("/webhooks", { method: "POST", body: { name, url } }),
  /** Ідемпотентне створення операції в Finmap за стабільним externalId (terzi:payment:<uuid>). */
  createOperation: (kind: "income" | "expense" | "transfer", body: Record<string, unknown>) =>
    finmapRequest<{ status: string; statusCode: string }>(`/operations/${kind}`, { method: "POST", body }),
  updateOperationByExternalId: (kind: "income" | "expense" | "transfer", externalId: string, body: Record<string, unknown>) =>
    finmapRequest(`/operations/${kind}/byExternalId/${encodeURIComponent(externalId)}`, { method: "PATCH", body }),
};

export const externalIdFor = (entity: "payment" | "expense" | "transfer" | "invoice", id: string) => `terzi:${entity}:${id}`;
