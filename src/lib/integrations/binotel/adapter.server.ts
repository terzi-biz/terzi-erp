/**
 * BinotelAdapter — режим підготовки (schema-driven).
 * Жоден endpoint, ключ, підпис чи подія не вигадані: адаптер працює
 * виключно за маніфестом провайдера, який заповнюється після отримання
 * офіційної документації Binotel. До того — приймання вебхуків у чергу,
 * нормалізація телефонів, пошук клієнта, лід і задача по пропущеному дзвінку.
 */
import { admin } from "../../access.server";
import type { AdapterContext, IntegrationAdapter } from "../adapter.server";
import { BINOTEL_MANIFEST_TEMPLATE, BINOTEL_STATUS_LABEL } from "../binotel-manifest";
import { normPhone } from "../keycrm/sync.server";
import { classifyBinotelEvent } from "./events";

type Manifest = typeof BINOTEL_MANIFEST_TEMPLATE & Record<string, any>;

export function binotelManifest(ctx: AdapterContext): Manifest {
  const fromConfig = ((ctx.config as any)?.manifest ?? {}) as Record<string, unknown>;
  return { ...BINOTEL_MANIFEST_TEMPLATE, ...fromConfig } as Manifest;
}

function isReady(m: Manifest) {
  return Boolean(m.base_url) && (m.credential_fields?.length ?? 0) > 0;
}

/** Пошук контакту/клієнта за нормалізованим номером. */
async function findByPhone(phone: string | null) {
  if (!phone) return { contact: null as any, lead: null as any, client: null as any };
  const db = await admin();
  const { data: contact } = await db.from("crm_contacts").select("id,full_name,client_id").eq("phone_norm", phone).limit(1).maybeSingle();
  let lead: any = null;
  if (contact) {
    const { data } = await db
      .from("crm_leads")
      .select("id,title,status,order_id,client_id")
      .eq("contact_id", (contact as any).id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = data ?? null;
  }
  let client: any = null;
  const clientId = (contact as any)?.client_id ?? lead?.client_id ?? null;
  if (clientId) {
    const { data } = await db.from("clients").select("id,name").eq("id", clientId).maybeSingle();
    client = data ?? null;
  }
  return { contact: contact ?? null, lead, client };
}

async function ownerFor(integrationId: string) {
  const db = await admin();
  const { data } = await db.from("integrations").select("created_by").eq("id", integrationId).maybeSingle();
  return ((data as any)?.created_by as string) ?? null;
}

/** Мапінг сирої події дзвінка через manifest.call_field_mapping. */
function mapCall(m: Manifest, raw: Record<string, any>) {
  const map = m.call_field_mapping ?? {};
  const pick = (field: string, fallbacks: string[] = []) => {
    const key = (map as any)[field];
    if (key && raw[key] !== undefined) return raw[key];
    for (const f of fallbacks) if (raw[f] !== undefined) return raw[f];
    return null;
  };
  return {
    externalId: pick("external_id", ["generalCallID", "callId", "call_id", "id"]),
    from: pick("from_number", ["externalNumber", "callerID", "from"]),
    to: pick("to_number", ["internalNumber", "to"]),
    direction: pick("direction", ["callType", "direction"]),
    duration: pick("duration_sec", ["billsec", "duration"]),
    status: pick("status", ["disposition", "status"]),
    startedAt: pick("started_at", ["startTime", "started_at"]),
    recording: pick("recording_url", ["recordUrl", "recording_url"]),
    extension: pick("extension", ["internalNumber", "extension"]),
  };
}

export const binotelAdapter: IntegrationAdapter = {
  key: "binotel",

  /** Реальна перевірка REST API 4.0: список співробітників компанії. */
  async testConnection(ctx) {
    const { binotelCreds } = await import("./ops.server");
    const { binotelRequest, extractCollection } = await import("./client.server");
    const creds = await binotelCreds(ctx.integration.id);
    if (!creds.key || !creds.secret) {
      return { ok: false, message: "Не задано BINOTEL_API_KEY / BINOTEL_API_SECRET" };
    }
    try {
      const res = await binotelRequest({ key: creds.key, secret: creds.secret }, "employees", {}, { integrationId: ctx.integration.id });
      const list = extractCollection(res, ["listOfEmployees", "employeesData", "employees", "data"]);
      return { ok: true, message: `Binotel відповідає. Співробітників: ${list.length}` };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Binotel недоступний", httpStatus: e?.status ?? undefined };
    }
  },

  /** Поки правила підпису невідомі — приймаємо лише за секретним endpoint token. */
  async verifyWebhook(ctx, req) {
    const m = binotelManifest(ctx);
    const mode = m.signature_validation?.mode ?? "unknown";
    const expected = req.secret ?? ctx.secret("webhook_token");
    if (mode === "hmac_sha256" && expected) {
      const { verifyHmacSha256 } = await import("../signature.server");
      return verifyHmacSha256(req.rawBody, req.headers.get(m.signature_validation?.header ?? req.signatureHeader ?? "x-signature"), expected);
    }
    if (!expected) return false;
    const provided =
      req.headers.get("x-endpoint-token") ??
      (req.url ? new URL(req.url).searchParams.get("token") : null) ??
      "";
    if (provided.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  },

  normalizeEvent(ctx, raw, headers) {
    const body = (raw ?? {}) as Record<string, any>;
    const m = binotelManifest(ctx);
    const cls = classifyBinotelEvent(body);
    const call = mapCall(m, body);
    const externalId = call.externalId ? String(call.externalId) : null;
    return {
      eventType: cls.eventType,
      payload: body,
      idempotencyKey:
        headers.get("x-idempotency-key") ??
        (cls.providerEventId ? `binotel:${cls.providerEventId}` : externalId ? `binotel:${cls.eventType}:${externalId}` : null),
      providerEventId: cls.providerEventId,
      eventTs: cls.eventTs,
      entityType: "call",
      entityId: externalId,
    };
  },

  /** Зберігає дзвінок, знаходить клієнта, за потреби створює лід і задачу. */
  async handleInbound(ctx, payload, eventType) {
    const cls = classifyBinotelEvent(payload as Record<string, any>);
    if (!cls.supported) {
      // Не позначаємо успіхом: подія фіксується як unsupported_event без CRM-побічних дій.
      return { ok: false, unsupported: true, message: cls.reason ?? `Подія «${eventType}» не підтримується` };
    }
    const { handleCallCompleted } = await import("./calls.server");
    const result = await handleCallCompleted(ctx.integration.id, payload as Record<string, any>);
    return {
      ok: true,
      message: `Дзвінок Binotel оброблено (${eventType})`,
      data: result,
    };
  },

  async send(ctx, payload, eventType) {
    const m = binotelManifest(ctx);
    if (eventType === "binotel.click_to_call") {
      const cfg = m.click_to_call_configuration ?? { enabled: false };
      if (!cfg.enabled || !cfg.path || !m.base_url) {
        return { ok: false, message: "Click-to-Call не активовано: очікує офіційний API-метод Binotel" };
      }
      return { ok: false, message: "Click-to-Call: метод у маніфесті задано, але виклик буде увімкнено після перевірки на тестових credentials" };
    }
    return { ok: false, message: `${BINOTEL_STATUS_LABEL}: вихідні виклики недоступні (${eventType})` };
  },
};
