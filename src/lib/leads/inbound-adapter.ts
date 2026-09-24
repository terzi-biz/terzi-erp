/**
 * Провайдер-агностична межа вхідних лідів → канонічний `handleLeadIntake`.
 * Чисті функції (без I/O). Провайдери лише нормалізують; CRM-таблиці пише тільки intake.
 */
import type { IntakePayload } from "./intake.server";

export type IntakeFn = (p: IntakePayload) => Promise<{ status: string; leadId?: string; error?: string }>;

const s = (v: unknown): string | undefined => {
  const x = String(v ?? "").trim();
  return x ? x : undefined;
};

/** Сайт/лендінг: канонічний контракт тіла запиту (click ID окремо, нічого не вигадується). */
export function buildSiteIntakePayload(input: {
  name?: string; phone?: string; email?: string; message?: string;
  direction?: string; area?: number; address?: string;
  landing_url?: string; referrer?: string; form_id?: string;
  ga_client_id?: string; ga_session_id?: string;
  query?: Record<string, string | undefined>;
  external_id?: string; source?: string; provider?: string;
}): IntakePayload {
  const q = input.query ?? {};
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = s(q[k]); if (v) utm[k] = v;
  }
  const out: IntakePayload = {
    provider: input.provider ?? "web",
    source: input.source ?? utm.utm_source ?? "site",
    campaign: utm.utm_campaign,
    name: s(input.name), phone: s(input.phone), email: s(input.email), message: s(input.message),
    direction: s(input.direction), area: input.area, address: s(input.address),
    landing_url: s(input.landing_url), referrer: s(input.referrer), form_id: s(input.form_id),
    ga_client_id: s(input.ga_client_id), ga_session_id: s(input.ga_session_id),
    external_id: s(input.external_id),
    utm,
  };
  for (const k of ["gclid", "gbraid", "wbraid", "fbclid", "ttclid"] as const) {
    const v = s(q[k]); if (v) out[k] = v;
  }
  return JSON.parse(JSON.stringify(out)) as IntakePayload; // drop undefined
}

/** Meta webhook: витягує leadgen_id зі змін `leadgen`. */
export function parseMetaLeadgenIds(body: unknown): { leadgenId: string; formId?: string; createdTime?: number }[] {
  const out: { leadgenId: string; formId?: string; createdTime?: number }[] = [];
  const seen = new Set<string>();
  for (const e of ((body as any)?.entry ?? []) as any[]) {
    for (const c of (e?.changes ?? []) as any[]) {
      if (c?.field !== "leadgen") continue;
      const id = s(c?.value?.leadgen_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ leadgenId: id, formId: s(c?.value?.form_id), createdTime: Number(c?.value?.created_time) || undefined });
    }
  }
  return out;
}

export type MetaLeadDetails = {
  id: string; createdTime: string | null; campaign: string | null; formId: string | null;
  name?: string; phone?: string; email?: string; message?: string;
};

export function normalizeMetaLead(l: MetaLeadDetails): IntakePayload {
  const p: IntakePayload = {
    provider: "meta_lead_ads",
    source: "facebook",
    campaign: l.campaign ?? undefined,
    name: s(l.name), phone: s(l.phone), email: s(l.email), message: s(l.message),
    form_id: l.formId ?? undefined,
    external_id: `meta_lead:${l.id}`,
    utm: { utm_source: "facebook", utm_medium: "lead_ads", ...(l.campaign ? { utm_campaign: l.campaign } : {}) },
    first_touch: l.createdTime ?? undefined,
    last_touch: l.createdTime ?? undefined,
  };
  return JSON.parse(JSON.stringify(p)) as IntakePayload;
}

/** Обробка одного leadgen: помилка отримання деталей → жодного ліда. */
export async function processMetaLeadgen(
  leadgenId: string,
  deps: { fetchLead: (id: string) => Promise<MetaLeadDetails>; intake: IntakeFn },
): Promise<{ leadgenId: string; status: string; error?: string }> {
  let details: MetaLeadDetails;
  try {
    details = await deps.fetchLead(leadgenId);
  } catch (e) {
    return { leadgenId, status: "fetch_failed", error: String((e as Error).message ?? e).slice(0, 200) };
  }
  if (!s(details.phone) && !s(details.email)) return { leadgenId, status: "no_contact" };
  const r = await deps.intake(normalizeMetaLead(details));
  return { leadgenId, status: r.status, error: r.error };
}
