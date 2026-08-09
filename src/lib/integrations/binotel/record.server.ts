/**
 * Посилання на аудіозапис розмови Binotel (лише сервер).
 * Binotel не віддає готовий URL у вебхуку — його треба запитати за generalCallID.
 * Отриманий URL кешуємо в crm_calls.recording_url, щоб не смикати API повторно.
 */
import { admin } from "../../access.server";
import { binotelCreds, getBinotelIntegration } from "./ops.server";
import { binotelRequest } from "./client.server";

const URL_KEYS = ["url", "link", "recordUrl", "recordingUrl", "callRecordLink", "record", "file"];

function pickUrl(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const k of URL_KEYS) {
    const v = payload[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  for (const v of Object.values(payload)) {
    if (v && typeof v === "object") {
      const nested = pickUrl(v);
      if (nested) return nested;
    }
  }
  return null;
}

/** Повертає посилання на запис або null, якщо запис недоступний. */
export async function fetchCallRecordingUrl(callId: string): Promise<{ url: string | null; reason?: string }> {
  const db = await admin();
  const { data: call } = await db
    .from("crm_calls")
    .select("id,recording_url,external_id,payload,external_source")
    .eq("id", callId)
    .maybeSingle();

  if (!call) return { url: null, reason: "Дзвінок не знайдено" };
  if (call.recording_url) return { url: call.recording_url as string };
  if (call.external_source !== "binotel") return { url: null, reason: "Для цього дзвінка немає запису" };

  const payload = (call.payload ?? {}) as Record<string, unknown>;
  const generalCallId =
    (payload["generalCallID"] as string | undefined) ??
    (payload["generalCallId"] as string | undefined) ??
    (call.external_id as string | null) ??
    null;
  if (!generalCallId) return { url: null, reason: "Немає ідентифікатора дзвінка Binotel" };

  const integration = await getBinotelIntegration();
  const creds = await binotelCreds(integration?.id ?? null);
  if (!creds.key || !creds.secret) return { url: null, reason: "Не налаштовано доступ до Binotel" };

  let res: any;
  try {
    res = await binotelRequest(
      { key: creds.key, secret: creds.secret },
      "callRecord",
      { generalCallID: String(generalCallId) },
      { integrationId: integration?.id ?? null, quiet: true },
    );
  } catch (e: any) {
    return { url: null, reason: e?.message ?? "Binotel не повернув запис" };
  }

  const url = pickUrl(res);
  if (!url) return { url: null, reason: "Запис недоступний" };

  await db
    .from("crm_calls")
    .update({ recording_url: url, recording_available: true, recording_checked_at: new Date().toISOString() })
    .eq("id", callId);

  return { url };
}
