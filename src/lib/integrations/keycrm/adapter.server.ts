/**
 * KeyCRMAdapter — keyCRM Open API v1.
 * Вебхуки: лише документовані події (order.change_order_status,
 * order.change_payment_status, lead.change_lead_status).
 * Решта змін — polling за updated_at.
 */
import type { AdapterContext, IntegrationAdapter, NormalizedEvent } from "../adapter.server";
import { KEYCRM_WEBHOOK_EVENTS } from "../keycrm-constants";
import { apiClient, applyExternal, entityPath, getSyncModes, pushInternal, runKeyCrmSync } from "./sync.server";
import { sha256Hex } from "../signature.server";

const DOC_EVENTS = new Set(KEYCRM_WEBHOOK_EVENTS.map((e) => e.key));

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const keycrmAdapter: IntegrationAdapter = {
  key: "keycrm",

  async testConnection(ctx) {
    const client = apiClient(ctx);
    const res = await client.get(entityPath(ctx, "buyers"), { limit: 1 });
    const total = res?.total ?? (Array.isArray(res?.data) ? res.data.length : 0);
    return { ok: true, message: `keyCRM відповідає, доступ до покупців підтверджено (${total})`, httpStatus: 200 };
  },

  /** keyCRM не підписує вебхуки — перевіряємо секретний endpoint token. */
  async verifyWebhook(ctx, req) {
    const expected = req.secret ?? ctx.secret("webhook_token");
    if (!expected) return false;
    const headerToken =
      req.headers.get("x-endpoint-token") ??
      req.headers.get("x-webhook-token") ??
      req.headers.get(req.signatureHeader ?? "x-endpoint-token") ??
      null;
    const urlToken = req.url ? new URL(req.url).searchParams.get("token") : null;
    const provided = headerToken ?? urlToken ?? "";
    return timingSafeEqual(provided, expected);
  },

  normalizeEvent(_ctx, raw, headers): NormalizedEvent {
    const body = (raw ?? {}) as Record<string, any>;
    const eventType = String(body.event ?? "keycrm.unknown");
    const ctxObj = (body.context ?? body.data ?? {}) as Record<string, any>;
    const entityId = ctxObj.id ?? ctxObj.order_id ?? ctxObj.card_id ?? null;
    const marker = [eventType, entityId, ctxObj.status_id ?? ctxObj.status ?? "", ctxObj.payment_status ?? "", ctxObj.updated_at ?? ""].join("|");
    return {
      eventType,
      payload: body,
      idempotencyKey: headers.get("x-idempotency-key") ?? `keycrm:${marker}`,
      entityType: eventType.startsWith("order") ? "order" : "lead_card",
      entityId: entityId != null ? String(entityId) : null,
    };
  },

  /** Обробка події: підтягуємо повну сутність через API і оновлюємо ERP. */
  async handleInbound(ctx, payload, eventType) {
    if (!DOC_EVENTS.has(eventType)) {
      return { ok: true, message: `Подія «${eventType}» не входить у документований перелік — збережено в журналі` };
    }
    const body = payload as Record<string, any>;
    const data = (body.context ?? body.data ?? {}) as Record<string, any>;
    const externalId = data.id ?? data.order_id ?? data.card_id ?? null;
    if (externalId == null) return { ok: false, message: "У події немає ідентифікатора сутності" };

    const modes = await getSyncModes(ctx.integration.id);
    const isOrder = eventType.startsWith("order.");
    const entity = isOrder ? "orders" : "lead_cards";
    const mode = modes[entity]?.mode ?? "external_master";
    if (mode === "off") return { ok: true, message: `Синхронізація «${entity}» вимкнена — подію проігноровано` };
    if (mode === "erp_master") return { ok: true, message: "ERP — головна система, вхідні зміни не застосовуються" };

    const client = apiClient(ctx);
    const path = entityPath(ctx, entity);
    const full = await client.get(`${path}/${externalId}`);
    const entityData = full?.data ?? full;
    if (!entityData?.id) return { ok: false, message: "keyCRM не повернув повну сутність" };

    const res = await applyExternal(ctx, entity, entityData, mode);
    if (entity === "orders") {
      const buyer = entityData.buyer ?? null;
      if (buyer?.id && (modes.buyers?.mode ?? "external_master") !== "off") {
        await applyExternal(ctx, "buyers", buyer, modes.buyers?.mode ?? "external_master");
      }
    }
    return {
      ok: true,
      message: res.skipped ? `Пропущено (${res.reason})` : `Оновлено ERP із keyCRM (${entity} #${externalId})`,
      data: { entity, external_id: externalId, ...res },
    };
  },

  /** Вихідні події: push запису ERP або запуск опитування. */
  async send(ctx, payload, eventType) {
    if (eventType === "keycrm.sync") {
      const results = await runKeyCrmSync(ctx, {
        entities: (payload.entities as string[] | undefined) ?? undefined,
        full: Boolean(payload.full),
      });
      return { ok: true, message: `Синхронізація виконана (${results.length} типів даних)`, data: results };
    }
    if (eventType === "keycrm.push") {
      const entity = String(payload.entity ?? "");
      const internalId = String(payload.internalId ?? "");
      if (!entity || !internalId) return { ok: false, message: "Потрібні поля entity та internalId" };
      const modes = await getSyncModes(ctx.integration.id);
      const mode = modes[entity]?.mode ?? "off";
      if (mode !== "erp_master" && mode !== "bidirectional") {
        return { ok: false, message: `Для «${entity}» вихідна синхронізація вимкнена (режим: ${mode})` };
      }
      return await pushInternal(ctx, entity, internalId);
    }
    if (eventType === "keycrm.ping") {
      const hash = await sha256Hex(JSON.stringify(payload ?? {}));
      return { ok: true, message: "Перевірка адаптера пройдена", data: { hash } };
    }
    return { ok: false, message: `Невідомий тип вихідної події: ${eventType}` };
  },
};

export type { AdapterContext };
