/**
 * Сховище стану зовнішніх підключень (лише сервер).
 *
 * Нових таблиць не створюємо: використовуємо наявні `integrations`
 * (статус, останній успіх, помилка, конфігурація) та `integration_tokens`
 * (access/refresh токени). Токени ніколи не повертаються в клієнт.
 */
import { admin } from "@/lib/access.server";
import { getExternalProvider } from "./registry";

export type ExternalStatus =
  | "not_configured"
  | "authorization_required"
  | "oauth_connected"
  | "connected"
  | "error"
  | "token_expired"
  | "permission_error";

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string | null;
  accountLabel: string | null;
};

type Row = Record<string, any>;

function slugFor(providerKey: string) {
  return `ext-${providerKey}`;
}

/** Рядок інтеграції для провайдера. Створюється один раз, дублі не плодяться. */
export async function ensureIntegrationRow(providerKey: string): Promise<Row> {
  const db = await admin();
  const { data: existing } = await db
    .from("integrations")
    .select("*")
    .eq("provider_key", providerKey)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Row;

  const meta = getExternalProvider(providerKey);
  const { data, error } = await db
    .from("integrations")
    .insert({
      provider_key: providerKey,
      name: meta?.label ?? providerKey,
      slug: slugFor(providerKey),
      status: "disconnected",
      enabled: false,
      config: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`Не вдалося створити підключення «${providerKey}»: ${error.message}`);
  return data as Row;
}

export async function readTokens(providerKey: string): Promise<StoredTokens> {
  const db = await admin();
  const row = await ensureIntegrationRow(providerKey);
  const { data } = await db.from("integration_tokens").select("*").eq("integration_id", row.id).maybeSingle();
  return {
    accessToken: (data as Row | null)?.access_token ?? null,
    refreshToken: (data as Row | null)?.refresh_token ?? null,
    expiresAt: (data as Row | null)?.expires_at ?? null,
    scopes: (data as Row | null)?.scopes ?? null,
    accountLabel: (data as Row | null)?.account_label ?? null,
  };
}

export async function saveTokens(
  providerKey: string,
  tokens: { accessToken: string; refreshToken?: string | null; expiresInSec?: number | null; scopes?: string | null; accountLabel?: string | null },
): Promise<void> {
  const db = await admin();
  const row = await ensureIntegrationRow(providerKey);
  const current = await readTokens(providerKey);
  await db.from("integration_tokens").upsert(
    {
      integration_id: row.id,
      access_token: tokens.accessToken,
      // Провайдер не завжди повертає refresh_token повторно — старий не втрачаємо.
      refresh_token: tokens.refreshToken ?? current.refreshToken,
      token_type: "Bearer",
      scopes: tokens.scopes ?? current.scopes,
      account_label: tokens.accountLabel ?? current.accountLabel,
      expires_at: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "integration_id" },
  );
}

export async function patchConfig(providerKey: string, patch: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const row = await ensureIntegrationRow(providerKey);
  const config = { ...((row.config as Record<string, unknown>) ?? {}), ...patch };
  await db.from("integrations").update({ config: config as never }).eq("id", row.id);
}

/** Успіх фіксуємо тільки після фактично успішного виклику API провайдера. */
export async function markSuccess(providerKey: string, label: string | null, status: ExternalStatus = "connected"): Promise<void> {
  const db = await admin();
  const row = await ensureIntegrationRow(providerKey);
  const now = new Date().toISOString();
  await db
    .from("integrations")
    .update({
      status: status === "connected" ? "active" : "connecting",
      enabled: true,
      last_success_at: status === "connected" ? now : row.last_success_at,
      last_test_at: now,
      last_test_ok: true,
      last_error: null,
      last_error_at: null,
      config: { ...((row.config as Record<string, unknown>) ?? {}), external_status: status, account_label: label },
    })
    .eq("id", row.id);
}

export async function markError(providerKey: string, message: string, status: ExternalStatus = "error"): Promise<void> {
  const db = await admin();
  const row = await ensureIntegrationRow(providerKey);
  const now = new Date().toISOString();
  await db
    .from("integrations")
    .update({
      status: "error",
      last_test_at: now,
      last_test_ok: false,
      last_error: message.slice(0, 500),
      last_error_at: now,
      config: { ...((row.config as Record<string, unknown>) ?? {}), external_status: status },
    })
    .eq("id", row.id);
}

export type ExternalConnectionView = {
  provider: string;
  label: string;
  group: string;
  auth: string;
  status: ExternalStatus;
  accountLabel: string | null;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  lastSuccessAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  missingEnv: string[];
  optionalMissingEnv: string[];
  docsUrl: string;
  test: string;
  webhookPath: string | null;
  note: string;
};

/** Зведення по провайдеру без жодного токена. */
export async function connectionView(providerKey: string, env: Record<string, string | undefined>): Promise<ExternalConnectionView> {
  const meta = getExternalProvider(providerKey);
  if (!meta) throw new Error(`Невідомий провайдер «${providerKey}»`);
  const db = await admin();
  const { data } = await db.from("integrations").select("*").eq("provider_key", providerKey).limit(1).maybeSingle();
  const row = (data ?? {}) as Row;
  const tokens = row.id ? await readTokens(providerKey) : { accessToken: null, refreshToken: null, expiresAt: null, scopes: null, accountLabel: null };
  const missingEnv = meta.requiredEnv.filter((k) => !env[k]);
  const stored = (row.config as Row | undefined)?.external_status as ExternalStatus | undefined;

  let status: ExternalStatus = "not_configured";
  if (missingEnv.length) status = "not_configured";
  else if (stored) status = stored;
  else if (tokens.accessToken) status = "oauth_connected";
  else status = meta.auth === "token" ? "authorization_required" : "authorization_required";
  if (row.last_test_ok === false && stored !== "not_configured") status = stored ?? "error";

  return {
    provider: meta.key,
    label: meta.label,
    group: meta.group,
    auth: meta.auth,
    status,
    accountLabel: ((row.config as Row | undefined)?.account_label as string | undefined) ?? tokens.accountLabel ?? null,
    hasRefreshToken: Boolean(tokens.refreshToken),
    tokenExpiresAt: tokens.expiresAt,
    lastSuccessAt: row.last_success_at ?? null,
    lastTestAt: row.last_test_at ?? null,
    lastError: row.last_error ?? null,
    missingEnv,
    optionalMissingEnv: meta.optionalEnv.filter((k) => !env[k]),
    docsUrl: meta.docsUrl,
    test: meta.test,
    webhookPath: meta.webhookPath ?? null,
    note: meta.note,
  };
}
