/**
 * Control Center — чисті хелпери відображення скоупів (без I/O).
 * Для ролі показує власні записи + опубліковані записи компанії як «успадковані»,
 * по одному рядку на ключ (без дублів між скоупами).
 */
export interface ScopedRow { key: string; scope_type: string; scope_id: string; status: string }
export type ScopeRef = { type: string; id: string };
export type OwnEntry<R> = { draft?: R; published?: R };

export function byScopeKey<R extends ScopedRow>(rows: R[] | undefined, scope: ScopeRef) {
  const m = new Map<string, OwnEntry<R>>();
  for (const r of rows ?? []) {
    if (r.scope_type !== scope.type || r.scope_id !== scope.id) continue;
    if (r.status !== "draft" && r.status !== "published") continue;
    const e = m.get(r.key) ?? {};
    if (r.status === "draft") e.draft = r; else e.published = r;
    m.set(r.key, e);
  }
  return m;
}

export function scopedEntries<R extends ScopedRow>(rows: R[] | undefined, scope: ScopeRef, company: ScopeRef) {
  const own = byScopeKey(rows, scope);
  const isRole = scope.type === "role";
  const base = isRole ? byScopeKey(rows, company) : new Map<string, OwnEntry<R>>();
  const keys = new Set<string>([...own.keys()]);
  for (const [k, e] of base) if (e.published) keys.add(k);
  return [...keys].sort().map((key) => ({ key, own: own.get(key), inherited: base.get(key)?.published }));
}
