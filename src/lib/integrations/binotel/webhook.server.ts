/**
 * Спільна авторизація та розбір тіла вебхуків Binotel (лише сервер).
 * Binotel не підписує запити HMAC, тому доступ захищено секретним токеном
 * у query (?token=) або заголовку x-endpoint-token, з константним порівнянням.
 */
import { binotelCreds } from "./ops.server";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Перевірка секретного токена endpoint. Без токена доступ заборонено. */
export async function verifyBinotelToken(request: Request, integrationId: string | null) {
  const creds = await binotelCreds(integrationId);
  const expected = creds.webhookToken;
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = request.headers.get("x-endpoint-token") ?? url.searchParams.get("token") ?? "";
  return timingSafeEqual(provided, expected);
}

/** Binotel може надсилати JSON або form-urlencoded. */
export function parseBinotelBody(rawBody: string, contentType: string | null): Record<string, any> {
  if (!rawBody) return {};
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const out: Record<string, any> = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : { value: parsed };
  } catch {
    const params = new URLSearchParams(rawBody);
    const out: Record<string, any> = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return Object.keys(out).length ? out : { raw: rawBody.slice(0, 4000) };
  }
}
