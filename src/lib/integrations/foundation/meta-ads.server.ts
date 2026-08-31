/**
 * Meta Ads (Facebook/Instagram) — реальний адаптер.
 *
 * Можливості:
 *  - testConnection: перевірка рекламного кабінету через Graph API;
 *  - insights: щоденні витрати/покази/кліки/ліди по кампаніях → marketing_campaigns + marketing_daily_metrics;
 *  - вебхук leadgen: перевірка X-Hub-Signature-256, дотягування ліда з Graph API → наявний lead intake.
 *
 * Секрети читаються лише тут (process.env), у журнал не потрапляють.
 */
import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_VERSION = "v21.0";

export function metaEnv() {
  const env = process.env as Record<string, string | undefined>;
  return {
    token: env.META_ADS_ACCESS_TOKEN ?? null,
    accountId: env.META_ADS_ACCOUNT_ID ?? null,
    appSecret: env.META_APP_SECRET ?? null,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN ?? null,
    version: env.META_ADS_API_VERSION ?? DEFAULT_VERSION,
  };
}

function actId(raw: string) {
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

async function graph(path: string, params: Record<string, string | undefined>, token: string, version: string) {
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(`Meta Ads API: ${msg}`) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  return json;
}

/** Перевірка підпису вебхука Meta: sha256=<hex> від сирого тіла на App Secret. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = Buffer.from(header.replace(/^sha256=/, "").toLowerCase());
  const exp = Buffer.from(expected);
  return got.length === exp.length && timingSafeEqual(got, exp);
}

export async function metaTestConnection() {
  const { token, accountId, version } = metaEnv();
  if (!token || !accountId) throw new Error("Не задано META_ADS_ACCESS_TOKEN / META_ADS_ACCOUNT_ID");
  const data = await graph(actId(accountId), { fields: "name,currency,account_status,timezone_name" }, token, version);
  return {
    name: String(data?.name ?? accountId),
    currency: String(data?.currency ?? "UAH"),
    timezone: data?.timezone_name ? String(data.timezone_name) : null,
    active: Number(data?.account_status) === 1,
  };
}

type Admin = any;

async function ensureChannel(db: Admin, key: string, name: string): Promise<string | null> {
  const { data } = await db.from("marketing_channels").select("id").eq("key", key).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins } = await db.from("marketing_channels").insert({ key, name }).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

async function ensureAccount(db: Admin, channelId: string | null, externalId: string, name: string, currency: string, timezone: string | null) {
  const { data } = await db.from("marketing_accounts").select("id").eq("external_account_id", externalId).maybeSingle();
  const patch = {
    channel_id: channelId,
    name,
    external_account_id: externalId,
    currency,
    timezone,
    connection_status: "connected",
    last_sync_at: new Date().toISOString(),
    sync_error: null,
  };
  if (data?.id) {
    await db.from("marketing_accounts").update(patch).eq("id", data.id);
    return data.id as string;
  }
  const { data: ins } = await db.from("marketing_accounts").insert(patch).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

async function ensureCampaign(db: Admin, accountId: string | null, channelId: string | null, externalId: string, name: string, currency: string) {
  if (!accountId) return null;
  const { data } = await db
    .from("marketing_campaigns")
    .select("id")
    .eq("account_id", accountId)
    .eq("external_id", externalId)
    .maybeSingle();
  const patch = {
    account_id: accountId,
    channel_id: channelId,
    external_id: externalId,
    name,
    currency,
    last_sync_at: new Date().toISOString(),
  };
  if (data?.id) {
    await db.from("marketing_campaigns").update(patch).eq("id", data.id);
    return data.id as string;
  }
  const { data: ins } = await db.from("marketing_campaigns").insert(patch).select("id").maybeSingle();
  return (ins?.id as string) ?? null;
}

/** Унікальність метрик — вираз-індекс, тому upsert робимо вручну (select → update/insert). */
async function upsertMetric(db: Admin, row: Record<string, unknown>) {
  const q = db
    .from("marketing_daily_metrics")
    .select("id")
    .eq("date", row.date as string)
    .eq("campaign_id", row.campaign_id as string);
  const { data } = await q.maybeSingle();
  if (data?.id) {
    await db.from("marketing_daily_metrics").update({ ...row, synced_at: new Date().toISOString() }).eq("id", data.id);
    return "updated" as const;
  }
  await db.from("marketing_daily_metrics").insert({ ...row, synced_at: new Date().toISOString() });
  return "inserted" as const;
}

function actionValue(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => types.includes(String(a?.action_type)))
    .reduce((sum, a) => sum + Number(a?.value ?? 0), 0);
}

