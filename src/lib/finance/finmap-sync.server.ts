/**
 * Finmap → TERZI: ідемпотентна синхронізація довідників і операцій.
 * Finmap — джерело фактичного руху грошей; ERP не створює дублікатів банківських операцій.
 */
import { finmap, FinmapError, type FinmapOperation, type FinmapRef } from "./finmap-client.server";

type Db = any;

export type SyncEntity =
  | "health" | "currencies" | "accounts" | "categories" | "projects"
  | "counterparties" | "operations" | "invoices";

export type SyncResult = {
  entity: SyncEntity;
  status: "ok" | "error";
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  message?: string;
};

async function logSync(db: Db, r: SyncResult, mode: string, ms: number, userId?: string | null, httpStatus?: number) {
  await db.from("finmap_sync_log").insert({
    entity: r.entity, mode, status: r.status, http_status: httpStatus ?? null,
    fetched: r.fetched, inserted: r.inserted, updated: r.updated, skipped: r.skipped,
    duration_ms: Math.round(ms), message: r.message ?? null, started_by: userId ?? null,
  });
  await db.from("finmap_sync_state").upsert({
    entity: r.entity,
    last_sync_at: new Date().toISOString(),
    ...(r.status === "ok" ? { last_success_at: new Date().toISOString(), last_error: null } : { last_error: r.message ?? "помилка" }),
    items_total: r.fetched,
  }, { onConflict: "entity" });
}

/** Загальний ідемпотентний upsert довідника за finmap_id. */
async function upsertRefs(
  db: Db,
  table: string,
  rows: FinmapRef[],
  map: (r: FinmapRef) => Record<string, unknown>,
  conflict = "finmap_id",
): Promise<{ inserted: number; updated: number }> {
  if (!rows.length) return { inserted: 0, updated: 0 };
  const { data: existing } = await db.from(table).select("finmap_id").not("finmap_id", "is", null);
  const known = new Set((existing ?? []).map((e: any) => e.finmap_id));
  const payload = rows.map((r) => ({ finmap_id: r.id, source: "finmap", ...map(r) }));
  const { error } = await db.from(table).upsert(payload, { onConflict: conflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  let inserted = 0;
  for (const r of rows) if (!known.has(r.id)) inserted++;
  return { inserted, updated: rows.length - inserted };
}

/** Реєструє відповідність Finmap-сутності до ERP (без автозв'язку при низькій впевненості). */
async function registerMappings(db: Db, kind: string, rows: FinmapRef[]) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({ finmap_kind: kind, finmap_id: r.id, finmap_name: r.label }));
  await db.from("finmap_entity_mappings").upsert(payload, { onConflict: "finmap_kind,finmap_id", ignoreDuplicates: true });
}

export async function syncAccounts(db: Db): Promise<SyncResult> {
  const rows = await finmap.accounts(true);
  const res = await upsertRefs(db, "finance_accounts", rows as any, (r: any) => ({
    name: r.label, currency: r.currencyId ?? "UAH", kind: "bank",
    actual_balance: r.companyCurrencyBalance ?? r.balance ?? null,
    balance_synced_at: new Date().toISOString(), archived: false,
  }));
  return { entity: "accounts", status: "ok", fetched: rows.length, skipped: 0, ...res };
}

export async function syncCategories(db: Db): Promise<SyncResult> {
  const [inc, exp] = await Promise.all([finmap.incomeCategories(), finmap.expenseCategories()]);
  const a = await upsertRefs(db, "finance_categories", inc as any, (r) => ({ name: r.label, kind: "income" }));
  const b = await upsertRefs(db, "finance_categories", exp as any, (r) => ({ name: r.label, kind: "expense" }));
  await registerMappings(db, "category", [...inc, ...exp]);
  return {
    entity: "categories", status: "ok", fetched: inc.length + exp.length,
    inserted: a.inserted + b.inserted, updated: a.updated + b.updated, skipped: 0,
  };
}

