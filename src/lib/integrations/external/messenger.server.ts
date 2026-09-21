/**
 * Єдиний прийом вхідних повідомлень месенджерів (лише сервер).
 *
 * Кожне повідомлення:
 *  1) ідемпотентно реєструється як подія інтеграції (provider_event_id);
 *  2) якщо є телефон або e-mail — проходить канонічний прийом ліда
 *     (`handleLeadIntake`), тож дублі лідів не створюються.
 * Нових канонічних сутностей і таблиць не додаємо.
 */
import { enqueueEvent } from "../core.server";
import { ensureIntegrationRow } from "./store.server";

export type InboundMessage = {
  provider: "telegram" | "viber" | "whatsapp";
  externalId: string;
  name: string | null;
  phone: string | null;
  email?: string | null;
  text: string | null;
  raw: Record<string, unknown>;
};

export type InboundResult = { eventId: string | null; duplicate: boolean; leadId: string | null };

export async function recordInboundMessage(msg: InboundMessage): Promise<InboundResult> {
  const row = await ensureIntegrationRow(msg.provider);

  const enqueued = await enqueueEvent({
    integrationId: row.id as string,
    providerKey: msg.provider,
    direction: "inbound",
    eventType: "message.inbound",
    payload: msg.raw,
    providerEventId: msg.externalId || null,
    eventTs: new Date().toISOString(),
  });

  if (enqueued.duplicate) return { eventId: enqueued.id, duplicate: true, leadId: null };
  if (!msg.phone && !msg.email) return { eventId: enqueued.id, duplicate: false, leadId: null };

  const { handleLeadIntake } = await import("@/lib/leads/intake.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const result = await handleLeadIntake(
    supabaseAdmin as never,
    {
      provider: msg.provider,
      source: msg.provider,
      name: msg.name ?? undefined,
      phone: msg.phone ?? undefined,
      email: msg.email ?? undefined,
      message: msg.text ?? undefined,
      external_id: msg.externalId || undefined,
    } as never,
    { ipHash: null, signatureOk: true },
  );

  return { eventId: enqueued.id, duplicate: false, leadId: result.leadId ?? null };
}
