/**
 * Канонічний реєстр маркетингових каналів (клієнт-безпечний, без запитів до БД).
 *
 * Єдине джерело правди для нормалізації `source` / UTM / провайдера події
 * у канал атрибуції. Реклама (paid) і органіка/месенджери не змішуються:
 * spend дозволений лише для каналів із `paid: true`.
 * Невідоме джерело → `null` (needs review), ніколи не «Organic» за замовчуванням.
 */

export type ChannelKind = "ads" | "organic" | "messenger" | "marketplace" | "direct" | "referral";

export type CanonicalChannel = {
  key: string;
  label: string;
  kind: ChannelKind;
  /** Чи може канал мати рекламні витрати (spend / CPL / CAC). */
  paid: boolean;
  /** Провайдер інтеграції, який постачає дані каналу (якщо є). */
  provider: string | null;
  /** Ключові слова для зіставлення сирого джерела. */
  hints: string[];
};

export const CANONICAL_CHANNELS: CanonicalChannel[] = [
  { key: "meta_ads", label: "Meta Ads", kind: "ads", paid: true, provider: "meta_ads", hints: ["meta ads", "meta_ads", "facebook ads", "fb ads", "instagram ads", "ig ads", "fbclid"] },
  { key: "google_ads", label: "Google Ads", kind: "ads", paid: true, provider: "google_ads", hints: ["google ads", "google_ads", "googleads", "adwords", "gclid", "gbraid", "wbraid", "cpc google", "гугл реклама"] },
  { key: "tiktok_ads", label: "TikTok Ads", kind: "ads", paid: true, provider: "tiktok", hints: ["tiktok ads", "tiktok_ads", "tik tok ads", "ttclid"] },
  { key: "olx", label: "OLX", kind: "marketplace", paid: true, provider: null, hints: ["olx"] },
  { key: "seo", label: "SEO", kind: "organic", paid: false, provider: null, hints: ["seo", "organic search", "пошук", "пошукова"] },
  { key: "organic", label: "Organic", kind: "organic", paid: false, provider: null, hints: ["organic", "органик", "органічн"] },
  { key: "smm_direct", label: "SMM Direct", kind: "organic", paid: false, provider: null, hints: ["smm", "direct message", "директ", "смм"] },
  { key: "instagram", label: "Instagram", kind: "organic", paid: false, provider: "meta_ads", hints: ["instagram", "инстаграм", "інстаграм", "ig"] },
  { key: "facebook", label: "Facebook", kind: "organic", paid: false, provider: "meta_ads", hints: ["facebook", "фейсбук", "fb"] },
  { key: "tiktok", label: "TikTok", kind: "organic", paid: false, provider: "tiktok", hints: ["tiktok", "тікток", "тикток"] },
  { key: "telegram", label: "Telegram", kind: "messenger", paid: false, provider: "telegram", hints: ["telegram", "телеграм", "tg"] },
  { key: "viber", label: "Viber", kind: "messenger", paid: false, provider: "viber", hints: ["viber", "вайбер"] },
  { key: "whatsapp", label: "WhatsApp", kind: "messenger", paid: false, provider: "whatsapp", hints: ["whatsapp", "whats app", "вотсап", "ватсап"] },
  { key: "direct", label: "Direct", kind: "direct", paid: false, provider: null, hints: ["direct", "прямий", "прямой", "none", "(none)"] },
  { key: "referral", label: "Referral", kind: "referral", paid: false, provider: null, hints: ["referral", "рекоменд", "сарафан", "знайом"] },
];

const BY_KEY = new Map(CANONICAL_CHANNELS.map((c) => [c.key, c]));

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function getChannel(key: string | null | undefined): CanonicalChannel | null {
  return key ? BY_KEY.get(norm(key)) ?? null : null;
}

/**
 * Зіставляє сирі дані заявки з канонічним каналом.
 * Порядок пріоритету: явний канал → click id → utm_source/medium → source.
 * Невідоме значення повертає `null` (needs review), а не вигаданий канал.
 */
export function resolveChannel(input: {
  channel?: unknown;
  source?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  gclid?: unknown;
  fbclid?: unknown;
  ttclid?: unknown;
}): CanonicalChannel | null {
  const explicit = getChannel(norm(input.channel));
  if (explicit) return explicit;

  if (norm(input.gclid)) return BY_KEY.get("google_ads") ?? null;
  if (norm(input.fbclid)) return BY_KEY.get("meta_ads") ?? null;
  if (norm(input.ttclid)) return BY_KEY.get("tiktok_ads") ?? null;

  const candidates = [norm(input.utm_source), norm(input.source), norm(input.utm_medium)].filter(Boolean);
  for (const raw of candidates) {
    const exact = BY_KEY.get(raw.replace(/[\s-]+/g, "_"));
    if (exact) return exact;
    // довші підказки перевіряємо першими, щоб «facebook ads» не став «facebook»
    const hit = CANONICAL_CHANNELS.flatMap((c) => c.hints.map((h) => ({ c, h })))
      .sort((a, b) => b.h.length - a.h.length)
      .find(({ h }) => raw.includes(h));
    if (hit) return hit.c;
  }
  return null;
}

/** Канал, у який дозволено записувати рекламні витрати. */
export function acceptsSpend(key: string | null | undefined): boolean {
  return getChannel(key)?.paid ?? false;
}
