/**
 * Google Ads — реальний адаптер (Google Ads API v18, REST).
 *
 * Автентифікація: OAuth2 installed/web app.
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET — з Google Cloud Console;
 *   GOOGLE_ADS_REFRESH_TOKEN — отримується один раз через /api/public/integrations/google-ads/*;
 *   GOOGLE_ADS_DEVELOPER_TOKEN — з Google Ads (API Center);
 *   GOOGLE_ADS_CUSTOMER_ID — рекламний акаунт (без дефісів);
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID — MCC (опційно).
 *
 * Секрети читаються лише тут і ніколи не логуються.
 */
import process from "node:process";

const API_VERSION = "v18";

export function googleAdsEnv() {
  const env = process.env as Record<string, string | undefined>;
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? null,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? null,
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN ?? null,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null,
    customerId: (env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/\D/g, "") || null,
    loginCustomerId: (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "") || null,
  };
}

export function googleAdsMissing(): string[] {
  const e = googleAdsEnv();
  const missing: string[] = [];
  if (!e.clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!e.clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!e.refreshToken) missing.push("GOOGLE_ADS_REFRESH_TOKEN");
  if (!e.developerToken) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!e.customerId) missing.push("GOOGLE_ADS_CUSTOMER_ID");
  return missing;
}

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

/** Обмін refresh_token → короткоживучий access_token. */
export async function googleAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = googleAdsEnv();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Google Ads: не задано ${googleAdsMissing().join(", ")}`);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.access_token) {
    throw new Error(`Google OAuth: ${String((json as any)?.error_description ?? (json as any)?.error ?? res.status)}`);
  }
  return String(json.access_token);
}

async function gaqlSearch(query: string): Promise<any[]> {
  const { developerToken, customerId, loginCustomerId } = googleAdsEnv();
  const missing = googleAdsMissing();
  if (missing.length) throw new Error(`Google Ads: не задано ${missing.join(", ")}`);
  const token = await googleAccessToken();
  const rows: any[] = [];
  let pageToken: string | undefined;
  let guard = 0;
  do {
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "developer-token": developerToken!,
          ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, pageSize: 10000, ...(pageToken ? { pageToken } : {}) }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = json?.error?.message ?? json?.[0]?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Google Ads API: ${msg}`);
    }
    rows.push(...((json?.results ?? []) as any[]));
    pageToken = json?.nextPageToken;
    guard += 1;
  } while (pageToken && guard < 20);
  return rows;
}

export type GoogleAdsAccount = { id: string; name: string; currency: string; timezone: string | null; active: boolean };

/** Перевірка з'єднання: читаємо картку рекламного акаунта. */
export async function googleAdsTestConnection(): Promise<GoogleAdsAccount> {
  const rows = await gaqlSearch(
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1",
  );
  const c = rows[0]?.customer ?? {};
  return {
    id: String(c.id ?? googleAdsEnv().customerId),
    name: String(c.descriptiveName ?? `Google Ads ${googleAdsEnv().customerId}`),
    currency: String(c.currencyCode ?? "UAH"),
    timezone: c.timeZone ? String(c.timeZone) : null,
    active: String(c.status ?? "ENABLED") === "ENABLED",
  };
}

type Admin = any;

async function ensureChannel(db: Admin, key: string, name: string): Promise<string | null> {
  const { data } = await db.from("marketing_channels").select("id").eq("key", key).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins } = await db.from("marketing_channels").insert({ key, name }).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

async function ensureAccount(db: Admin, channelId: string | null, acc: GoogleAdsAccount) {
  const patch = {
    channel_id: channelId,
    name: acc.name,
    external_account_id: acc.id,
    currency: acc.currency,
    timezone: acc.timezone,
    connection_status: "connected",
    last_sync_at: new Date().toISOString(),
    sync_error: null,
  };
  const { data } = await db.from("marketing_accounts").select("id").eq("external_account_id", acc.id).maybeSingle();
  if (data?.id) {
    await db.from("marketing_accounts").update(patch).eq("id", data.id);
    return data.id as string;
  }
  const { data: ins } = await db.from("marketing_accounts").insert(patch).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

async function ensureCampaign(db: Admin, accountId: string | null, channelId: string | null, externalId: string, name: string, currency: string) {
  if (!accountId) return null;
  const patch = { account_id: accountId, channel_id: channelId, external_id: externalId, name, currency, last_sync_at: new Date().toISOString() };
  const { data } = await db
    .from("marketing_campaigns").select("id").eq("account_id", accountId).eq("external_id", externalId).maybeSingle();
  if (data?.id) {
    await db.from("marketing_campaigns").update(patch).eq("id", data.id);
    return data.id as string;
  }
  const { data: ins } = await db.from("marketing_campaigns").insert(patch).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

async function upsertMetric(db: Admin, row: Record<string, unknown>) {
  const { data } = await db
    .from("marketing_daily_metrics").select("id")
    .eq("date", row.date as string).eq("campaign_id", row.campaign_id as string).maybeSingle();
  if (data?.id) {
    await db.from("marketing_daily_metrics").update({ ...row, synced_at: new Date().toISOString() }).eq("id", data.id);
    return "updated" as const;
  }
  await db.from("marketing_daily_metrics").insert({ ...row, synced_at: new Date().toISOString() });
  return "inserted" as const;
}

export type GoogleAdsSyncResult = { days: number; campaigns: number; inserted: number; updated: number; from: string; to: string };

/** Щоденні метрики по кампаніях за період (включно). Витрати конвертуються в UAH за курсом НБУ на дату. */
export async function syncGoogleAdsMetrics(input: { from: string; to: string }): Promise<GoogleAdsSyncResult> {
  const account = await googleAdsTestConnection();
  const rows = await gaqlSearch(`
    SELECT campaign.id, campaign.name, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${input.from}' AND '${input.to}'
  `);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as Admin;
  const { toUah } = await import("@/lib/marketing/fx.server");

  const channelId = await ensureChannel(db, "google_ads", "Google Ads");
  const acctId = await ensureAccount(db, channelId, account);

  let inserted = 0;
  let updated = 0;
  const campaigns = new Set<string>();
  const days = new Set<string>();

  for (const r of rows) {
    const extId = String(r?.campaign?.id ?? "");
    const date = String(r?.segments?.date ?? "");
    if (!extId || !date) continue;
    const campaignId = await ensureCampaign(db, acctId, channelId, extId, String(r?.campaign?.name ?? extId), account.currency);
    if (!campaignId) continue;
    campaigns.add(extId);
    days.add(date);
    const cost = Number(r?.metrics?.costMicros ?? 0) / 1_000_000;
    const money = await toUah(cost, account.currency, date);
    const res = await upsertMetric(db, {
      date,
      channel_id: channelId,
      account_id: acctId,
      campaign_id: campaignId,
      currency: "UAH",
      spend: money.uah,
      spend_original: money.original,
      currency_original: money.currency,
      fx_rate: money.rate,
      impressions: Number(r?.metrics?.impressions ?? 0),
      clicks: Number(r?.metrics?.clicks ?? 0),
      link_clicks: Number(r?.metrics?.clicks ?? 0),
      conversions: Number(r?.metrics?.conversions ?? 0),
      conversion_value: Number(r?.metrics?.conversionsValue ?? 0),
    });
    if (res === "inserted") inserted += 1;
    else updated += 1;
  }

  return { days: days.size, campaigns: campaigns.size, inserted, updated, from: input.from, to: input.to };
}
