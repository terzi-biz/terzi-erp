/**
 * Адаптери Integration Foundation: Google Ads, GA4, Meta Ads, Finmap, Сайт/лендінги.
 *
 * Ці адаптери працюють у наявному ядрі інтеграцій (черга, journal, retry, idempotency).
 * Реальні виклики провайдерів навмисно не виконуються: без credentials адаптер
 * повертає стан «заблоковано» (термінальна помилка, без нескінченних повторів)
 * і ніколи не імітує успішне зʼєднання.
 */
import process from "node:process";
import type { AdapterContext, AdapterResult, IntegrationAdapter, NormalizedEvent } from "../adapter.server";
import { FOUNDATION_CONTRACTS, contractStatus, type ProviderContract } from "../contracts";
import { extractAttribution, attributionToJson } from "@/lib/marketing/attribution-fields";
import { toE164 } from "@/lib/phone";

/** 424 → permanent для classifyError: повтори не мають сенсу без ключів. */
const BLOCKED_STATUS = 424;

function envSnapshot(): Record<string, string | undefined> {
  return process.env as unknown as Record<string, string | undefined>;
}

function status(contract: ProviderContract) {
  return contractStatus(contract, envSnapshot());
}

function blocked(contract: ProviderContract, message: string): AdapterResult {
  return { ok: false, message, httpStatus: BLOCKED_STATUS, data: { provider: contract.key, state: "blocked" } };
}

/** Нормалізація події за контрактом: тип події + атрибуція, без побічних дій. */
function normalize(contract: ProviderContract, raw: unknown, headers: Headers): NormalizedEvent {
  const body = (raw ?? {}) as Record<string, unknown>;
  const declared = String((body as any).event ?? (body as any).event_type ?? "");
  const eventType = contract.inbound.includes(declared) ? declared : `${contract.key}.${declared || "unknown"}`;
  const attribution = attributionToJson(extractAttribution(body));
  return {
    eventType,
    payload: { ...body, attribution },
    idempotencyKey: headers.get("x-idempotency-key"),
    providerEventId: (body as any).event_id != null ? String((body as any).event_id) : null,
    eventTs: (body as any).event_time ? String((body as any).event_time) : null,
  };
}

function baseAdapter(contract: ProviderContract): IntegrationAdapter {
  return {
    key: contract.key,
    async testConnection() {
      const s = status(contract);
      if (s.state === "blocked") return blocked(contract, s.message);
      return {
        ok: false,
        message: `${contract.label}: ключі знайдено, реальні виклики API ще не увімкнено`,
        httpStatus: BLOCKED_STATUS,
        data: { provider: contract.key, state: "ready" },
      };
    },
    normalizeEvent: (_ctx, raw, headers) => normalize(contract, raw, headers),
    async handleInbound(_ctx, _payload, eventType) {
      if (!contract.inbound.includes(eventType)) {
        return { ok: false, unsupported: true, message: `Подія «${eventType}» не підтримується адаптером ${contract.label}` };
      }
      return blocked(contract, status(contract).message);
    },
    async send(_ctx, _payload, eventType) {
      if (!contract.outbound.includes(eventType)) {
        return { ok: false, unsupported: true, message: `Вихідна подія «${eventType}» не описана контрактом ${contract.label}` };
      }
      return blocked(contract, status(contract).message);
    },
  };
}

export const googleAdsAdapter = baseAdapter(FOUNDATION_CONTRACTS.google_ads as ProviderContract);
export const ga4Adapter = baseAdapter(FOUNDATION_CONTRACTS.ga4 as ProviderContract);
export const metaAdsAdapter = baseAdapter(FOUNDATION_CONTRACTS.meta_ads as ProviderContract);

/** Finmap: джерело фактичних фінансових операцій. ERP лише дзеркалить, не дублює. */
const finmapContract = FOUNDATION_CONTRACTS.finmap as ProviderContract;
export const finmapAdapter: IntegrationAdapter = {
  ...baseAdapter(finmapContract),
  async handleInbound(ctx, payload, eventType) {
    if (!finmapContract.inbound.includes(eventType)) {
      return { ok: false, unsupported: true, message: `Подія «${eventType}» не описана контрактом Finmap` };
    }
    const s = status(finmapContract);
    if (s.state === "blocked") return blocked(finmapContract, s.message);
    const { planFinmapSync } = await import("./finmap.server");
    const plan = planFinmapSync(ctx.config, payload, eventType);
    return { ok: false, message: plan.message, httpStatus: BLOCKED_STATUS, data: plan };
  },
};

/** Сайт і лендінги: єдиний вхід у наявний CRM-ланцюг, без другої CRM. */
const websiteContract = FOUNDATION_CONTRACTS.website as ProviderContract;
export const websiteAdapter: IntegrationAdapter = {
  ...baseAdapter(websiteContract),
  async verifyWebhook(_ctx, req) {
    const secret = req.secret ?? process.env.LEAD_INTAKE_SECRET ?? null;
    if (!secret) return false;
    const { verifySignature } = await import("@/lib/leads/intake.server");
    return verifySignature(req.rawBody, req.headers.get(req.signatureHeader ?? "x-terzi-signature") ?? "", secret);
  },
  async handleInbound(_ctx, payload, eventType) {
    if (!websiteContract.inbound.includes(eventType)) {
      return { ok: false, unsupported: true, message: `Подія «${eventType}» не підтримується формою сайту` };
    }
    const attribution = extractAttribution(payload);
    const { handleLeadIntake } = await import("@/lib/leads/intake.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const p = payload as Record<string, any>;
    const res = await handleLeadIntake(
      supabaseAdmin as never,
      {
        provider: "website",
        source: attribution.utm_source ?? p.source ?? "website",
        campaign: attribution.utm_campaign ?? p.campaign,
        name: p.name,
        phone: p.phone,
        email: p.email,
        message: p.message,
        direction: p.direction,
        address: p.address,
        external_id: p.external_id,
        utm: attributionToJson(attribution),
        gclid: attribution.gclid,
        fbclid: attribution.fbclid,
      } as never,
      { ipHash: null, signatureOk: true },
    );
    return {
      ok: res.status === "accepted" || res.status === "duplicate",
      message: `Заявка з сайту: ${res.status}${res.error ? ` — ${res.error}` : ""}`,
      data: { status: res.status, lead_id: res.leadId ?? null, phone_e164: toE164(p.phone) },
    };
  },
};

export const FOUNDATION_ADAPTERS: IntegrationAdapter[] = [
  googleAdsAdapter,
  ga4Adapter,
  metaAdsAdapter,
  finmapAdapter,
  websiteAdapter,
];
