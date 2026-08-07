/**
 * Прив'язка лідів CRM до маркетингових каналів і кампаній.
 * Детерміновано: джерело/UTM ліда → канал (довідник marketing_channels) → кампанія.
 * Жодних вигаданих даних: якщо джерело порожнє — канал не проставляється.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<any, any, any>;

/** Ключові слова для зіставлення тексту джерела з каналом довідника. */
const CHANNEL_HINTS: Record<string, string[]> = {
  google_ads: ["google ads", "googleads", "adwords", "гугл реклама", "cpc google"],
  meta_ads: ["meta", "facebook ads", "fb ads", "instagram ads"],
  tiktok_ads: ["tiktok ads", "tik tok ads"],
  olx: ["olx"],
  seo: ["seo", "organic", "органик", "органічн", "пошук"],
  gbp: ["google business", "gbp", "карти", "maps"],
  instagram: ["instagram", "инстаграм", "інстаграм", "ig"],
  facebook: ["facebook", "фейсбук", "fb"],
  tiktok_organic: ["tiktok", "тікток", "тикток"],
  telegram: ["telegram", "телеграм", "tg"],
  viber: ["viber", "вайбер"],
  whatsapp: ["whatsapp", "вотсап"],
  binotel: ["binotel", "дзвінок", "звонок", "call", "телефон"],
  site_forms: ["сайт", "site", "форма", "web", "terzi.com"],
  adsquiz: ["adsquiz", "quiz", "квіз", "квиз"],
  email: ["email", "mail", "пошта"],
  partners: ["партнер", "partner", "підрядник"],
  referrals: ["рекоменд", "сарафан", "referral", "знайом"],
  repeat: ["повторн", "постоянн", "постійн"],
  outdoor: ["зовнішн", "билборд", "банер"],
  flyers: ["флаєр", "флаер", "листівк"],
  qr: ["qr"],
};

function normalize(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function matchChannelKey(raw: string): string | null {
  if (!raw) return null;
  for (const [key, hints] of Object.entries(CHANNEL_HINTS)) {
    if (hints.some((h) => raw.includes(h))) return key;
  }
  return null;
}

type LeadRow = {
  id: string;
  source: string | null;
  campaign: string | null;
  utm: Record<string, unknown> | null;
  created_at: string;
  marketing_channel_id: string | null;
  marketing_campaign_id: string | null;
  first_touch_at: string | null;
  last_touch_at: string | null;
};

export async function syncLeadAttribution(sb: Db) {
  const { data: channels } = await sb.from("marketing_channels").select("id, key, name");
  const byKey = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of channels ?? []) {
    byKey.set(normalize(c.key), c.id as string);
    byName.set(normalize(c.name), c.id as string);
  }

  const { data: leads } = await sb
    .from("crm_leads")
    .select("id, source, campaign, utm, created_at, marketing_channel_id, marketing_campaign_id, first_touch_at, last_touch_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const { data: existingCampaigns } = await sb.from("marketing_campaigns").select("id, name, channel_id");
  const campaignIndex = new Map<string, string>();
  for (const c of existingCampaigns ?? []) campaignIndex.set(`${c.channel_id ?? ""}|${normalize(c.name)}`, c.id as string);

  let attributed = 0;
  let campaignsCreated = 0;
  let skipped = 0;

  for (const lead of (leads ?? []) as LeadRow[]) {
    const utm = (lead.utm ?? {}) as Record<string, unknown>;
    const rawSource = normalize(lead.source) || normalize(utm.source) || normalize(utm.medium);
    const key = matchChannelKey(rawSource);
    const channelId = lead.marketing_channel_id
      ?? (key ? byKey.get(key) ?? null : null)
      ?? byName.get(rawSource)
      ?? byKey.get(rawSource)
      ?? null;

    const campaignName = String(lead.campaign ?? utm.campaign ?? "").trim();
    let campaignId = lead.marketing_campaign_id ?? null;

    if (!channelId && !campaignName) { skipped++; continue; }

    if (!campaignId && campaignName) {
      const cacheKey = `${channelId ?? ""}|${normalize(campaignName)}`;
      campaignId = campaignIndex.get(cacheKey) ?? null;
      if (!campaignId) {
        const { data: created } = await sb
          .from("marketing_campaigns")
          .insert({ name: campaignName, channel_id: channelId, status: "active", currency: "UAH" })
          .select("id")
          .maybeSingle();
        if (created?.id) {
          campaignId = created.id as string;
          campaignIndex.set(cacheKey, campaignId);
          campaignsCreated++;
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (channelId && channelId !== lead.marketing_channel_id) patch.marketing_channel_id = channelId;
    if (campaignId && campaignId !== lead.marketing_campaign_id) patch.marketing_campaign_id = campaignId;
    if (!lead.first_touch_at) patch.first_touch_at = lead.created_at;
    if (!lead.last_touch_at) patch.last_touch_at = lead.created_at;
    if (!Object.keys(patch).length) { skipped++; continue; }

    const { error } = await sb.from("crm_leads").update(patch).eq("id", lead.id);
    if (!error) attributed++;
  }

  return { leads: (leads ?? []).length, attributed, campaignsCreated, skipped };
}