export type MetaSyncResult = { days: number; campaigns: number; inserted: number; updated: number; from: string; to: string };

/** Щоденні insights по кампаніях за період (включно). */
export async function syncMetaInsights(input: { from: string; to: string }): Promise<MetaSyncResult> {
  const { token, accountId, version } = metaEnv();
  if (!token || !accountId) throw new Error("Не задано META_ADS_ACCESS_TOKEN / META_ADS_ACCOUNT_ID");
  const account = await metaTestConnection();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as Admin;

  const channelId = await ensureChannel(db, "meta_ads", "Meta Ads");
  const acctId = await ensureAccount(db, channelId, accountId, account.name, account.currency, account.timezone);

  let inserted = 0;
  let updated = 0;
  const campaigns = new Set<string>();
  const days = new Set<string>();

  let next: string | null = null;
  let page = 0;
  do {
    const data: any = next
      ? await (await fetch(next)).json()
      : await graph(
          `${actId(accountId)}/insights`,
          {
            level: "campaign",
            time_increment: "1",
            limit: "200",
            time_range: JSON.stringify({ since: input.from, until: input.to }),
            fields: "campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
          },
          token,
          version,
        );
    for (const row of (data?.data ?? []) as any[]) {
      const extId = String(row.campaign_id ?? "");
      if (!extId) continue;
      const campaignId = await ensureCampaign(db, acctId, channelId, extId, String(row.campaign_name ?? extId), account.currency);
      if (!campaignId) continue;
      campaigns.add(extId);
      const date = String(row.date_start);
      days.add(date);
      const res = await upsertMetric(db, {
        date,
        channel_id: channelId,
        account_id: acctId,
        campaign_id: campaignId,
        currency: account.currency,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        link_clicks: Number(row.inline_link_clicks ?? 0),
        platform_leads: actionValue(row.actions, ["lead", "onsite_conversion.lead_grouped", "leadgen.other"]),
        conversions: actionValue(row.actions, ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"]),
        conversion_value: actionValue(row.action_values, ["lead", "offsite_conversion.fb_pixel_lead"]),
      });
      if (res === "inserted") inserted += 1;
      else updated += 1;
    }
    next = data?.paging?.next ?? null;
    page += 1;
  } while (next && page < 20);

  return { days: days.size, campaigns: campaigns.size, inserted, updated, from: input.from, to: input.to };
}

/** Дотягування ліда з Lead Ads за leadgen_id. */
export async function fetchMetaLead(leadgenId: string) {
  const { token, version } = metaEnv();
  if (!token) throw new Error("Не задано META_ADS_ACCESS_TOKEN");
  const data = await graph(leadgenId, { fields: "id,created_time,ad_id,ad_name,campaign_id,campaign_name,form_id,field_data" }, token, version);
  const fields: Record<string, string> = {};
  for (const f of (data?.field_data ?? []) as any[]) {
    const name = String(f?.name ?? "").toLowerCase();
    const value = Array.isArray(f?.values) ? String(f.values[0] ?? "") : "";
    if (name) fields[name] = value;
  }
  return {
    id: String(data?.id ?? leadgenId),
    createdTime: data?.created_time ? String(data.created_time) : null,
    campaign: data?.campaign_name ? String(data.campaign_name) : null,
    formId: data?.form_id ? String(data.form_id) : null,
    adId: data?.ad_id ? String(data.ad_id) : null,
    name: fields["full_name"] ?? fields["name"] ?? fields["імя"] ?? fields["ім'я"] ?? undefined,
    phone: fields["phone_number"] ?? fields["phone"] ?? fields["телефон"] ?? undefined,
    email: fields["email"] ?? undefined,
    message: fields["message"] ?? fields["comment"] ?? undefined,
    fields,
  };
}
