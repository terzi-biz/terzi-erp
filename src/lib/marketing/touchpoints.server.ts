/**
 * Побудова маркетингових точок дотику (`marketing_touchpoints`) із лідів CRM.
 *
 * Детерміновано й ідемпотентно: для кожного ліда з визначеним джерелом
 * створюється рівно один first/last touch. Якщо джерело не розпізнане —
 * рядок не створюється (needs review), канал не вигадується.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_CHANNELS, resolveChannel } from "./channels";

type Db = SupabaseClient<any, any, any>;

const CHANNEL_TYPE: Record<string, string> = {
  ads: "paid",
  marketplace: "paid",
  organic: "organic",
  messenger: "messenger",
  direct: "direct",
  referral: "referral",
};

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** Мапа канонічний ключ → id у довіднику `marketing_channels` (створює відсутні). */
async function channelIndex(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from("marketing_channels").select("id, key, name");
  const map = new Map<string, string>();
  for (const row of (data ?? []) as any[]) {
    if (row.key) map.set(String(row.key).toLowerCase(), row.id as string);
  }
  for (const ch of CANONICAL_CHANNELS) {
    if (map.has(ch.key)) continue;
    const { data: ins } = await db
      .from("marketing_channels")
      .insert({ key: ch.key, name: ch.label, channel_type: CHANNEL_TYPE[ch.kind] ?? "other" })
      .select("id")
      .maybeSingle();
    if (ins?.id) map.set(ch.key, ins.id as string);
  }
  return map;
}

export type TouchpointBuildResult = {
  leads: number;
  created: number;
  existing: number;
  /** Лідів без розпізнаного джерела — показуються як «Потребує перевірки». */
  needsReview: number;
};

export async function buildLeadTouchpoints(db: Db, opts: { limit?: number } = {}): Promise<TouchpointBuildResult> {
  const limit = opts.limit ?? 10000;
  const channels = await channelIndex(db);

  const leads: any[] = [];
  const page = 1000;
  for (let offset = 0; offset < limit; offset += page) {
    const { data: chunk } = await db
      .from("crm_leads")
      .select("id, source, campaign, utm, created_at, marketing_channel_id, marketing_campaign_id, contact_id")
      .order("created_at", { ascending: false })
      .range(offset, offset + page - 1);
    const rows = (chunk ?? []) as any[];
    leads.push(...rows);
    if (rows.length < page) break;
  }

  const { data: existingRows } = await db
    .from("marketing_touchpoints")
    .select("crm_lead_id")
    .not("crm_lead_id", "is", null)
    .limit(100000);
  const existing = new Set((existingRows ?? []).map((r: any) => String(r.crm_lead_id)));

  let created = 0;
  let needsReview = 0;
  let already = 0;
  const batch: Record<string, unknown>[] = [];

  for (const lead of leads) {
    if (existing.has(String(lead.id))) {
      already += 1;
      continue;
    }
    const utm = (lead.utm ?? {}) as Record<string, unknown>;
    const gclid = str(utm.gclid ?? utm.gbraid ?? utm.wbraid);
    const fbclid = str(utm.fbclid);
    const ttclid = str(utm.ttclid);
    const utmSource = str(utm.utm_source ?? utm.source);
    const utmMedium = str(utm.utm_medium ?? utm.medium);

    const channel = resolveChannel({
      source: lead.source,
      utm_source: utmSource,
      utm_medium: utmMedium,
      gclid,
      fbclid,
      ttclid,
    });
    const channelId = (channel ? channels.get(channel.key) : null) ?? lead.marketing_channel_id ?? null;
    if (!channelId) {
      needsReview += 1;
      continue;
    }

    batch.push({
      crm_lead_id: lead.id,
      contact_id: lead.contact_id ?? null,
      occurred_at: lead.created_at,
      channel_id: channelId,
      campaign_id: lead.marketing_campaign_id ?? null,
      source: utmSource ?? str(lead.source),
      medium: utmMedium,
      campaign: str(utm.utm_campaign ?? utm.campaign ?? lead.campaign),
      content: str(utm.utm_content ?? utm.content),
      term: str(utm.utm_term ?? utm.term),
      referrer: str(utm.referrer),
      gclid,
      fbclid,
      ttclid,
      touchpoint_type: "lead",
      is_first_touch: true,
      is_last_touch: true,
    });
  }

  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500);
    const { error } = await db.from("marketing_touchpoints").insert(chunk as never);
    if (!error) created += chunk.length;
  }

  return { leads: leads.length, created, existing: already, needsReview };
}
