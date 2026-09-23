/**
 * Control Plane Wave 2 — кастомні поля.
 * Визначення: config_entries (kind=custom_field, key=`<entity>.<field_key>`).
 * Значення: public.custom_field_values (без runtime DDL). Core-колонки не зачіпаються.
 */
import { z } from "zod";

export const CUSTOM_FIELD_TYPES = [
  "text", "long_text", "number", "money", "percentage", "boolean", "date", "datetime",
  "phone", "email", "single_select", "multi_select", "tags", "employee", "relation",
  "file", "image", "formula",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Текст", long_text: "Довгий текст", number: "Число", money: "Сума, грн", percentage: "Відсоток",
  boolean: "Так/Ні", date: "Дата", datetime: "Дата й час", phone: "Телефон", email: "Email",
  single_select: "Вибір (один)", multi_select: "Вибір (кілька)", tags: "Теги", employee: "Співробітник",
  relation: "Зв'язок із записом", file: "Файл (посилання)", image: "Зображення (посилання)", formula: "Формула",
};

/** Сутності, що вже підтримують кастомні поля (значення — у custom_field_values). */
export const CUSTOM_FIELD_ENTITIES = {
  order: { table: "orders", label: "Замовлення / Об'єкт", permissionModule: "orders" },
  lead: { table: "crm_leads", label: "Лід", permissionModule: "leads" },
} as const;
export type CustomFieldEntity = keyof typeof CUSTOM_FIELD_ENTITIES;

/** Core-колонки (знімок схеми). Кастомний ключ не може їх затінити. */
export const CORE_COLUMNS: Record<CustomFieldEntity, readonly string[]> = {
  order: ["id","number","name","address","district","latitude","longitude","order_type","floor","has_lift","access_notes","distance_km","notes","client_id","manager_id","source","crm_link","commercial_status","production_status","financial_status","risk_level","planned_start","planned_end","owner_id","created_at","updated_at","amount_total","paid_total","payment_status","crm_status","ordered_at","manager_comment","management_data","work_tags","utm","external_source","external_id"],
  lead: ["id","owner_id","assigned_to","title","pipeline_id","stage_id","contact_id","client_id","order_id","source","campaign","direction","budget","area","address","district","probability","status","lost_reason","next_action_at","closed_at","tags","notes","created_at","updated_at","external_source","external_id","utm","marketing_channel_id","marketing_campaign_id","marketing_creative_id","landing_page_id","lead_quality","disqualify_reason_id","first_touch_at","last_touch_at","phone_e164"],
};
/** Імена, що зарезервовані незалежно від сутності. */
const RESERVED = new Set(["id", "value", "entity", "entity_id", "entity_type", "field_key", "custom", "payload"]);

export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,47}$/;

export function parseCustomFieldKey(key: string): { entity: CustomFieldEntity; field: string } | null {
  const [entity, field, ...rest] = key.split(".");
  if (rest.length || !entity || !field) return null;
  if (!Object.prototype.hasOwnProperty.call(CUSTOM_FIELD_ENTITIES, entity)) return null;
  if (!FIELD_KEY_RE.test(field)) return null;
  return { entity: entity as CustomFieldEntity, field };
}

export function customKeyCollision(entity: CustomFieldEntity, field: string): boolean {
  return RESERVED.has(field) || CORE_COLUMNS[entity].includes(field);
}

export function validateCustomFieldKey(key: string): boolean {
  const p = parseCustomFieldKey(key);
  return !!p && !customKeyCollision(p.entity, p.field);
}

const optionSchema = z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/),
  label_uk: z.string().min(1).max(120),
  label_ru: z.string().max(120).optional(),
  archived: z.boolean().optional(),
}).strict();

export const customFieldSchema = z.object({
  label_uk: z.string().min(1).max(120),
  label_ru: z.string().max(120).optional(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  help: z.string().max(300).optional(),
  required: z.boolean().optional(),
  order: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
  /** Для single/multi_select: власні опції або посилання на довідник. */
  options: z.array(optionSchema).max(200).optional(),
  dictionary: z.string().max(64).optional(),
  relation_entity: z.enum(["order", "lead", "client", "contact", "estimate", "measurement"]).optional(),
  /** Формула зберігається як текст; обчислення — у Formula Engine (Wave 4). */
  formula: z.string().max(500).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.type === "single_select" || v.type === "multi_select") && !v.options?.length && !v.dictionary)
    ctx.addIssue({ code: "custom", message: "Для списку потрібні опції або довідник", path: ["options"] });
  if (v.type === "relation" && !v.relation_entity)
    ctx.addIssue({ code: "custom", message: "Вкажіть сутність зв'язку", path: ["relation_entity"] });
  if (v.type === "formula" && !v.formula)
    ctx.addIssue({ code: "custom", message: "Вкажіть формулу", path: ["formula"] });
  const codes = (v.options ?? []).map((o) => o.code);
  if (new Set(codes).size !== codes.length)
    ctx.addIssue({ code: "custom", message: "Коди опцій мають бути унікальними", path: ["options"] });
});
export type CustomFieldDef = z.infer<typeof customFieldSchema>;

