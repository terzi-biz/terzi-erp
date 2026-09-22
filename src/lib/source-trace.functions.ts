/**
 * Наскрізний слід джерела для об'єкта / ліда / заміру.
 * Нічого не вигадує: відсутнє поле повертається як null і показується «немає даних».
 * Ланцюг: точка дотику (UTM / рекламний ідентифікатор) → лід → замір → замовлення.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SourceTrace {
  leadId: string | null;
  leadTitle: string | null;
  leadStatus: string | null;
  leadCreatedAt: string | null;
  source: string | null;
  externalSource: string | null;
  externalId: string | null;
  channelName: string | null;
  campaignName: string | null;
  utm: Record<string, string>;
  clickIds: Record<string, string>;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
  touchCount: number;
  measurementId: string | null;
  measurementStatus: string | null;
  measurementScheduledAt: string | null;
  /** Лід дійшов до заміру */
  convertedToMeasurement: boolean;
  /** Замір дійшов до замовлення */
  convertedToOrder: boolean;
  orderId: string | null;
  orderNumber: string | null;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"];

function pick(obj: unknown, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}

export const getSourceTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orderId: z.string().uuid().nullable().optional(),
      leadId: z.string().uuid().nullable().optional(),
      measurementId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SourceTrace> => {
    const sb = context.supabase;
    let leadId = data.leadId ?? null;
    let measurementId = data.measurementId ?? null;
    let orderId = data.orderId ?? null;

    if (measurementId) {
      const { data: m } = await sb.from("order_measurements")
        .select("id, lead_id, order_id, status, scheduled_at").eq("id", measurementId).maybeSingle();
      if (m) { leadId ??= (m as any).lead_id; orderId ??= (m as any).order_id; }
    }
    if (!leadId && orderId) {
      const { data: l } = await sb.from("crm_leads")
        .select("id").eq("order_id", orderId).order("created_at").limit(1).maybeSingle();
      if (l) leadId = (l as any).id;
    }
    if (!measurementId && (orderId || leadId)) {
      let q = sb.from("order_measurements").select("id, status, scheduled_at, order_id").order("created_at").limit(1);
      q = orderId ? q.eq("order_id", orderId) : q.eq("lead_id", leadId!);
      const { data: m } = await q.maybeSingle();
      if (m) { measurementId = (m as any).id; orderId ??= (m as any).order_id; }
    }

    const [leadRes, measRes, touchRes] = await Promise.all([
      leadId
        ? sb.from("crm_leads")
            .select("id, title, status, created_at, source, external_source, external_id, utm, campaign, order_id, marketing_channel_id, marketing_campaign_id")
            .eq("id", leadId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      measurementId
        ? sb.from("order_measurements").select("id, status, scheduled_at, order_id").eq("id", measurementId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      leadId
        ? sb.from("marketing_touchpoints")
            .select("occurred_at, source, medium, campaign, content, term, gclid, gbraid, wbraid, fbclid, ttclid, is_first_touch")
            .eq("crm_lead_id", leadId).order("occurred_at")
        : Promise.resolve({ data: [] } as any),
    ]);

    const lead: any = leadRes?.data ?? null;
    const meas: any = measRes?.data ?? null;
    const touches: any[] = touchRes?.data ?? [];
    orderId ??= lead?.order_id ?? meas?.order_id ?? null;

    const utm: Record<string, string> = { ...pick(lead?.utm, UTM_KEYS) };
    const clickIds: Record<string, string> = { ...pick(lead?.utm, CLICK_KEYS) };
    const first = touches[0] ?? null;
    if (first) {
      if (!utm['utm_source'] && first.source) utm['utm_source'] = first.source;
      if (!utm['utm_medium'] && first.medium) utm['utm_medium'] = first.medium;
      if (!utm['utm_campaign'] && first.campaign) utm['utm_campaign'] = first.campaign;
      if (!utm['utm_content'] && first.content) utm['utm_content'] = first.content;
      if (!utm['utm_term'] && first.term) utm['utm_term'] = first.term;
      for (const k of CLICK_KEYS) if (!clickIds[k] && first[k]) clickIds[k] = String(first[k]);
    }

    let channelName: string | null = null;
    let campaignName: string | null = lead?.campaign ?? null;
    if (lead?.marketing_channel_id) {
      const { data: ch } = await sb.from("marketing_channels").select("name").eq("id", lead.marketing_channel_id).maybeSingle();
      channelName = (ch as any)?.name ?? null;
    }
    if (lead?.marketing_campaign_id) {
      const { data: cp } = await sb.from("marketing_campaigns").select("name").eq("id", lead.marketing_campaign_id).maybeSingle();
      campaignName = (cp as any)?.name ?? campaignName;
    }

    let orderNumber: string | null = null;
    if (orderId) {
      const { data: o } = await sb.from("orders").select("number").eq("id", orderId).maybeSingle();
      orderNumber = (o as any)?.number ?? null;
    }

    return {
      leadId: lead?.id ?? null,
      leadTitle: lead?.title ?? null,
      leadStatus: lead?.status ?? null,
      leadCreatedAt: lead?.created_at ?? null,
      source: lead?.source ?? null,
      externalSource: lead?.external_source ?? null,
      externalId: lead?.external_id ?? null,
      channelName,
      campaignName,
      utm,
      clickIds,
      firstTouchAt: touches[0]?.occurred_at ?? null,
      lastTouchAt: touches.length ? touches[touches.length - 1].occurred_at : null,
      touchCount: touches.length,
      measurementId: meas?.id ?? null,
      measurementStatus: meas?.status ?? null,
      measurementScheduledAt: meas?.scheduled_at ?? null,
      convertedToMeasurement: Boolean(meas?.id),
      convertedToOrder: Boolean(orderId),
      orderId,
      orderNumber,
    };
  });
