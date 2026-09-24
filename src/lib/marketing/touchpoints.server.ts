/**
 * Побудова маркетингових точок дотику (`marketing_touchpoints`) із лідів CRM.
 *
 * Детерміновано й ідемпотентно: для кожного ліда з визначеним джерелом
 * створюється рівно один first/last touch. Якщо джерело не розпізнане —
 * рядок не створюється (needs review), канал не вигадується.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_CHANNELS, resolveChannel } from "./channels";
import { googleClickSignal, missingAttrPatch, touchAttrFromUtm, TOUCH_ATTR_FIELDS, type TouchAttr } from "./touchpoint-row";

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
  /** Існуючих точок дотику, яким дозаповнено порожні поля. */
  patched?: number;
  /** Точок із різними непорожніми значеннями — не змінювались, потребують перевірки. */
  conflicts?: number;
  dryRun?: boolean;
};

export async function buildLeadTouchpoints(db: Db, opts: { limit?: number; dryRun?: boolean } = {}): Promise<TouchpointBuildResult> {
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
    .select(`id, crm_lead_id, is_first_touch, ${TOUCH_ATTR_FIELDS.join(", ")}`)
    .not("crm_lead_id", "is", null)
    .limit(100000);
  const existing = new Set((existingRows ?? []).map((r: any) => String(r.crm_lead_id)));
  // Оригінальна (перша) точка дотику кожного ліда — ціль безпечного дозаповнення.
  const firstByLead = new Map<string, any>();
  for (const r of (existingRows ?? []) as any[]) {
    const k = String(r.crm_lead_id);
    if (!firstByLead.has(k) || r.is_first_touch) firstByLead.set(k, r);
  }
  let patched = 0;
  let conflicts = 0;
  const dryRun = opts.dryRun === true;

  let created = 0;
  let needsReview = 0;
  let already = 0;
  const batch: Record<string, unknown>[] = [];

  for (const lead of leads) {
    const utm = (lead.utm ?? {}) as Record<string, unknown>;
    if (existing.has(String(lead.id))) {
      already += 1;
      // Не дублюємо: лише дозаповнюємо порожні поля оригінальної точки дотику.
      const tp = firstByLead.get(String(lead.id));
      if (tp) {
        const { patch, conflicts: c } = missingAttrPatch(tp as TouchAttr, touchAttrFromUtm(utm));
        conflicts += c.length ? 1 : 0;
        if (Object.keys(patch).length) {
          patched += 1;
          if (!dryRun) await db.from("marketing_touchpoints").update(patch as never).eq("id", tp.id);
        }
      }
      continue;
    }
    const attr = touchAttrFromUtm(utm);
    const gclid = googleClickSignal(attr);
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
      gclid: attr.gclid ?? null,
      gbraid: attr.gbraid ?? null,
      wbraid: attr.wbraid ?? null,
      fbclid,
      ttclid,
      session_id: attr.session_id ?? null,
      touchpoint_type: "lead",
      is_first_touch: true,
      is_last_touch: true,
    });
  }

  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500);
    if (dryRun) { created += chunk.length; continue; }
    const { error } = await db.from("marketing_touchpoints").insert(chunk as never);
    if (!error) created += chunk.length;
  }

  return { leads: leads.length, created, existing: already, needsReview, patched, conflicts, dryRun };
}

/**
 * Точка дотику з прийнятої заявки (idempotency — через lead_intake_events).
 * Нова: first+last touch. Існуючий лід: first touch зберігається, попередні last → false.
 * Канал лише з канонічного резолвера; не розпізнано → channel_id = null (не вгадуємо).
 */
export async function recordIntakeTouchpoint(db: Db, input: {
  leadId: string;
  contactId: string | null;
  isNewLead: boolean;
  occurredAt: string;
  utm: Record<string, unknown>;
  source?: string | null;
  campaign?: string | null;
  channel?: string | null;
}): Promise<{ id: string | null; channelResolved: boolean }> {
  const attr = touchAttrFromUtm(input.utm, { source: input.source, campaign: input.campaign });
  const ch = resolveChannel({
    channel: input.channel, source: input.source, utm_source: attr.source, utm_medium: attr.medium,
    gclid: googleClickSignal(attr), fbclid: attr.fbclid, ttclid: attr.ttclid,
  });
  const channels = ch ? await channelIndex(db) : null;
  const channelId = ch && channels ? channels.get(ch.key) ?? null : null;

  const { data: lead } = await db.from("crm_leads").select("marketing_campaign_id").eq("id", input.leadId).maybeSingle();
  const campaignId = (lead as any)?.marketing_campaign_id ?? null;

  let isFirst = input.isNewLead;
  if (!input.isNewLead) {
    const { count } = await db.from("marketing_touchpoints").select("id", { count: "exact", head: true })
      .eq("crm_lead_id", input.leadId).eq("is_first_touch", true);
    isFirst = (count ?? 0) === 0;
    await db.from("marketing_touchpoints").update({ is_last_touch: false } as never)
      .eq("crm_lead_id", input.leadId).eq("is_last_touch", true);
  }
  const row = buildIntakeTouchRow({ ...input, attr, channelId, campaignId, isFirst });
  const { data, error } = await db.from("marketing_touchpoints").insert(row as never).select("id").maybeSingle();
  if (error) throw error;
  return { id: (data as any)?.id ?? null, channelResolved: !!channelId };
}

export function buildIntakeTouchRow(i: {
  leadId: string; contactId: string | null; occurredAt: string; attr: TouchAttr;
  channelId: string | null; campaignId: string | null; isFirst: boolean;
}) {
  return {
    crm_lead_id: i.leadId,
    contact_id: i.contactId,
    occurred_at: i.occurredAt,
    channel_id: i.channelId,
    campaign_id: i.campaignId,
    ...Object.fromEntries(TOUCH_ATTR_FIELDS.map((f) => [f, i.attr[f] ?? null])),
    touchpoint_type: "lead",
    is_first_touch: i.isFirst,
    is_last_touch: true,
  };
}
