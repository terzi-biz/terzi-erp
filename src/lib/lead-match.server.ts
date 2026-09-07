/**
 * Автопідбір кандидатів «лід → клієнт».
 *
 * Детермінований скоринг за телефоном, іменем, адресою та напрямком.
 * Функція НЕ прив'язує автоматично: вона лише повертає кандидатів із
 * поясненням збігу. Прив'язку підтверджує користувач.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;

export interface MatchReason {
  field: "phone" | "name" | "address" | "direction";
  score: number;
  note: string;
}

export interface Candidate {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_address: string | null;
  score: number;
  reasons: MatchReason[];
}

export interface LeadMatch {
  lead_id: string;
  title: string;
  phone: string | null;
  address: string | null;
  direction: string | null;
  source: string | null;
  created_at: string | null;
  candidates: Candidate[];
}

const digitsOf = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const tail = (v: unknown) => {
  const d = digitsOf(v);
  return d.length >= 9 ? d.slice(-9) : null;
};

const clean = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[ʼ'`’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const tokens = (v: unknown) => clean(v).split(" ").filter((t) => t.length >= 3);

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  const hits = a.filter((t) => set.has(t)).length;
  return hits / Math.min(a.length, b.length);
}

/** Скоринг одного кандидата. Максимум 100. */
export function scoreCandidate(
  lead: { phone: string | null; name: string | null; address: string | null; direction: string | null },
  client: { name: string | null; phone: string | null; address: string | null; services: string[] },
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];

  const lp = tail(lead.phone);
  const cp = tail(client.phone);
  if (lp && cp && lp === cp) reasons.push({ field: "phone", score: 60, note: "Телефон збігається" });

  const nameOverlap = overlap(tokens(lead.name), tokens(client.name));
  if (nameOverlap >= 0.99) reasons.push({ field: "name", score: 25, note: "Ім'я збігається повністю" });
  else if (nameOverlap >= 0.5) reasons.push({ field: "name", score: 15, note: "Ім'я частково збігається" });

  const addrOverlap = overlap(tokens(lead.address), tokens(client.address));
  if (addrOverlap >= 0.6) reasons.push({ field: "address", score: 10, note: "Адреса збігається" });
  else if (addrOverlap >= 0.3) reasons.push({ field: "address", score: 5, note: "Адреса частково збігається" });

  const dir = clean(lead.direction);
  if (dir && client.services.some((s) => clean(s) === dir)) {
    reasons.push({ field: "direction", score: 5, note: "Напрямок збігається з попередніми замовленнями" });
  }

  return { score: reasons.reduce((s, r) => s + r.score, 0), reasons };
}

/** Ліди без клієнта + їхні кандидати. Тільки читання, під RLS користувача. */
export async function suggestLeadMatches(
  sb: Sb,
  opts: { limit?: number; min_score?: number; lead_id?: string | null },
): Promise<LeadMatch[]> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const minScore = opts.min_score ?? 20;

  let lq = sb
    .from("crm_leads")
    .select("id,title,address,direction,source,created_at,phone_e164,contact_id,client_id")
    .order("created_at", { ascending: false });
  if (opts.lead_id) lq = lq.eq("id", opts.lead_id);
  else lq = lq.is("client_id", null).limit(limit);
  const { data: leads, error } = await lq;
  if (error) throw new Error(error.message);
  const rows = (leads ?? []) as any[];
  if (!rows.length) return [];

  // Контакти лідів — джерело імені й телефону.
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  const contacts = new Map<string, any>();
  if (contactIds.length) {
    const { data } = await sb.from("crm_contacts").select("id,full_name,phone,phone_norm").in("id", contactIds);
    for (const c of data ?? []) contacts.set(c.id, c);
  }

  const { data: clientRows } = await sb.from("clients").select("id,name,phone,phone_e164,address").limit(5000);
  const clients = (clientRows ?? []) as any[];

  // Напрямки клієнтів із наявних замовлень.
  const services = new Map<string, string[]>();
  const { data: orderRows } = await sb.from("orders").select("client_id,service").not("client_id", "is", null).limit(5000);
  for (const o of orderRows ?? []) {
    if (!o.service) continue;
    const list = services.get(o.client_id) ?? [];
    list.push(String(o.service));
    services.set(o.client_id, list);
  }

  const byPhone = new Map<string, any[]>();
  for (const c of clients) {
    const t = tail(c.phone_e164 ?? c.phone);
    if (!t) continue;
    const list = byPhone.get(t) ?? [];
    list.push(c);
    byPhone.set(t, list);
  }

  return rows.map((lead) => {
    const contact = lead.contact_id ? contacts.get(lead.contact_id) : null;
    const phone = lead.phone_e164 ?? contact?.phone ?? null;
    const name = contact?.full_name ?? lead.title ?? null;
    const view = { phone, name, address: lead.address ?? null, direction: lead.direction ?? null };

    const pool = new Set<any>();
    const t = tail(phone);
    if (t) for (const c of byPhone.get(t) ?? []) pool.add(c);
    const nameTokens = tokens(name);
    if (nameTokens.length) {
      for (const c of clients) if (overlap(nameTokens, tokens(c.name)) >= 0.5) pool.add(c);
    }

    const candidates: Candidate[] = [...pool]
      .map((c) => {
        const { score, reasons } = scoreCandidate(view, {
          name: c.name,
          phone: c.phone_e164 ?? c.phone,
          address: c.address,
          services: services.get(c.id) ?? [],
        });
        return {
          client_id: c.id as string,
          client_name: String(c.name ?? "Без назви"),
          client_phone: (c.phone_e164 ?? c.phone ?? null) as string | null,
          client_address: (c.address ?? null) as string | null,
          score,
          reasons,
        };
      })
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      lead_id: lead.id as string,
      title: String(lead.title ?? "Лід"),
      phone,
      address: lead.address ?? null,
      direction: lead.direction ?? null,
      source: lead.source ?? null,
      created_at: lead.created_at ?? null,
      candidates,
    };
  });
}
