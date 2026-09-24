/**
 * Control Plane — реєстр типів конфігурації (config kinds).
 * Кожен kind має zod-схему payload і code default. Порожнє сховище = code default,
 * тобто поточна поведінка ERP без змін.
 */
import { z } from "zod";
import { TERZI_MODULES, type ModuleId } from "@/lib/modules";
import { customFieldSchema, validateCustomFieldKey, customFieldTransitionErrors } from "./custom-fields";
import { calcSettingsSchema, calcSettingsKeyErrors, isCalcSettingsKey } from "./calc-settings";
import { dictionarySchema, validateDictionaryKey, dictionaryTransitionErrors } from "./dictionaries";
import { workflowSchema, isWorkflowKey, workflowPayloadErrors } from "./workflow";

const MODULE_IDS = TERZI_MODULES.map((m) => m.id) as [ModuleId, ...ModuleId[]];

/** Feature flag: той самий kernel, без окремого сховища. */
export const flagSchema = z.object({ enabled: z.boolean(), note: z.string().max(500).optional() }).strict();

/** Оверлей модуля: лише презентаційні/доступні поля; id/маршрути/рушії лишаються в коді. */
export const moduleOverlaySchema = z
  .object({
    /** Legacy (Wave 1) = UA-підпис. */
    label: z.string().min(1).max(80).optional(),
    label_uk: z.string().min(1).max(80).optional(),
    label_ru: z.string().min(1).max(80).optional(),
    desktop: z.boolean().optional(),
    mobile: z.boolean().optional(),
    active: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),
    roles: z.array(z.string().min(1).max(64)).max(50).optional(),
  })
  .strict();

export const CONFIG_KINDS = {
  flag: {
    label: "Feature flag",
    schema: flagSchema,
    sensitive: false,
    validateKey: (key: string) => /^[a-z][a-z0-9_.]{1,63}$/.test(key),
    /** Невідомий прапор = вимкнено (поточна поведінка). */
    defaultFor: (_key: string) => ({ enabled: false }) as z.infer<typeof flagSchema>,
  },
  module_overlay: {
    label: "Оверлей модуля",
    schema: moduleOverlaySchema,
    sensitive: false,
    validateKey: (key: string) => (MODULE_IDS as string[]).includes(key),
    /** Порожній оверлей = значення з src/lib/modules.ts. */
    defaultFor: (_key: string) => ({}) as z.infer<typeof moduleOverlaySchema>,
  },
  custom_field: {
    label: "Кастомне поле",
    schema: customFieldSchema,
    sensitive: false,
    /** Ключ `<entity>.<field_key>`; колізія з core-колонкою відхиляється. */
    validateKey: validateCustomFieldKey,
    defaultFor: (_key: string) => null as unknown as z.infer<typeof customFieldSchema>,
    guardTransition: customFieldTransitionErrors,
  },
  dictionary: {
    label: "Довідник",
    schema: dictionarySchema,
    sensitive: false,
    validateKey: validateDictionaryKey,
    defaultFor: (_key: string) => null as unknown as z.infer<typeof dictionarySchema>,
    guardTransition: dictionaryTransitionErrors,
  },
  calc_settings: {
    label: "Налаштування калькулятора",
    schema: calcSettingsSchema,
    sensitive: false,
    validateKey: isCalcSettingsKey,
    /** Порожнє перевизначення = дефолти рушія. */
    defaultFor: (_key: string) => ({}) as Record<string, number>,
    payloadErrors: calcSettingsKeyErrors,
  },
  workflow: {
    label: "Етапи замовлення",
    schema: workflowSchema,
    sensitive: false,
    validateKey: isWorkflowKey,
    /** Немає workflow = будь-який перехід без автоматики (поточна поведінка). */
    defaultFor: (_key: string) => null as unknown as z.infer<typeof workflowSchema>,
    payloadErrors: workflowPayloadErrors,
  },
} as const;

export type ConfigKind = keyof typeof CONFIG_KINDS;
export type ConfigPayload<K extends ConfigKind> = z.infer<(typeof CONFIG_KINDS)[K]["schema"]>;

export function isConfigKind(k: string): k is ConfigKind {
  return Object.prototype.hasOwnProperty.call(CONFIG_KINDS, k);
}

const SECRET_KEY_RE = /(secret|password|passwd|token|api[_-]?key|private[_-]?key|client[_-]?secret|bearer|credential)/i;
const SECRET_VALUE_RE = /^(sk-|sb_secret_|eyJ[a-zA-Z0-9_-]{10,}\.|AIza[0-9A-Za-z_-]{20,}|ghp_|xox[bap]-)/;

/** Повертає шляхи, що схожі на секрети. Config payload не може містити секретів. */
export function findSecretLike(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) hits.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findSecretLike(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}.${k}`;
      if (SECRET_KEY_RE.test(k)) hits.push(p);
      hits.push(...findSecretLike(v, p));
    }
  }
  return hits;
}

export type ValidationResult<T = unknown> =
  | { ok: true; payload: T }
  | { ok: false; errors: string[] };

export function validateConfig(kind: string, key: string, payload: unknown): ValidationResult {
  if (!isConfigKind(kind)) return { ok: false, errors: [`Невідомий тип конфігурації: ${kind}`] };
  const def = CONFIG_KINDS[kind];
  const errors: string[] = [];
  if (!def.validateKey(key)) errors.push(`Недопустимий ключ «${key}» для ${kind}`);
  const extra = (def as { payloadErrors?: (k: string, p: unknown) => string[] }).payloadErrors;
  if (extra) errors.push(...extra(key, payload));
  const secrets = findSecretLike(payload);
  if (secrets.length) errors.push(`Конфігурація не може містити секрети: ${secrets.join(", ")}`);
  const parsed = def.schema.safeParse(payload);
  if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `${i.path.join(".") || "payload"}: ${i.message}`));
  return errors.length ? { ok: false, errors } : { ok: true, payload: parsed.success ? parsed.data : payload };
}
