/**
 * Control Plane — життєвий цикл: draft → validate → preview diff → publish → rollback.
 * Логіка працює поверх абстрактного репозиторію (ConfigRepo), тож тестується без БД,
 * а серверна реалізація підставляє Supabase service-role.
 */
import { CONFIG_KINDS, validateConfig, type ConfigKind, type ConfigPayload } from "./kinds";
import { buildScopeChain, type ScopeContext, type ScopeRef } from "./scope";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type ConfigStatus = "draft" | "published" | "superseded" | "discarded";

export interface ConfigEntry {
  id: string;
  kind: string;
  key: string;
  scope_type: ScopeRef["type"];
  scope_id: string;
  version: number;
  status: ConfigStatus;
  payload: JsonValue;
  schema_version: number;
  sensitive: boolean;
  based_on_version: number | null;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
}

export interface ConfigTarget {
  kind: string;
  key: string;
  scope: ScopeRef;
}

export interface ConfigRepo {
  listVersions(t: ConfigTarget): Promise<ConfigEntry[]>;
  insert(e: Omit<ConfigEntry, "id" | "created_at">): Promise<ConfigEntry>;
  update(id: string, patch: Partial<ConfigEntry>): Promise<ConfigEntry>;
}

export interface AuditSink {
  (action: string, t: ConfigTarget, oldValue: unknown, newValue: unknown, note?: string | null): Promise<void>;
}

export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

const nextVersion = (vs: ConfigEntry[]) => vs.reduce((m, v) => Math.max(m, v.version), 0) + 1;
const published = (vs: ConfigEntry[]) => vs.find((v) => v.status === "published") ?? null;
const draft = (vs: ConfigEntry[]) => vs.find((v) => v.status === "draft") ?? null;

function assertValid(t: ConfigTarget, payload: unknown) {
  const r = validateConfig(t.kind, t.key, payload);
  if (!r.ok) throw new ConfigValidationError(r.errors);
  return r.payload;
}

/** Структурний diff двох JSON-значень: список змінених шляхів. */
export function diffPayload(before: unknown, after: unknown, path = "$"): { path: string; before: unknown; after: unknown }[] {
  const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
    return [...keys].sort().flatMap((k) => diffPayload((before as any)[k], (after as any)[k], `${path}.${k}`));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, before, after }];
}

export type BeforePublish = (t: ConfigTarget, payload: unknown) => Promise<void>;

export function createLifecycle(repo: ConfigRepo, audit: AuditSink, actorId: string, beforePublish?: BeforePublish) {
  return {
    /** Створює або оновлює єдину чернетку цілі. Драфт не бачить runtime. */
    async saveDraft(t: ConfigTarget, payload: unknown, note?: string | null) {
      const clean = assertValid(t, payload) as JsonValue;
      const vs = await repo.listVersions(t);
      const d = draft(vs);
      const guard = (CONFIG_KINDS as any)[t.kind]?.guardTransition as ((a: unknown, b: unknown) => string[]) | undefined;
      const pub = published(vs);
      if (guard && pub) {
        const errs = guard(pub.payload, clean);
        if (errs.length) throw new ConfigValidationError(errs);
      }
      const sensitive = CONFIG_KINDS[t.kind as ConfigKind].sensitive;
      const res = d
        ? await repo.update(d.id, { payload: clean, change_note: note ?? d.change_note })
        : await repo.insert({
            kind: t.kind, key: t.key, scope_type: t.scope.type, scope_id: t.scope.id,
            version: nextVersion(vs), status: "draft", payload: clean, schema_version: 1, sensitive,
            based_on_version: published(vs)?.version ?? null, change_note: note ?? null,
            created_by: actorId, published_by: null, published_at: null,
          });
      await audit("config.draft", t, d?.payload ?? null, clean, note);
      return res;
    },

    async preview(t: ConfigTarget) {
      const vs = await repo.listVersions(t);
      const d = draft(vs);
      if (!d) return null;
      const p = published(vs);
      const base = p?.payload ?? CONFIG_KINDS[t.kind as ConfigKind]?.defaultFor(t.key) ?? null;
      const v = validateConfig(t.kind, t.key, d.payload);
      return { draftVersion: d.version, publishedVersion: p?.version ?? null, changes: diffPayload(base, d.payload), validation: v };
    },

    async publish(t: ConfigTarget, note?: string | null) {
      const vs = await repo.listVersions(t);
      const d = draft(vs);
      if (!d) throw new Error("Немає чернетки для публікації");
      assertValid(t, d.payload);
      if (beforePublish) await beforePublish(t, d.payload);
      const p = published(vs);
      if (p) await repo.update(p.id, { status: "superseded" });
      const res = await repo.update(d.id, {
        status: "published", published_by: actorId, published_at: new Date().toISOString(),
        change_note: note ?? d.change_note,
      });
      await audit("config.publish", t, p?.payload ?? null, d.payload, note);
      return res;
    },

    /** Rollback = нова версія з payload обраної попередньої; історія не перезаписується. */
    async rollback(t: ConfigTarget, toVersion: number, note?: string | null) {
      const vs = await repo.listVersions(t);
      const src = vs.find((v) => v.version === toVersion && v.status !== "draft" && v.status !== "discarded");
      if (!src) throw new Error(`Версію ${toVersion} не знайдено серед опублікованих`);
      const clean = assertValid(t, src.payload) as JsonValue;
      if (beforePublish) await beforePublish(t, clean);
      const d = draft(vs);
      if (d) await repo.update(d.id, { status: "discarded" });
      const p = published(vs);
      if (p) await repo.update(p.id, { status: "superseded" });
      const now = new Date().toISOString();
      const res = await repo.insert({
        kind: t.kind, key: t.key, scope_type: t.scope.type, scope_id: t.scope.id,
        version: nextVersion(vs), status: "published", payload: clean, schema_version: src.schema_version,
        sensitive: src.sensitive, based_on_version: toVersion, change_note: note ?? `Rollback до v${toVersion}`,
        created_by: actorId, published_by: actorId, published_at: now,
      });
      await audit("config.rollback", t, p?.payload ?? null, clean, note ?? `v${toVersion}`);
      return res;
    },

    async discardDraft(t: ConfigTarget) {
      const d = draft(await repo.listVersions(t));
      if (!d) return null;
      await audit("config.discard", t, d.payload, null, null);
      return repo.update(d.id, { status: "discarded" });
    },
  };
}

/**
 * Резолвер runtime: бере лише опубліковані записи ланцюга скоупів.
 * Об'єктні payload зливаються (специфічніший скоуп перемагає по полях);
 * без записів повертається code default — поведінка ERP без змін.
 */
export function resolveConfig<K extends ConfigKind>(
  kind: K,
  key: string,
  entries: (Pick<ConfigEntry, "kind" | "key" | "scope_type" | "scope_id" | "status"> & { payload: unknown })[],
  ctx: ScopeContext,
) {
  const def = CONFIG_KINDS[kind];
  let value: any = def.defaultFor(key);
  if (value === null) value = undefined;
  const source: string[] = ["code"];
  for (const s of buildScopeChain(ctx)) {
    const e = entries.find(
      (x) => x.kind === kind && x.key === key && x.status === "published" && x.scope_type === s.type && x.scope_id === s.id,
    );
    if (!e) continue;
    const parsed = def.schema.safeParse(e.payload);
    if (!parsed.success) continue; // невалідний запис ігнорується → безпечний fallback
    value = value === undefined ? parsed.data : { ...value, ...(parsed.data as object) };
    source.push(`${s.type}:${s.id}`);
  }
  return { value: (value ?? null) as ConfigPayload<K>, source };
}