/** Зміни після публікації, що зламали б історичні значення. */
export function customFieldTransitionErrors(prev: unknown, next: unknown): string[] {
  const a = customFieldSchema.safeParse(prev);
  const b = customFieldSchema.safeParse(next);
  if (!a.success || !b.success) return [];
  const errs: string[] = [];
  if (a.data.type !== b.data.type) errs.push("Тип опублікованого поля змінювати не можна — створіть нове поле");
  const nextCodes = new Set((b.data.options ?? []).map((o) => o.code));
  const removed = (a.data.options ?? []).map((o) => o.code).filter((c) => !nextCodes.has(c));
  if (removed.length) errs.push(`Опції не видаляються, а архівуються: ${removed.join(", ")}`);
  return errs;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/[^\s]+$/;

export type FieldValueResult = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Валідація значення за визначенням. null = «не заповнено» (не 0).
 * Формула не записується вручну. Архівна опція не приймається для нового вибору,
 * але вже збережене значення читається як є.
 */
export function validateFieldValue(def: CustomFieldDef, raw: unknown, previous?: unknown): FieldValueResult {
  if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
    return def.required ? { ok: false, error: "Обов'язкове поле" } : { ok: true, value: null };
  }
  const fail = (error: string): FieldValueResult => ({ ok: false, error });
  const activeCodes = new Set((def.options ?? []).filter((o) => !o.archived).map((o) => o.code));
  const prevSet = new Set(Array.isArray(previous) ? previous : previous != null ? [previous] : []);
  const codeOk = (c: unknown) => typeof c === "string" && (def.dictionary ? true : activeCodes.has(c) || prevSet.has(c));
  switch (def.type) {
    case "formula": return fail("Формула обчислюється системою, ручний запис заборонено");
    case "text": case "employee": return typeof raw === "string" && raw.length <= 500 ? { ok: true, value: raw.trim() } : fail("Текст до 500 символів");
    case "long_text": return typeof raw === "string" && raw.length <= 5000 ? { ok: true, value: raw } : fail("Текст до 5000 символів");
    case "number": case "money": case "percentage": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) return fail("Потрібне число");
      if (def.type === "percentage" && (n < -1000 || n > 1000)) return fail("Відсоток поза межами");
      return { ok: true, value: n };
    }
    case "boolean": return typeof raw === "boolean" ? { ok: true, value: raw } : fail("Так/Ні");
    case "date": return typeof raw === "string" && ISO_DATE_RE.test(raw) ? { ok: true, value: raw } : fail("Дата РРРР-ММ-ДД");
    case "datetime": return typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? { ok: true, value: new Date(raw).toISOString() } : fail("Некоректна дата й час");
    case "phone": return typeof raw === "string" && PHONE_RE.test(raw) ? { ok: true, value: raw.trim() } : fail("Некоректний телефон");
    case "email": return typeof raw === "string" && EMAIL_RE.test(raw) ? { ok: true, value: raw.trim().toLowerCase() } : fail("Некоректний email");
    case "file": case "image": return typeof raw === "string" && URL_RE.test(raw) ? { ok: true, value: raw } : fail("Посилання https://");
    case "relation": return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? { ok: true, value: raw } : fail("Потрібен ID запису (uuid)");
    case "single_select": return codeOk(raw) ? { ok: true, value: raw } : fail("Опція недоступна");
    case "multi_select": return Array.isArray(raw) && raw.every(codeOk) ? { ok: true, value: [...new Set(raw)] } : fail("Опція недоступна");
    case "tags": {
      const arr = Array.isArray(raw) ? raw : String(raw).split(",");
      const tags = arr.map((t) => String(t).trim()).filter(Boolean);
      return tags.length <= 30 && tags.every((t) => t.length <= 40) ? { ok: true, value: [...new Set(tags)] } : fail("До 30 тегів по 40 символів");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Детерміноване обчислення формул кастомних полів.                    */
/* Дозволено: числа, ключі числових кастомних полів, + - * / ( ).      */
/* Жодного eval, жодного доступу до бізнес-цін — лише значення полів.  */
/* ------------------------------------------------------------------ */

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "par"; v: "(" | ")" };

