/** Схеми довідників пакета А (клієнт-безпечний модуль). */
import { z } from "zod";

/** Ролі контрагента. Один запис може мати кілька ролей. */
export const COUNTERPARTY_ROLES = ["client", "supplier", "contractor", "partner"] as const;
export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];

export const COUNTERPARTY_ROLE_LABEL: Record<CounterpartyRole, string> = {
  client: "Клієнт",
  supplier: "Постачальник",
  contractor: "Підрядник",
  partner: "Партнер",
};

export const CLOSE_REASON_SCOPES = ["lead", "order"] as const;

export const companyRequisiteInput = z.object({
  /** Порожньо — нова компанія; заповнено — нова версія наявної. */
  code: z.string().min(1).max(50),
  legal_name: z.string().min(1).max(300),
  short_name: z.string().max(200).nullable().optional(),
  tax_id: z.string().max(50).nullable().optional(),
  registry_id: z.string().max(50).nullable().optional(),
  tax_group: z.string().max(100).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  bank_name: z.string().max(200).nullable().optional(),
  iban: z.string().max(60).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  signer_name: z.string().max(200).nullable().optional(),
  signer_position: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_default: z.boolean().default(false),
});

export const closeReasonInput = z.object({
  id: z.string().uuid().optional(),
  scope: z.enum(CLOSE_REASON_SCOPES).default("lead"),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  is_negative: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

export const archiveInput = z.object({ id: z.string().uuid(), archived: z.boolean() });

export const counterpartySearchInput = z.object({
  q: z.string().max(200).default(""),
  role: z.enum(COUNTERPARTY_ROLES).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

type ReqRow = { id: string; code: string; is_default: boolean | null; archived_at: string | null };
/**
 * Архівування активних реквізитів за замовчуванням заборонене, якщо після цього
 * не лишиться жодної активної основної компанії. Повертає текст помилки або null.
 */
export function requisiteArchiveError(targetId: string, archived: boolean, rows: ReqRow[]): string | null {
  if (!archived) return null;
  const t = rows.find((r) => r.id === targetId);
  if (!t) return "Запис не знайдено";
  if (t.archived_at || !t.is_default) return null;
  const otherDefault = rows.some((r) => r.id !== targetId && !r.archived_at && r.is_default);
  return otherDefault ? null : "Це основна компанія за замовчуванням. Спершу призначте іншу основну компанію (нова версія з позначкою «за замовчуванням»), потім архівуйте.";
}
