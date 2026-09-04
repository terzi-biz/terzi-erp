/**
 * Серверні операції проміжного імпорту складу.
 * Доступ: лише ролі з правом на внутрішні ціни (власник/адмін/директор/фінанси) —
 * пакет містить конфіденційні дані постачальника й архівні ціни.
 * Службовий клієнт використовується ЛИШЕ після явної перевірки прав.
 */
import { canViewInternalPrices, loadActor, writeAudit, type Actor } from "@/lib/access.server";
import {
  STAGING_SCHEMA_VERSION,
  STAGING_MAX_BYTES,
  normalizeRow,
  rowIssues,
  type SourceKind,
} from "@/lib/warehouse-import";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function requireImportAccess(userId: string): Promise<Actor> {
  const allowed = await canViewInternalPrices(userId);
  if (!allowed) throw new Error("Доступ до проміжного імпорту складу мають лише власник, адміністратор, директор або фінансист");
  return loadActor(userId);
}

export type PreviewInput = {
  bundleId: string;
  schemaVersion: string;
  fileSha256: string;
  fileBytes: number;
  sourceCommit: string | null;
  sourceName: string | null;
  productionImportAllowed: boolean;
  counters: Record<string, number>;
  problems: string[];
};

/** Перевірка заголовка. Нічого не пише в облік і не створює запуск. */
export async function previewImport(userId: string, input: PreviewInput) {
  await requireImportAccess(userId);
  const problems = [...input.problems];
  if (input.schemaVersion !== STAGING_SCHEMA_VERSION) problems.push(`Очікується schema_version=${STAGING_SCHEMA_VERSION}`);
  if (input.fileBytes > STAGING_MAX_BYTES) problems.push("Перевищено дозволений розмір файлу");
  if (!/^[0-9a-f]{64}$/.test(input.fileSha256)) problems.push("Некоректний хеш файлу");

  const sb = await db();
  const { data: existing } = await sb
    .from("warehouse_import_runs")
    .select("id,status,created_at,counters")
    .eq("bundle_id", input.bundleId)
    .eq("file_sha256", input.fileSha256)
    .maybeSingle();

  return {
    ok: problems.length === 0,
    problems,
    counters: input.counters,
    productionImportAllowed: input.productionImportAllowed,
    existingRun: existing ?? null,
    stage: "preview" as const,
  };
}

