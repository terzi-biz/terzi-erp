/**
 * Control Plane Wave 2 — реєстр довідників.
 * Авторитетні довідники (власні таблиці) лише реєструються — дані не копіюються.
 * Нові/безхазяйні списки — config_entries kind=dictionary (версійовано, з архівом).
 */
import { z } from "zod";

export interface ExternalDictionary {
  code: string;
  label: string;
  table: string;
  /** Де редагується авторитетне джерело. */
  adminHint: string;
  /** Маршрут авторитетного розділу (якщо існує). */
  adminRoute?: "/settings" | "/clients" | "/marketing/channels" | "/crm" | "/marketing/leads" | "/warehouse";
  archivable: boolean;
}

/** Існуючі авторитетні довідники ERP (джерело правди — їхні таблиці). */
export const EXTERNAL_DICTIONARIES: readonly ExternalDictionary[] = [
  { code: "close_reasons", label: "Причини закриття", table: "close_reasons", adminHint: "Налаштування → Компанія → Причини закриття", adminRoute: "/settings", archivable: true },
  { code: "client_groups", label: "Групи клієнтів", table: "client_groups", adminHint: "Клієнти", adminRoute: "/clients", archivable: false },
  { code: "crm_sources", label: "Джерела / канали CRM", table: "marketing_channels", adminHint: "Маркетинг → Канали", adminRoute: "/marketing/channels", archivable: true },
  { code: "crm_pipelines", label: "Воронки CRM", table: "crm_pipelines", adminHint: "CRM → Воронки", adminRoute: "/crm", archivable: true },
  { code: "lead_reasons", label: "Причини дискваліфікації лідів", table: "marketing_lead_reasons", adminHint: "Маркетинг → Ліди", adminRoute: "/marketing/leads", archivable: true },
  { code: "units", label: "Одиниці виміру складу", table: "stock_item_pack_units", adminHint: "Склад", adminRoute: "/warehouse", archivable: false },
];

const EXTERNAL_CODES = new Set(EXTERNAL_DICTIONARIES.map((d) => d.code));

export function validateDictionaryKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{1,47}$/.test(key) && !EXTERNAL_CODES.has(key);
}

const itemSchema = z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/),
  label_uk: z.string().min(1).max(120),
  label_ru: z.string().max(120).optional(),
  order: z.number().int().min(0).max(10000).optional(),
  archived: z.boolean().optional(),
  metadata: z.record(z.string().max(48), z.union([z.string().max(300), z.number(), z.boolean()])).optional(),
}).strict();
export type DictionaryItem = z.infer<typeof itemSchema>;

export const dictionarySchema = z.object({
  label_uk: z.string().min(1).max(120),
  label_ru: z.string().max(120).optional(),
  description: z.string().max(300).optional(),
  items: z.array(itemSchema).max(1000),
}).strict().superRefine((v, ctx) => {
  const codes = v.items.map((i) => i.code);
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", message: "Коди елементів мають бути унікальними", path: ["items"] });
});
export type Dictionary = z.infer<typeof dictionarySchema>;

/** Елементи не видаляються після публікації — лише архівуються (історія читається). */
export function dictionaryTransitionErrors(prev: unknown, next: unknown): string[] {
  const a = dictionarySchema.safeParse(prev);
  const b = dictionarySchema.safeParse(next);
  if (!a.success || !b.success) return [];
  const nextCodes = new Set(b.data.items.map((i) => i.code));
  const removed = a.data.items.map((i) => i.code).filter((c) => !nextCodes.has(c));
  return removed.length ? [`Елементи не видаляються, а архівуються: ${removed.join(", ")}`] : [];
}

/** Доступні для нового вибору (активні), впорядковані. */
export function selectableItems(d: Dictionary | null | undefined): DictionaryItem[] {
  return (d?.items ?? []).filter((i) => !i.archived).sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || x.code.localeCompare(y.code));
}

/** Історичне відображення: архівний елемент читається з позначкою. */
export function dictionaryLabel(d: Dictionary | null | undefined, code: string | null | undefined, lang: "ua" | "ru" = "ua"): string {
  if (!code) return "—";
  const it = d?.items.find((i) => i.code === code);
  if (!it) return code;
  const l = lang === "ru" && it.label_ru ? it.label_ru : it.label_uk;
  return it.archived ? `${l} (архів)` : l;
}
