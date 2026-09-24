/**
 * Чисті (без I/O) правила побудови точки дотику з атрибуції.
 * Click ID зберігаються окремо (gclid ≠ gbraid ≠ wbraid); нічого не вигадується.
 */

export const TOUCH_ATTR_FIELDS = [
  "gclid", "gbraid", "wbraid", "fbclid", "ttclid",
  "source", "medium", "campaign", "content", "term", "referrer", "session_id",
] as const;
export type TouchAttrField = (typeof TOUCH_ATTR_FIELDS)[number];
export type TouchAttr = Partial<Record<TouchAttrField, string | null>>;

const s = (v: unknown): string | null => {
  const x = String(v ?? "").trim();
  return x ? x : null;
};

/** Атрибуція з `crm_leads.utm` / нормалізованого payload. */
export function touchAttrFromUtm(utm: Record<string, unknown> | null | undefined, fallback: { source?: unknown; campaign?: unknown } = {}): TouchAttr {
  const u = utm ?? {};
  return {
    gclid: s(u.gclid),
    gbraid: s(u.gbraid),
    wbraid: s(u.wbraid),
    fbclid: s(u.fbclid),
    ttclid: s(u.ttclid),
    source: s(u.utm_source ?? u.source) ?? s(fallback.source),
    medium: s(u.utm_medium ?? u.medium),
    campaign: s(u.utm_campaign ?? u.campaign) ?? s(fallback.campaign),
    content: s(u.utm_content ?? u.content),
    term: s(u.utm_term ?? u.term),
    referrer: s(u.referrer),
    session_id: s(u.ga_session_id ?? u.session_id),
  };
}

/** Будь-який Google click id — лише як сигнал каналу, не як значення колонки. */
export function googleClickSignal(a: TouchAttr): string | null {
  return a.gclid ?? a.gbraid ?? a.wbraid ?? null;
}

/**
 * Патч для існуючої точки дотику: заповнює ЛИШЕ порожні поля.
 * Непорожні історичні значення ніколи не замінюються; конфлікти повертаються окремо.
 */
export function missingAttrPatch(existing: TouchAttr, incoming: TouchAttr): { patch: TouchAttr; conflicts: TouchAttrField[] } {
  const patch: TouchAttr = {};
  const conflicts: TouchAttrField[] = [];
  for (const f of TOUCH_ATTR_FIELDS) {
    const cur = s(existing[f]);
    const inc = s(incoming[f]);
    if (!inc) continue;
    if (!cur) patch[f] = inc;
    else if (cur !== inc) conflicts.push(f);
  }
  return { patch, conflicts };
}