export async function syncProjects(db: Db): Promise<SyncResult> {
  const rows = await finmap.projects();
  const res = await upsertRefs(db, "finance_projects", rows, (r) => ({ name: r.label }));
  await registerMappings(db, "project", rows);
  return { entity: "projects", status: "ok", fetched: rows.length, skipped: 0, ...res };
}

export async function syncCounterparties(db: Db): Promise<SyncResult> {
  const kinds: { kind: string; load: () => Promise<FinmapRef[]> }[] = [
    { kind: "debitor", load: finmap.debitors },
    { kind: "supplier", load: finmap.suppliers },
    { kind: "employee", load: finmap.employees },
    { kind: "investor", load: finmap.investors },
    { kind: "creditor", load: finmap.creditors },
    { kind: "owner", load: finmap.owners },
  ];
  let fetched = 0, inserted = 0, updated = 0;
  for (const k of kinds) {
    let rows: FinmapRef[] = [];
    // 404 — довідник відсутній; 400 — метод визнано застарілим у Finmap. Обидва не блокують синхронізацію.
    try { rows = await k.load(); } catch (e) { const s = (e as FinmapError).status; if (s !== 404 && s !== 400) throw e; }
    if (!rows?.length) continue;
    fetched += rows.length;
    const payload = rows.map((r) => ({
      finmap_kind: k.kind, finmap_id: r.id, name: r.label,
      kind: k.kind === "debitor" ? "client" : k.kind, source: "finmap",
    }));
    const { data: existing } = await db.from("finance_counterparties").select("finmap_id").eq("finmap_kind", k.kind);
    const known = new Set((existing ?? []).map((e: any) => e.finmap_id));
    const { error } = await db.from("finance_counterparties").upsert(payload, { onConflict: "finmap_kind,finmap_id" });
    if (error) throw new Error(`finance_counterparties(${k.kind}): ${error.message}`);
    for (const r of rows) known.has(r.id) ? updated++ : inserted++;
    await registerMappings(db, k.kind, rows);
  }
  return { entity: "counterparties", status: "ok", fetched, inserted, updated, skipped: 0 };
}