/** Створює (або повертає наявний) запуск черги перевірки. Ідемпотентно за bundle+hash. */
export async function startRun(userId: string, input: PreviewInput) {
  const actor = await requireImportAccess(userId);
  const sb = await db();
  const { data: existing } = await sb
    .from("warehouse_import_runs")
    .select("*")
    .eq("bundle_id", input.bundleId)
    .eq("file_sha256", input.fileSha256)
    .maybeSingle();
  if (existing) return { run: existing, created: false };

  const { data, error } = await sb
    .from("warehouse_import_runs")
    .insert({
      bundle_id: input.bundleId,
      schema_version: input.schemaVersion,
      file_sha256: input.fileSha256,
      source_commit: input.sourceCommit,
      source_name: input.sourceName,
      production_import_allowed: input.productionImportAllowed,
      counters: input.counters as any,
      status: "staged",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) { console.error("startRun", error); throw new Error("Не вдалося створити запуск імпорту"); }
  await writeAudit(actor, {
    module: "warehouse",
    action: "import_run_created",
    entityType: "warehouse_import_run",
    entityId: data.id,
    entityLabel: input.bundleId,
    newValue: { counters: input.counters, file_sha256: input.fileSha256 },
    isCritical: true,
  });
  return { run: data, created: true };
}

export type ChunkRow = { source_kind: SourceKind; external_key: string; source_hash: string; raw: Record<string, unknown> };

/** Запис порції рядків у чергу. Повтор того самого хеша нічого не змінює. */
export async function stageChunk(userId: string, runId: string, rows: ChunkRow[]) {
  await requireImportAccess(userId);
  const sb = await db();
  const { data: run, error: runErr } = await sb.from("warehouse_import_runs").select("id,status").eq("id", runId).maybeSingle();
  if (runErr || !run) throw new Error("Запуск імпорту не знайдено");

  const keys = rows.map((r) => r.external_key);
  const { data: existing } = await sb
    .from("warehouse_import_rows")
    .select("id,external_key,source_hash,revision,decision,raw_payload")
    .eq("run_id", runId)
    .in("external_key", keys);
  const byKey = new Map((existing ?? []).map((r: any) => [r.external_key, r]));

  let inserted = 0, unchanged = 0, revised = 0;
  const toInsert: any[] = [];
  for (const row of rows) {
    const normalized = normalizeRow(row.source_kind, row.raw);
    const issues = rowIssues(row.source_kind, normalized);
    const prev = byKey.get(row.external_key);
    if (!prev) {
      toInsert.push({
        run_id: runId,
        source_kind: row.source_kind,
        external_key: row.external_key,
        source_hash: row.source_hash,
        raw_payload: row.raw as any,
        normalized_payload: normalized as any,
        issues: issues as any,
        decision: "needs_review",
      });
      inserted++;
      continue;
    }
    if (prev.source_hash === row.source_hash) { unchanged++; continue; }
    const { error } = await sb
      .from("warehouse_import_rows")
      .update({
        source_hash: row.source_hash,
        revision: (prev.revision ?? 1) + 1,
        conflict: true,
        previous_payload: prev.raw_payload,
        raw_payload: row.raw as any,
        normalized_payload: normalized as any,
        issues: issues as any,
        decision: prev.decision === "created" ? prev.decision : "needs_review",
      })
      .eq("id", prev.id);
    if (error) { console.error("stageChunk revise", error); throw new Error("Не вдалося оновити рядок черги"); }
    revised++;
  }

  if (toInsert.length) {
    const { error } = await sb.from("warehouse_import_rows").insert(toInsert);
    if (error) { console.error("stageChunk insert", error); throw new Error("Не вдалося записати рядки в чергу"); }
  }

  await sb.from("warehouse_import_runs").update({ status: "needs_review" }).eq("id", runId);
  return { inserted, unchanged, revised, stage: "staged" as const };
}

export async function listRuns(userId: string) {
  await requireImportAccess(userId);
  const sb = await db();
  const { data } = await sb.from("warehouse_import_runs").select("*").order("created_at", { ascending: false }).limit(50);
  const runs = data ?? [];
  const out: any[] = [];
  for (const run of runs) {
    const { data: stats } = await sb.from("warehouse_import_rows").select("source_kind,decision").eq("run_id", run.id);
    const byKind: Record<string, number> = {};
    const byDecision: Record<string, number> = {};
    for (const r of (stats ?? []) as any[]) {
      byKind[r.source_kind] = (byKind[r.source_kind] ?? 0) + 1;
      byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    }
    out.push({ ...run, rows_total: (stats ?? []).length, by_kind: byKind, by_decision: byDecision });
  }
  return out;
}

export async function listRows(userId: string, f: { runId: string; kind?: string; decision?: string; q?: string; limit: number; offset: number }) {
  await requireImportAccess(userId);
  const sb = await db();
  let q = sb
    .from("warehouse_import_rows")
    .select("id,source_kind,external_key,source_hash,revision,conflict,normalized_payload,issues,decision,linked_stock_item_id,reviewed_at", { count: "exact" })
    .eq("run_id", f.runId)
    .order("external_key")
    .range(f.offset, f.offset + f.limit - 1);
  if (f.kind) q = q.eq("source_kind", f.kind);
  if (f.decision) q = q.eq("decision", f.decision);
  if (f.q) q = q.ilike("external_key", `%${f.q}%`);
  const { data, count, error } = await q;
  if (error) { console.error("listRows", error); throw new Error("Не вдалося завантажити рядки черги"); }
  return { rows: data ?? [], total: count ?? 0 };
}

export type ReviewInput = {
  rowId: string;
  expectedRevision: number;
  decision: "needs_review" | "verified" | "excluded";
  mapping?: {
    name?: string | null;
    sku?: string | null;
    unit_erp?: string | null;
    module_resolved?: string | null;
    catalog_item_id?: string | null;
    category?: string | null;
  };
};

/** Рішення по рядку. UUID каталогу приймається лише після перевірки існування. */
export async function reviewRow(userId: string, input: ReviewInput) {
  const actor = await requireImportAccess(userId);
  const sb = await db();
  const { data: row } = await sb.from("warehouse_import_rows").select("*").eq("id", input.rowId).maybeSingle();
  if (!row) throw new Error("Рядок черги не знайдено");
  if (row.revision !== input.expectedRevision) throw new Error("Рядок змінився — оновіть перегляд і повторіть рішення");
  if (row.decision === "created") throw new Error("Позицію вже створено; рішення змінити не можна");

  const normalized: any = { ...(row.normalized_payload as any) };
  const m = input.mapping ?? {};
  if (m.catalog_item_id) {
    const { data: item } = await sb.from("catalog_items").select("id,unit").eq("id", m.catalog_item_id).maybeSingle();
    if (!item) throw new Error("Вказана позиція каталогу не існує");
    normalized.catalog_item_id = item.id;
  } else if (m.catalog_item_id === null) {
    normalized.catalog_item_id = null;
  }
  for (const key of ["name", "sku", "unit_erp", "module_resolved", "category"] as const) {
    if (m[key] !== undefined) normalized[key] = m[key];
  }
  const issues = rowIssues(row.source_kind as SourceKind, normalized);
  const blocking = issues.filter((i) => i.blocking && i.code !== "activation_blocked");
  if (input.decision === "verified" && blocking.length) {
    throw new Error(`Неможливо позначити перевіреним: ${blocking.map((i) => i.message).join("; ")}`);
  }

  const { data: updated, error } = await sb
    .from("warehouse_import_rows")
    .update({
      normalized_payload: normalized,
      issues: issues as any,
      decision: input.decision,
      conflict: false,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.rowId)
    .eq("revision", input.expectedRevision)
    .select("*")
    .single();
  if (error) { console.error("reviewRow", error); throw new Error("Не вдалося зберегти рішення"); }

  await writeAudit(actor, {
    module: "warehouse",
    action: `import_row_${input.decision}`,
    entityType: "warehouse_import_row",
    entityId: input.rowId,
    entityLabel: row.external_key,
    oldValue: { decision: row.decision },
    newValue: { decision: input.decision, mapping: m },
  });
  return updated;
}

/** Створення активного SKU з перевірених рядків. Окрема дія, лише вимоги TERZI. */
export async function promoteRows(userId: string, rowIds: string[]) {
  const actor = await requireImportAccess(userId);
  const sb = await db();
  const { data: rows } = await sb.from("warehouse_import_rows").select("*").in("id", rowIds);
  const created: { external_key: string; item_id: string }[] = [];
  const skipped: { external_key: string; reason: string }[] = [];

  for (const row of (rows ?? []) as any[]) {
    const n = (row.normalized_payload ?? {}) as any;
    if (row.decision !== "verified") { skipped.push({ external_key: row.external_key, reason: "Рядок не перевірений" }); continue; }
    if (row.source_kind !== "requirement") { skipped.push({ external_key: row.external_key, reason: "Створення SKU дозволене лише з вимог TERZI" }); continue; }
    if (!n.name || !n.unit_erp || !n.module_resolved) { skipped.push({ external_key: row.external_key, reason: "Немає назви, одиниці або напрямку" }); continue; }

    const { data: dupe } = await sb.from("stock_items").select("id").eq("origin_external_key", row.external_key).maybeSingle();
    if (dupe) {
      await sb.from("warehouse_import_rows").update({ decision: "created", linked_stock_item_id: dupe.id }).eq("id", row.id);
      skipped.push({ external_key: row.external_key, reason: "SKU вже існує — повторно не створено" });
      continue;
    }

    const { data: item, error } = await sb
      .from("stock_items")
      .insert({
        name: String(n.name).slice(0, 300),
        sku: n.sku ? String(n.sku).slice(0, 100) : null,
        unit: String(n.unit_erp).slice(0, 30),
        category: n.category ? String(n.category).slice(0, 120) : null,
        module: String(n.module_resolved).slice(0, 50),
        catalog_item_id: n.catalog_item_id ?? null,
        family_key: n.category ? String(n.category).slice(0, 120) : null,
        variant_label: n.brand_source ? String(n.brand_source).slice(0, 200) : null,
        verification_status: "verified",
        origin_external_key: row.external_key,
        source_ref: { run_id: row.run_id, source_kind: row.source_kind, source_hash: row.source_hash } as any,
        min_qty: 0,
      })
      .select("id")
      .single();
    if (error || !item) { console.error("promoteRows insert", error); skipped.push({ external_key: row.external_key, reason: "Помилка створення SKU" }); continue; }

    const attrRows = Object.entries((n.attributes ?? {}) as Record<string, any>)
      .filter(([, a]) => a && (a.value != null || a.min_value != null || a.max_value != null || a.source_text))
      .map(([key, a]) => ({
        item_id: item.id,
        attribute_key: key,
        data_type: a.value != null ? "number" : (a.min_value != null || a.max_value != null) ? "range" : "text",
        numeric_value: a.value ?? null,
        min_value: a.value != null ? null : (a.min_value ?? null),
        max_value: a.value != null ? null : (a.max_value ?? null),
        text_value: a.value == null && a.min_value == null && a.max_value == null ? a.source_text : null,
        unit: a.unit ?? null,
        source_text: a.source_text ?? null,
        verification_status: a.verification_status ?? "unknown",
        source_ref: { external_key: row.external_key } as any,
      }));
    if (attrRows.length) await sb.from("stock_item_attributes").insert(attrRows);

    if (n.pack_factor && Number(n.pack_factor) > 0) {
      await sb.from("stock_item_pack_units").insert({
        item_id: item.id,
        unit_label: String(n.pack_label ?? "упаковка").slice(0, 60),
        base_qty_per_pack: Number(n.pack_factor),
        verification_status: n.pack_status ?? "unknown",
        source_text: n.pack_label ?? null,
      });
    }

    await sb.from("stock_item_applications").insert({
      item_id: item.id,
      module: String(n.module_resolved).slice(0, 50),
      link_type: n.catalog_item_id ? "catalog" : "none",
      catalog_item_id: n.catalog_item_id ?? null,
      created_by: userId,
    });

    await sb.from("warehouse_import_rows").update({
      decision: "created",
      linked_stock_item_id: item.id,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", row.id);

    created.push({ external_key: row.external_key, item_id: item.id });
    await writeAudit(actor, {
      module: "warehouse",
      action: "stock_item_created_from_import",
      entityType: "stock_item",
      entityId: item.id,
      entityLabel: String(n.name),
      newValue: { external_key: row.external_key, module: n.module_resolved, unit: n.unit_erp },
      isCritical: true,
    });
  }
  return { created, skipped };
}
