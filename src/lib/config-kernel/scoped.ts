/**
 * Control Plane — scope-aware резолвінг і перевірки посилань (чисті функції).
 * Один ключ → одне ефективне значення за правилами kernel (system → company → role),
 * тож записи різних скоупів ніколи не дублюють поле.
 */
import { resolveConfig } from "./lifecycle";
import { buildScopeChain, COMPANY_ID, type ScopeContext, type ScopeRef } from "./scope";
import type { ConfigKind } from "./kinds";
import { validateDictionaryKey } from "./dictionaries";

export interface PublishedRow {
  kind: string; key: string; scope_type: string; scope_id: string; status: string; payload: unknown; version?: number;
}

/** Скоупи, у які Control Center дозволяє писати. System не редагується з UI. */
export const WRITABLE_SCOPE_TYPES = ["company", "role"] as const;

export function resolveAllByKey(kind: ConfigKind, rows: PublishedRow[], ctx: ScopeContext) {
  const keys = [...new Set(rows.filter((r) => r.kind === kind && r.status === "published").map((r) => r.key))].sort();
  const chain = buildScopeChain(ctx);
  const out = new Map<string, { value: any; source: string[]; version: number | null }>();
  for (const k of keys) {
    const r = resolveConfig(kind, k, rows as any, ctx);
    if (r.source.length <= 1) continue; // немає валідних записів у ланцюгу актора
    // Версія — від найспецифічнішого запису, що дав внесок.
    let version: number | null = null;
    for (const s of chain) {
      const e = rows.find((x) => x.kind === kind && x.key === k && x.status === "published" && x.scope_type === s.type && x.scope_id === s.id);
      if (e && r.source.includes(`${s.type}:${s.id}`)) version = e.version ?? version;
    }
    out.set(k, { value: r.value, source: r.source, version });
  }
  return out;
}

/** Ланцюг, видимий для цілі запису: company-ціль бачить system+company; role-ціль — ще й свою роль. */
export function chainForTarget(scope: ScopeRef): ScopeContext {
  return { companyId: COMPANY_ID, roleKey: scope.type === "role" ? scope.id : null };
}

/**
 * Посилання select-поля на довідник: має бути опублікований generic-довідник
 * в ефективному скоупі цілі. Зовнішні авторитетні довідники generic не вважаються.
 */
export function dictionaryRefError(code: string | undefined | null, dictRows: PublishedRow[], scope: ScopeRef): string | null {
  if (!code) return null;
  if (!validateDictionaryKey(code)) return `«${code}» — не generic-довідник (зовнішні авторитетні довідники тут не підтримуються)`;
  const found = resolveAllByKey("dictionary", dictRows, chainForTarget(scope)).get(code);
  return found ? null : `Довідник «${code}» не опубліковано в цьому скоупі — спершу опублікуйте довідник`;
}

/** Рольове перевизначення поля не може змінювати тип, заданий на рівні компанії. */
export function roleTypeConflict(scope: ScopeRef, payload: any, companyPayload: any): string | null {
  if (scope.type !== "role" || !companyPayload || !payload) return null;
  return payload.type && companyPayload.type && payload.type !== companyPayload.type
    ? `Тип поля задано на рівні компанії (${companyPayload.type}) — роль не може його змінити`
    : null;
}