/** Операції: інкрементально від останнього курсора (або від fromDate при initial sync). */
export async function syncOperations(db: Db, opts: { from?: string; to?: string; pageSize?: number; maxPages?: number } = {}): Promise<SyncResult> {
  const pageSize = Math.min(opts.pageSize ?? 100, 100);
  const maxPages = opts.maxPages ?? 300;

  let startDate: number | undefined;
  if (opts.from) startDate = Date.parse(`${opts.from}T00:00:00Z`);
  else {
    const { data: st } = await db.from("finmap_sync_state").select("cursor").eq("entity", "operations").maybeSingle();
    if (st?.cursor) startDate = Date.parse(st.cursor);
  }
  const endDate = opts.to ? Date.parse(`${opts.to}T23:59:59Z`) : undefined;

  // Довідники для локальних зв'язків
  const [{ data: accs }, { data: cats }, { data: cps }, { data: projs }] = await Promise.all([
    db.from("finance_accounts").select("id,finmap_id").not("finmap_id", "is", null),
    db.from("finance_categories").select("id,finmap_id").not("finmap_id", "is", null),
    db.from("finance_counterparties").select("id,finmap_id,client_id").not("finmap_id", "is", null),
    db.from("finance_projects").select("id,finmap_id,order_id").not("finmap_id", "is", null),
  ]);
  const accById = new Map((accs ?? []).map((a: any) => [a.finmap_id, a.id]));
  const catById = new Map((cats ?? []).map((a: any) => [a.finmap_id, a.id]));
  const cpById = new Map((cps ?? []).map((a: any) => [a.finmap_id, a]));
  const prById = new Map((projs ?? []).map((a: any) => [a.finmap_id, a]));

  let fetched = 0, inserted = 0, updated = 0;
  let maxDate = startDate ?? 0;

  for (let page = 0; page < maxPages; page++) {
    const { list } = await finmap.operations({ startDate, endDate, limit: pageSize, offset: page * pageSize });
    const ops: FinmapOperation[] = list ?? [];
    if (!ops.length) break;
    fetched += ops.length;

    const ids = ops.map((o) => o.id);
    const { data: existing } = await db.from("finance_transactions").select("finmap_id").in("finmap_id", ids);
    const known = new Set((existing ?? []).map((e: any) => e.finmap_id));

    const rows = ops.map((o) => {
      const proj = (o.projectIds ?? []).map((p) => prById.get(p)).find(Boolean) as any;
      const cp = o.counterpartyId ? (cpById.get(o.counterpartyId) as any) : null;
      if (o.date > maxDate) maxDate = o.date;
      return {
        finmap_id: o.id,
        kind: o.type === "income" ? "income" : o.type === "transfer" ? "transfer" : "expense",
        op_date: new Date(o.date).toISOString().slice(0, 10),
        amount: Number(o.sum) || 0,
        currency: o.currencyId ?? "UAH",
        amount_uah: o.companyCurrencySum ?? (o.currencyId === "UAH" ? Number(o.sum) || 0 : null),
        fx_rate: o.exchangeRate ?? null,
        account_id: accById.get(o.accountFromId ?? "") ?? accById.get(o.accountToId ?? "") ?? null,
        to_account_id: o.type === "transfer" ? accById.get(o.accountToId ?? "") ?? null : null,
        category_id: catById.get(o.categoryId ?? "") ?? null,
        counterparty_id: cp?.id ?? null,
        finance_project_id: proj?.id ?? null,
        order_id: proj?.order_id ?? null,
        client_id: cp?.client_id ?? null,
        comment: o.comment ?? null,
        source: o.externalId?.startsWith("terzi:") ? "terzi" : "finmap",
        external_id: o.externalId ?? null,
        payload: o as any,
        match_status: proj?.order_id || cp?.client_id ? "matched" : "unmatched",
        sync_status: "synced",
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await db.from("finance_transactions").upsert(rows, { onConflict: "finmap_id" });
    if (error) throw new Error(`finance_transactions: ${error.message}`);
    for (const o of ops) known.has(o.id) ? updated++ : inserted++;
    if (ops.length < pageSize) break;
  }

  if (maxDate) {
    // Курсор із перекриттям в 1 добу — щоб не втратити операції, змінені заднім числом.
    await db.from("finmap_sync_state").upsert(
      { entity: "operations", cursor: new Date(maxDate - 86_400_000).toISOString() },
      { onConflict: "entity" },
    );
  }
  return { entity: "operations", status: "ok", fetched, inserted, updated, skipped: 0 };
}

/** Повний ланцюжок: health → currencies → accounts → categories → projects → counterparties → operations. */
export async function runFinmapSync(
  db: Db,
  opts: { mode: "initial" | "incremental"; from?: string; to?: string; userId?: string | null },
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const steps: { entity: SyncEntity; run: () => Promise<SyncResult> }[] = [
    { entity: "health", run: async () => { await finmap.health(); return { entity: "health" as const, status: "ok" as const, fetched: 1, inserted: 0, updated: 0, skipped: 0 }; } },
    { entity: "accounts", run: () => syncAccounts(db) },
    { entity: "categories", run: () => syncCategories(db) },
    { entity: "projects", run: () => syncProjects(db) },
    { entity: "counterparties", run: () => syncCounterparties(db) },
    { entity: "operations", run: () => syncOperations(db, { from: opts.mode === "initial" ? opts.from ?? "2024-01-01" : opts.from, to: opts.to }) },
  ];

  for (const step of steps) {
    const t0 = Date.now();
    try {
      const r = await step.run();
      results.push(r);
      await logSync(db, r, opts.mode, Date.now() - t0, opts.userId);
    } catch (e: any) {
      const r: SyncResult = { entity: step.entity, status: "error", fetched: 0, inserted: 0, updated: 0, skipped: 0, message: String(e?.message ?? e) };
      results.push(r);
      await logSync(db, r, opts.mode, Date.now() - t0, opts.userId, e instanceof FinmapError ? e.status : undefined);
      break; // подальші кроки залежать від довідників
    }
  }
  return results;
}
