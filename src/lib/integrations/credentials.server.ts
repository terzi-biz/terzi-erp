/**
 * Ключі інтеграцій, введені в інтерфейсі. Шифруються AES-GCM на сервері,
 * зберігаються в таблиці без клієнтського доступу і підставляються в process.env
 * лише якщо там немає значення з секретного сховища (секрети середовища мають пріоритет).
 */
import { admin } from "@/lib/access.server";

const UI_SET = new Set<string>();
let loadedAt = 0;

async function aesKey(): Promise<CryptoKey> {
  const base = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!base) throw new Error("Сервер не налаштовано для шифрування ключів");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`terzi-cred:${base}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptValue(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)));
  return { ciphertext: b64(ct), iv: b64(iv) };
}
async function decryptValue(ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ciphertext));
  return new TextDecoder().decode(pt);
}

/** Підвантажує ключі з UI у process.env (кеш 60 с). Помилки не ламають запит. */
export async function hydrateCredentials(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000) return;
  loadedAt = Date.now();
  try {
    const db = await admin();
    const { data } = await db.from("integration_credentials").select("name,ciphertext,iv");
    const present = new Set<string>();
    for (const r of data ?? []) {
      present.add(r.name);
      if (process.env[r.name] && !UI_SET.has(r.name)) continue; // env має пріоритет
      try { process.env[r.name] = await decryptValue(r.ciphertext, r.iv); UI_SET.add(r.name); } catch { /* пошкоджений запис */ }
    }
    for (const n of [...UI_SET]) if (!present.has(n)) { delete process.env[n]; UI_SET.delete(n); }
  } catch (e) {
    console.error("hydrateCredentials", e instanceof Error ? e.message : "error");
  }
}

export function credentialSource(name: string): "env" | "ui" | null {
  if (!process.env[name]) return null;
  return UI_SET.has(name) ? "ui" : "env";
}
