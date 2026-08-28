/**
 * Єдиний резолвер ідентичності CRM (чиста логіка, без БД).
 *
 * Пріоритет пошуку: external ID → існуючий зв'язок → E.164 → нормалізований e-mail.
 * Результат завжди один із: exact | unique | ambiguous | conflict | not_found.
 * Резолвер нічого не змінює — це лише рішення для подальшого підтвердження оператором.
 */
import { toE164 } from "@/lib/phone";

export type IdentityStatus = "exact" | "unique" | "ambiguous" | "conflict" | "not_found";
export type IdentityMatchBy = "external_id" | "relation" | "phone_e164" | "email" | null;

export const IDENTITY_STATUS_LABEL: Record<IdentityStatus, string> = {
  exact: "Точний збіг",
  unique: "Однозначний збіг",
  ambiguous: "Кілька кандидатів",
  conflict: "Конфлікт даних",
  not_found: "Не знайдено",
};

export type IdentityCandidate = {
  id: string;
  externalSource?: string | null;
  externalId?: string | null;
  /** Уже наявний зв'язок (наприклад client_id у контакта). */
  relationId?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  email?: string | null;
};

export type IdentityQuery = {
  externalSource?: string | null;
  externalId?: string | null;
  relationId?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type IdentityResult = {
  status: IdentityStatus;
  matchBy: IdentityMatchBy;
  id: string | null;
  candidateIds: string[];
  /** Причина ambiguous/conflict/not_found — людською мовою для UI та журналу. */
  reason: string | null;
};

/** Нормалізація e-mail: регістр, пробіли, крапки й «+тег» для gmail. */
export function normalizeEmail(input: unknown): string | null {
  const raw = input == null ? null : String(input).trim().toLowerCase();
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  const [user, domain] = raw.split("@") as [string, string];
  const local = user.split("+")[0] ?? user;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function candidatePhone(c: IdentityCandidate): string | null {
  return c.phoneE164 ?? toE164(c.phone);
}

type Step = { by: Exclude<IdentityMatchBy, null>; ids: string[] };

/** Основний резолвер: чиста функція над списком кандидатів. */
export function resolveIdentity(query: IdentityQuery, candidates: IdentityCandidate[]): IdentityResult {
  const steps: Step[] = [];

  const extId = query.externalId ? String(query.externalId) : null;
  if (extId) {
    const src = query.externalSource ? String(query.externalSource).toLowerCase() : null;
    const ids = candidates
      .filter(
        (c) =>
          c.externalId != null &&
          String(c.externalId) === extId &&
          (!src || !c.externalSource || String(c.externalSource).toLowerCase() === src),
      )
      .map((c) => c.id);
    if (ids.length) steps.push({ by: "external_id", ids: unique(ids) });
  }

  if (query.relationId) {
    const ids = candidates.filter((c) => c.relationId && c.relationId === query.relationId).map((c) => c.id);
    if (ids.length) steps.push({ by: "relation", ids: unique(ids) });
  }

  const e164 = toE164(query.phone);
  if (e164) {
    const ids = candidates.filter((c) => candidatePhone(c) === e164).map((c) => c.id);
    if (ids.length) steps.push({ by: "phone_e164", ids: unique(ids) });
  }

  const email = normalizeEmail(query.email);
  if (email) {
    const ids = candidates.filter((c) => normalizeEmail(c.email) === email).map((c) => c.id);
    if (ids.length) steps.push({ by: "email", ids: unique(ids) });
  }

  if (!steps.length) {
    return { status: "not_found", matchBy: null, id: null, candidateIds: [], reason: "Жодного кандидата за ID, зв'язком, телефоном чи e-mail" };
  }

  // Конфлікт: різні однозначні кандидати за різними ознаками.
  const singles = unique(steps.filter((s) => s.ids.length === 1).map((s) => s.ids[0] as string));
  if (singles.length > 1) {
    return {
      status: "conflict",
      matchBy: steps[0]!.by,
      id: null,
      candidateIds: singles,
      reason: `Ознаки вказують на різні записи: ${steps.map((s) => `${s.by}→${s.ids.join(",")}`).join("; ")}`,
    };
  }

  const first = steps[0]!;
  if (first.ids.length > 1) {
    return {
      status: "ambiguous",
      matchBy: first.by,
      id: null,
      candidateIds: first.ids,
      reason: `Кілька записів за ознакою ${first.by}: ${first.ids.length}`,
    };
  }

  return {
    status: first.by === "external_id" || first.by === "relation" ? "exact" : "unique",
    matchBy: first.by,
    id: first.ids[0] as string,
    candidateIds: first.ids,
    reason: null,
  };
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}

// ---------------------------------------------------------------------------
// READ-ONLY dry-run: скільки зв'язків резолвер закрив би, без жодних змін у БД.
// ---------------------------------------------------------------------------

export type DryRunRows = {
  leads: { id: string; client_id: string | null; contact_id: string | null; external_source: string | null; external_id: string | null; phone?: string | null; email?: string | null }[];
  calls: { id: string; lead_id: string | null; client_id: string | null; contact_id: string | null; phone_e164: string | null; phone_norm: string | null; external_id: string | null; external_source: string | null }[];
  clients: IdentityCandidate[];
  contacts: (IdentityCandidate & { leadIds?: string[] })[];
};

export type DryRunBucket = Record<IdentityStatus, number> & { total: number; alreadyLinked: number };
export type DryRunReport = {
  leadToClient: DryRunBucket;
  leadToContact: DryRunBucket;
  callToLead: DryRunBucket;
  callToClient: DryRunBucket;
  callToContact: DryRunBucket;
  /** Жодних змін не виконано. */
  mode: "read_only";
};

function emptyBucket(): DryRunBucket {
  return { total: 0, alreadyLinked: 0, exact: 0, unique: 0, ambiguous: 0, conflict: 0, not_found: 0 };
}

function count(bucket: DryRunBucket, linked: boolean, status: IdentityStatus) {
  bucket.total += 1;
  if (linked) bucket.alreadyLinked += 1;
  bucket[status] += 1;
}

/** Чистий dry-run: тільки рахунки, жодних UPDATE/merge. */
export function dryRunIdentity(rows: DryRunRows): DryRunReport {
  const report: DryRunReport = {
    leadToClient: emptyBucket(),
    leadToContact: emptyBucket(),
    callToLead: emptyBucket(),
    callToClient: emptyBucket(),
    callToContact: emptyBucket(),
    mode: "read_only",
  };

  const contactById = new Map(rows.contacts.map((c) => [c.id, c]));

  for (const lead of rows.leads) {
    const contact = lead.contact_id ? contactById.get(lead.contact_id) : undefined;
    const query: IdentityQuery = {
      externalSource: lead.external_source ?? null,
      externalId: lead.external_id ?? null,
      relationId: contact?.relationId ?? null,
      phone: lead.phone ?? contact?.phone ?? contact?.phoneE164 ?? null,
      email: lead.email ?? contact?.email ?? null,
    };
    count(
      report.leadToClient,
      Boolean(lead.client_id),
      lead.client_id ? "exact" : resolveIdentity(query, rows.clients).status,
    );
    count(
      report.leadToContact,
      Boolean(lead.contact_id),
      lead.contact_id ? "exact" : resolveIdentity({ ...query, relationId: null }, rows.contacts).status,
    );
  }

  for (const call of rows.calls) {
    const phone = call.phone_e164 ?? call.phone_norm ?? null;
    const contactRes = call.contact_id
      ? ("exact" as IdentityStatus)
      : resolveIdentity({ externalSource: call.external_source, externalId: call.external_id, phone }, rows.contacts).status;
    count(report.callToContact, Boolean(call.contact_id), contactRes);

    const clientRes = call.client_id
      ? ("exact" as IdentityStatus)
      : resolveIdentity({ phone }, rows.clients).status;
    count(report.callToClient, Boolean(call.client_id), clientRes);

    let leadStatus: IdentityStatus = "not_found";
    if (call.lead_id) leadStatus = "exact";
    else {
      const contactId = call.contact_id ?? findContactIdByPhone(rows.contacts, phone);
      const leadIds = contactId ? rows.leads.filter((l) => l.contact_id === contactId).map((l) => l.id) : [];
      leadStatus = leadIds.length === 1 ? "unique" : leadIds.length > 1 ? "ambiguous" : "not_found";
    }
    count(report.callToLead, Boolean(call.lead_id), leadStatus);
  }

  return report;
}

function findContactIdByPhone(contacts: IdentityCandidate[], phone: string | null): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  const hits = contacts.filter((c) => (c.phoneE164 ?? toE164(c.phone)) === e164);
  return hits.length === 1 ? (hits[0] as IdentityCandidate).id : null;
}