function tokenize(src: string, vars: Record<string, number | null>): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " ") { i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: "par", v: c }); i++; continue; }
    if ("+-*/".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      if (!m) return null;
      out.push({ t: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-z_]/.test(c)) {
      const m = /^[a-z][a-z0-9_]*/.exec(src.slice(i));
      if (!m) return null;
      const v = vars[m[0]];
      if (v === undefined || v === null || !Number.isFinite(v)) return null; // немає даних
      out.push({ t: "num", v }); i += m[0].length; continue;
    }
    return null;
  }
  return out;
}

/** Рекурсивний спуск: expr = term (+|- term)*, term = factor (*|/ factor)*. */
function parseExpr(toks: Tok[], pos: { i: number }): number | null {
  let left = parseTerm(toks, pos);
  if (left === null) return null;
  while (pos.i < toks.length) {
    const t = toks[pos.i]!;
    if (t.t !== "op" || (t.v !== "+" && t.v !== "-")) break;
    pos.i++;
    const right = parseTerm(toks, pos);
    if (right === null) return null;
    left = t.v === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(toks: Tok[], pos: { i: number }): number | null {
  let left = parseFactor(toks, pos);
  if (left === null) return null;
  while (pos.i < toks.length) {
    const t = toks[pos.i]!;
    if (t.t !== "op" || (t.v !== "*" && t.v !== "/")) break;
    pos.i++;
    const right = parseFactor(toks, pos);
    if (right === null) return null;
    if (t.v === "/" && right === 0) return null; // ділення на нуль → немає даних
    left = t.v === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(toks: Tok[], pos: { i: number }): number | null {
  const t = toks[pos.i];
  if (!t) return null;
  if (t.t === "op" && (t.v === "-" || t.v === "+")) {
    pos.i++;
    const v = parseFactor(toks, pos);
    return v === null ? null : t.v === "-" ? -v : v;
  }
  if (t.t === "num") { pos.i++; return t.v; }
  if (t.t === "par" && t.v === "(") {
    pos.i++;
    const v = parseExpr(toks, pos);
    const close = toks[pos.i];
    if (v === null || !close || close.t !== "par" || close.v !== ")") return null;
    pos.i++;
    return v;
  }
  return null;
}

/** Синтаксична перевірка формули (без значень) — для адмінки. */
export function formulaSyntaxError(formula: string, knownKeys: readonly string[]): string | null {
  const keys = Object.fromEntries(knownKeys.map((k) => [k, 1]));
  const toks = tokenize(formula, keys);
  if (!toks || !toks.length) return "Дозволені лише числа, ключі числових полів та + - * / ( )";
  const pos = { i: 0 };
  const v = parseExpr(toks, pos);
  return v === null || pos.i !== toks.length ? "Некоректний вираз" : null;
}

/**
 * Обчислення формули за значеннями числових кастомних полів запису.
 * null = «немає даних» (жодного 0 замість відсутнього значення).
 */
export function evaluateFormula(formula: string, numericValues: Record<string, number | null>): number | null {
  const toks = tokenize(formula, numericValues);
  if (!toks || !toks.length) return null;
  const pos = { i: 0 };
  const v = parseExpr(toks, pos);
  if (v === null || pos.i !== toks.length || !Number.isFinite(v)) return null;
  return v;
}

const NUMERIC_TYPES: readonly CustomFieldType[] = ["number", "money", "percentage"];

/** Обчислює всі formula-поля запису з уже прочитаних значень. */
export function computeFormulaValues(
  fields: readonly { key: string; def: CustomFieldDef }[],
  values: Record<string, unknown>,
): Record<string, number | null> {
  const nums: Record<string, number | null> = {};
  for (const f of fields) {
    if (!NUMERIC_TYPES.includes(f.def.type)) continue;
    const v = values[f.key];
    nums[f.key] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const out: Record<string, number | null> = {};
  for (const f of fields) {
    if (f.def.type !== "formula" || !f.def.formula) continue;
    out[f.key] = evaluateFormula(f.def.formula, nums);
  }
  return out;
}
