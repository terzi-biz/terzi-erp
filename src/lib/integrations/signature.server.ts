/** Перевірка підписів вебхуків. Порівняння — стале за часом. */

function toBytes(s: string) {
  return new TextEncoder().encode(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", toBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, toBytes(rawBody));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHmacSha256(
  rawBody: string,
  provided: string | null,
  secret: string,
): Promise<boolean> {
  if (!provided) return false;
  const expected = await hmacSha256Hex(rawBody, secret);
  const clean = provided.trim().replace(/^sha256=/i, "").toLowerCase();
  return timingSafeEqual(clean, expected);
}

/** Стабільний хеш тіла для захисту від дублікатів, коли зовнішній сервіс не дає ключа. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
