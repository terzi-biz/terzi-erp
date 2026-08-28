/**
 * Канонічний набір атрибуційних полів для вхідних заявок (сайт, лендінги, реклама).
 *
 * Зберігаємо лише те, що реально прийшло: відсутнє поле не вигадується.
 * Дані пишуться в наявні jsonb-колонки (`utm` ліда та `payload` заявки) —
 * нових колонок і міграцій не потрібно.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  landing_url?: string;
  referrer?: string;
  form_id?: string;
  ga_client_id?: string;
  ga_session_id?: string;
  first_touch_at?: string;
  last_touch_at?: string;
};

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s.slice(0, 512) : undefined;
}

function iso(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Розбір query-рядка landing_url — джерело utm/click id, якщо їх не передали окремо. */
function fromUrl(url: string | undefined): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const key of [...UTM_KEYS, ...CLICK_ID_KEYS]) {
      const v = u.searchParams.get(key);
      if (v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Витягує атрибуцію з довільного payload вебформи.
 * Приймає як плоскі поля, так і вкладений об'єкт `utm` / `ga`.
 */
export function extractAttribution(payload: Record<string, unknown> | null | undefined): Attribution {
  const p = (payload ?? {}) as Record<string, any>;
  const nestedUtm = (p.utm ?? {}) as Record<string, unknown>;
  const ga = (p.ga4 ?? p.ga ?? {}) as Record<string, unknown>;
  const landing = str(p.landing_url ?? p.page_url ?? p.url);
  const fromLanding = fromUrl(landing);

  const out: Attribution = {};
  for (const key of UTM_KEYS) {
    const v = str(p[key] ?? nestedUtm[key] ?? nestedUtm[key.replace("utm_", "")] ?? fromLanding[key]);
    if (v) out[key] = v;
  }
  for (const key of CLICK_ID_KEYS) {
    const v = str(p[key] ?? nestedUtm[key] ?? fromLanding[key]);
    if (v) out[key] = v;
  }
  if (landing) out.landing_url = landing;
  const referrer = str(p.referrer ?? p.referer);
  if (referrer) out.referrer = referrer;
  const formId = str(p.form_id ?? p.formId ?? p.form);
  if (formId) out.form_id = formId;
  const clientId = str(p.ga_client_id ?? ga.client_id ?? p.client_id);
  if (clientId) out.ga_client_id = clientId;
  const sessionId = str(p.ga_session_id ?? ga.session_id);
  if (sessionId) out.ga_session_id = sessionId;
  const first = iso(p.first_touch ?? p.first_touch_at);
  if (first) out.first_touch_at = first;
  const last = iso(p.last_touch ?? p.last_touch_at);
  if (last) out.last_touch_at = last;
  return out;
}

/** Чи є хоч одна ознака платного кліку (для offline conversions). */
export function hasClickId(a: Attribution): boolean {
  return CLICK_ID_KEYS.some((k) => Boolean(a[k]));
}

/** Значення для колонки `utm` (jsonb): лише непорожні поля. */
export function attributionToJson(a: Attribution): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => Boolean(v))) as Record<string, string>;
}
