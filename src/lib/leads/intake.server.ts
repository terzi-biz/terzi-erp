/**
 * Хвиля 4 — прийом вхідних лідів (сайт, Google Ads, Meta, TikTok).
 *
 * Ланцюг: заявка → контакт (за нормалізованим телефоном) → лід → (далі клієнт/замовлення
 * зшиваються в «Аудиті даних» з підтвердженням).
 *
 * Гарантії:
 *  - підпис HMAC-SHA256 обов'язковий (LEAD_INTAKE_SECRET);
 *  - rate-limit по хешу IP;
 *  - ідемпотентність через унікальний dedupe_hash;
 *  - у журнал не пишемо повний payload з відкритим телефоном — телефон нормалізований,
 *    сирі поля маскуються.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { extractAttribution, attributionToJson, type Attribution } from "@/lib/marketing/attribution-fields";

export interface IntakePayload {
  provider?: string;
  source?: string;
  campaign?: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  direction?: string;
  area?: number;
  address?: string;
  utm?: Record<string, string>;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ttclid?: string;
  landing_url?: string;
  referrer?: string;
  form_id?: string;
  ga_client_id?: string;
  ga_session_id?: string;
  first_touch?: string;
  last_touch?: string;
  external_id?: string;
}

/** Нормалізація українських номерів до +380XXXXXXXXX. */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 && d.startsWith("0")) d = `38${d}`;
  if (d.length === 9) d = `380${d}`;
  if (d.length === 11 && d.startsWith("80")) d = `3${d}`;
  return `+${d}`;
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, "").toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${ip}|${secret}`).digest("hex").slice(0, 32);
}

/** Дедуплікація: провайдер + контакт + суть звернення + доба. */
export function dedupeHash(p: IntakePayload, phoneNorm: string | null): string {
  const day = new Date().toISOString().slice(0, 10);
  const parts = [
    (p.provider ?? "web").toLowerCase(),
    p.external_id ?? "",
    phoneNorm ?? "",
    (p.email ?? "").toLowerCase(),
    (p.message ?? "").trim().slice(0, 200).toLowerCase(),
    p.external_id ? "" : day,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Маскування PII для журналу: +38050****123. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length <= 7 ? phone : `${phone.slice(0, 7)}****${phone.slice(-3)}`;
}

function maskPayload(p: IntakePayload): Record<string, unknown> {
  return {
    ...p,
    phone: maskPhone(normalizePhone(p.phone)),
    email: p.email ? p.email.replace(/^(.).*(@.*)$/, "$1***$2") : null,
  };
}

type Admin = {
  from: (t: string) => any;
};

export interface IntakeResult {
  status: "accepted" | "duplicate" | "rate_limited" | "rejected";
  leadId?: string;
  requestId?: string;
  contactId?: string;
  error?: string;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export async function handleLeadIntake(
  admin: Admin,
  payload: IntakePayload,
  ctx: { ipHash: string | null; signatureOk: boolean },
): Promise<IntakeResult> {
  const phoneNorm = normalizePhone(payload.phone);
  // Атрибуція: utm, click id (gclid/gbraid/wbraid/fbclid/ttclid), landing_url,
  // form_id, GA4 client/session, first/last touch. Порожні поля не вигадуються.
  const attribution: Attribution = { ...extractAttribution(payload as Record<string, unknown>) };
  const attributionJson = attributionToJson(attribution);
  if (!phoneNorm && !payload.email) {
    return { status: "rejected", error: "Потрібен телефон або e-mail" };
  }

  // 1. Rate-limit по IP
  if (ctx.ipHash) {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("lead_intake_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ctx.ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_MAX) return { status: "rate_limited", error: "Занадто багато запитів" };
  }

  const hash = dedupeHash(payload, phoneNorm);
  const provider = (payload.provider ?? "web").toLowerCase();

  // 2. Ідемпотентність: пробуємо зайняти dedupe_hash
  const { data: reserved, error: reserveErr } = await admin
    .from("lead_intake_events")
    .insert({
      provider,
      source: payload.source ?? provider,
      campaign: payload.campaign ?? null,
      ip_hash: ctx.ipHash,
      signature_ok: ctx.signatureOk,
      dedupe_hash: hash,
      contact_name: payload.name ?? null,
      phone_norm: phoneNorm,
      email: payload.email ?? null,
      utm: { ...(payload.utm ?? {}), ...attributionJson },
      gclid: attribution.gclid ?? null,
      fbclid: attribution.fbclid ?? null,
      payload: maskPayload(payload),
      status: "accepted",
    })
    .select("id")
    .maybeSingle();

  if (reserveErr) {
    const msg = String((reserveErr as { message?: string }).message ?? reserveErr);
    if (msg.includes("duplicate key") || msg.includes("lead_intake_events_dedupe_key")) {
      return { status: "duplicate" };
    }
    return { status: "rejected", error: msg };
  }
  const eventId = (reserved as { id: string } | null)?.id ?? null;

  try {
    // 3. Контакт за нормалізованим телефоном
    let contactId: string | null = null;
    if (phoneNorm) {
      const { data: existing } = await admin
        .from("crm_contacts").select("id").eq("phone_norm", phoneNorm).limit(1).maybeSingle();
      contactId = (existing as { id: string } | null)?.id ?? null;
    }
    if (!contactId) {
      const { data: created, error } = await admin
        .from("crm_contacts")
        .insert({
          full_name: payload.name || phoneNorm || payload.email || "Вхідний лід",
          phone: payload.phone ?? null,
          email: payload.email ?? null,
          external_source: provider,
          external_id: payload.external_id ?? null,
        })
        .select("id").maybeSingle();
      if (error) throw error;
      contactId = (created as { id: string } | null)?.id ?? null;
    }

    // 4. Відкритий лід цього контакту за останні 30 днів або новий
    let leadId: string | null = null;
    if (contactId) {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data: openLead } = await admin
        .from("crm_leads").select("id")
        .eq("contact_id", contactId).eq("status", "open")
        .gte("created_at", since).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      leadId = (openLead as { id: string } | null)?.id ?? null;
    }

    if (!leadId) {
      const { data: pipe } = await admin
        .from("crm_pipelines").select("id")
        .eq("is_active", true).order("is_default", { ascending: false }).order("sort_order")
        .limit(1).maybeSingle();
      const pipelineId = (pipe as { id: string } | null)?.id ?? null;
      let stageId: string | null = null;
      if (pipelineId) {
        const { data: stage } = await admin
          .from("crm_stages").select("id").eq("pipeline_id", pipelineId).order("sort_order").limit(1).maybeSingle();
        stageId = (stage as { id: string } | null)?.id ?? null;
      }
      const { data: lead, error } = await admin
        .from("crm_leads")
        .insert({
          title: payload.name || phoneNorm || "Вхідний лід",
          contact_id: contactId,
          pipeline_id: pipelineId,
          stage_id: stageId,
          source: payload.source ?? provider,
          campaign: payload.campaign ?? null,
          direction: payload.direction ?? null,
          area: payload.area ?? null,
          address: payload.address ?? null,
          status: "open",
          external_source: provider,
          external_id: payload.external_id ?? null,
          utm: { ...(payload.utm ?? {}), ...attributionJson },
          first_touch_at: attribution.first_touch_at ?? new Date().toISOString(),
          last_touch_at: attribution.last_touch_at ?? new Date().toISOString(),
          notes: payload.message ?? null,
        })
        .select("id").maybeSingle();
      if (error) throw error;
      leadId = (lead as { id: string } | null)?.id ?? null;
    } else {
      await admin.from("crm_leads").update({ last_touch_at: new Date().toISOString() }).eq("id", leadId);
    }

    // 5. Заявка (звернення)
    const { data: req, error: reqErr } = await admin
      .from("crm_requests")
      .insert({
        channel: provider,
        subject: payload.direction ? `Заявка: ${payload.direction}` : "Вхідна заявка",
        message: payload.message ?? null,
        source: payload.source ?? provider,
        campaign: payload.campaign ?? null,
        contact_name: payload.name ?? null,
        contact_phone: payload.phone ?? null,
        contact_phone_norm: phoneNorm,
        contact_email: payload.email ?? null,
        contact_id: contactId,
        lead_id: leadId,
        status: "new",
        external_id: payload.external_id ?? null,
        payload: { ...maskPayload(payload), attribution: attributionJson },
      })
      .select("id").maybeSingle();
    if (reqErr) throw reqErr;
    const requestId = (req as { id: string } | null)?.id ?? null;

    if (eventId) {
      await admin.from("lead_intake_events")
        .update({ lead_id: leadId, contact_id: contactId, request_id: requestId })
        .eq("id", eventId);
    }

    return {
      status: "accepted",
      leadId: leadId ?? undefined,
      requestId: requestId ?? undefined,
      contactId: contactId ?? undefined,
    };
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    if (eventId) {
      await admin.from("lead_intake_events").update({ status: "rejected", error }).eq("id", eventId);
    }
    return { status: "rejected", error };
  }
}
