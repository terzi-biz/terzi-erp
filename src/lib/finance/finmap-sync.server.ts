/**
 * Finmap → TERZI: ідемпотентна синхронізація довідників і операцій.
 * Finmap — джерело фактичного руху грошей; ERP не створює дублікатів банківських операцій.
 */
import { finmap, FinmapError, type FinmapOperation, type FinmapRef } from "./finmap-client.server";

type Db = any;

export type SyncEntity =
  | "health" | "currencies" | "accounts" | "categories" | "projects"
  | "counterparties" | "operations" | "invoices" | "match";

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

/* ---------- Хелпери збагаченої моделі операцій ---------- */

/** Будь-яке представлення дати Finmap → YYYY-MM-DD (UTC). */
function isoDay(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  const d = Number.isFinite(n) ? new Date(n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * ACTUAL чи SCHEDULED. Планова — незатверджена операція або операція
 * з датою оплати в майбутньому. Планова ніколи не входить у факт.
 */
function operationState(raw: any): "actual" | "scheduled" {
  const explicit = String(raw?.status ?? raw?.state ?? "").toLowerCase();
  if (["planned", "scheduled", "future", "expected"].includes(explicit)) return "scheduled";
  if (raw?.approved === false) return "scheduled";
  const pay = isoDay(raw?.dateOfPayment ?? raw?.paymentDate ?? raw?.date);
  const today = new Date().toISOString().slice(0, 10);
  if (pay && pay > today && raw?.approved !== true) return "scheduled";
  return "actual";
}

/** Теги Finmap: зберігаємо id + назву, без хардкоду конкретних тегів TERZI. */
function normalizeTags(raw: any): { id: string | null; name: string | null }[] {
  const src = raw?.tags ?? raw?.tagObjects ?? raw?.tagIds ?? [];
  if (!Array.isArray(src)) return [];
  return src.map((t: any) =>
    typeof t === "string" || typeof t === "number"
      ? { id: String(t), name: null }
      : { id: t?.id != null ? String(t.id) : null, name: t?.name ?? t?.label ?? null },
  );
}

/**
 * Розподіли операції по проєктах і статтях (projectObjects / categoryObjects).
 * Явний розподіл Finmap має найвищий пріоритет і не перетирає ручний TERZI-розподіл.
 */
async function saveAllocations(db: Db, ops: FinmapOperation[], refs: { prById: Map<any, any>; catById: Map<any, any> }) {
  const { normalizeFinmapParts, resolveAllocations, allocationStatusByDimension } = await import("./allocations");
  const ids = ops.map((o) => o.id);
  const { data: txs } = await db.from("finance_transactions").select("id,finmap_id,amount_uah,amount").in("finmap_id", ids);
  const txByFinmap = new Map((txs ?? []).map((t: any) => [t.finmap_id, t]));
  const txIds = [...txByFinmap.values()].map((t: any) => t.id);
  if (!txIds.length) return;

  // Ручний розподіл блокує ЛИШЕ свій вимір: ручна «послуга» не зупиняє синк проєктів/статей.
  const { data: manual } = await db
    .from("finance_allocations").select("transaction_id,dimension").eq("source", "manual").in("transaction_id", txIds);
  const lockedDim = new Set(((manual ?? []) as any[]).map((m) => `${m.transaction_id}:${m.dimension}`));

  const rows: any[] = [];
  const touched = new Set<string>(); // transaction_id:dimension, які синк перезаписує
  const totals = new Map<string, number>();

  for (const o of ops) {
    const tx = txByFinmap.get(o.id) as any;
    if (!tx) continue;
    const raw = o as any;
    const total = Number(tx.amount_uah ?? tx.amount) || 0;
    totals.set(tx.id, total);

    for (const dim of ["project", "category"] as const) {
      if (lockedDim.has(`${tx.id}:${dim}`)) continue;
      const src = dim === "project" ? raw.projectObjects ?? raw.projects : raw.categoryObjects ?? raw.categories;
      const parts = normalizeFinmapParts(src);
      if (!parts.length) continue;
      const { allocations } = resolveAllocations({ total, dimension: dim, finmap: parts });
      if (!allocations.length) continue;
      touched.add(`${tx.id}:${dim}`);
      for (const a of allocations) {
        const local = dim === "project" ? refs.prById.get(a.ref) : refs.catById.get(a.ref);
        rows.push({
          transaction_id: tx.id,
          dimension: dim,
          ref_finmap_id: a.ref,
          ref_name: a.name,
          order_id: dim === "project" ? (local as any)?.order_id ?? null : null,
          category_id: dim === "category" ? (local ?? null) : null,
          service: null,
          amount: a.amount,
          share: a.share,
          source: "finmap",
          status: local ? "ok" : "needs_review",
        });
      }
    }
  }

  // Ідемпотентність: унікальний індекс побудований на COALESCE-виразах, тому
  // upsert по колонках не спрацював би. Переписуємо тільки finmap-розподіли
  // тих вимірів, які реально прийшли з Finmap цього разу.
  for (const key of touched) {
    const [txId, dim] = key.split(":") as [string, string];
    await db.from("finance_allocations").delete().eq("transaction_id", txId).eq("dimension", dim).eq("source", "finmap");
  }
  if (rows.length) {
    const { error } = await db.from("finance_allocations").insert(rows);
    if (error) throw new Error(`finance_allocations: ${error.message}`);
  }

  // Статус операції — з незалежних станів вимірів (100% проєкт + 100% стаття ≠ 200%).
  if (touched.size) {
    const affected = [...new Set([...touched].map((k) => k.split(":")[0]!))];
    const { data: all } = await db
      .from("finance_allocations").select("transaction_id,dimension,amount,source,status").in("transaction_id", affected);
    const byTx = new Map<string, any[]>();
    for (const a of (all ?? []) as any[]) byTx.set(a.transaction_id, [...(byTx.get(a.transaction_id) ?? []), a]);
    for (const txId of affected) {
      const { overall } = allocationStatusByDimension(totals.get(txId) ?? 0, (byTx.get(txId) ?? []) as any);
      await db.from("finance_transactions").update({ allocation_status: overall }).eq("id", txId);
    }
  }
}


/** Теги Finmap як додаткова фінансова класифікація. */
export async function syncTags(db: Db): Promise<SyncResult> {
  try {
    const list = (await finmap.tags()) ?? [];
    const { inserted, updated } = await upsertRefs(db, "finance_tags", list, (r) => ({ name: r.label }));
    return { entity: "match" as SyncEntity, status: "ok", fetched: list.length, inserted, updated, skipped: 0, message: `теги: ${list.length}` };
  } catch (e: any) {
    if (e instanceof FinmapError && (e.status === 404 || e.status === 400)) {
      return { entity: "match" as SyncEntity, status: "ok", fetched: 0, inserted: 0, updated: 0, skipped: 0, message: "теги недоступні в API" };
    }
    throw e;
  }
}

/** Рахунки постачальників Finmap — додаткове джерело звірки, не нова система закупівель. */
export async function syncInvoices(db: Db): Promise<SyncResult> {
  let list: any[] = [];
  try {
    const res = await finmap.invoices();
    list = Array.isArray(res) ? res : res?.list ?? res?.data ?? [];
  } catch (e: any) {
    if (e instanceof FinmapError && (e.status === 404 || e.status === 400 || e.status === 403)) {
      return { entity: "invoices", status: "ok", fetched: 0, inserted: 0, updated: 0, skipped: 0, message: "рахунки недоступні в API або немає прав" };
    }
    throw e;
  }
  if (!list.length) return { entity: "invoices", status: "ok", fetched: 0, inserted: 0, updated: 0, skipped: 0 };

  const { data: cps } = await db.from("finance_counterparties").select("id,finmap_id").not("finmap_id", "is", null);
  const cpById = new Map((cps ?? []).map((c: any) => [c.finmap_id, c.id]));
  const { data: existing } = await db.from("finmap_invoices").select("finmap_id");
  const known = new Set((existing ?? []).map((e: any) => e.finmap_id));

  const rows = list.map((i: any) => ({
    finmap_id: String(i.id ?? i.invoiceId),
    number: i.number ?? i.invoiceNumber ?? null,
    counterparty_id: cpById.get(String(i.counterpartyId ?? "")) ?? null,
    counterparty_name: i.counterpartyName ?? i.supplier ?? null,
    issue_date: isoDay(i.date ?? i.issueDate),
    due_date: isoDay(i.dueDate),
    amount: Number(i.sum ?? i.amount) || 0,
    currency: i.currencyId ?? "UAH",
    amount_uah: i.companyCurrencySum ?? null,
    vat_amount: Number(i.vat ?? i.vatAmount) || null,
    discount_amount: Number(i.discount) || null,
    delivery_amount: Number(i.delivery) || null,
    status: i.status ?? null,
    items: (i.items ?? i.goods ?? []) as any,
    attachments: (i.attachments ?? []) as any,
    payload: i,
    match_status: "unmatched",
  }));
  const { error } = await db.from("finmap_invoices").upsert(rows, { onConflict: "finmap_id" });
  if (error) throw new Error(`finmap_invoices: ${error.message}`);
  const inserted = rows.filter((r) => !known.has(r.finmap_id)).length;
  return { entity: "invoices", status: "ok", fetched: rows.length, inserted, updated: rows.length - inserted, skipped: 0 };
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
      const raw = o as any;
      // Касова дата ≠ управлінський період: Finmap повертає обидва набори полів.
      const opDate = isoDay(o.date);
      const paymentDate = isoDay(raw.dateOfPayment ?? raw.paymentDate) ?? opDate;
      const periodStart = isoDay(raw.periodStartTimestamp ?? raw.periodStart) ?? opDate;
      const periodEnd = isoDay(raw.periodEndTimestamp ?? raw.periodEnd) ?? periodStart;
      const approved = typeof raw.approved === "boolean" ? raw.approved : null;
      return {
        finmap_id: o.id,
        kind: o.type === "income" ? "income" : o.type === "transfer" ? "transfer" : "expense",
        op_date: opDate,
        payment_date: paymentDate,
        period_start: periodStart,
        period_end: periodEnd,
        approved,
        state: operationState(raw),
        tags: normalizeTags(raw) as any,
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
    await saveAllocations(db, ops, { prById, catById });
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
    { entity: "invoices", run: () => syncInvoices(db) },
    { entity: "match" as SyncEntity, run: () => syncTags(db) },
    {
      entity: "match" as SyncEntity,
      run: async () => {
        const { runFinmapAutoMatch } = await import("./finmap-match.server");
        const reports = await runFinmapAutoMatch(db);
        const linked = reports.reduce((s, r) => s + r.linked, 0);
        const review = reports.reduce((s, r) => s + r.review, 0);
        return {
          entity: "match" as SyncEntity, status: "ok" as const,
          fetched: linked + review, inserted: linked, updated: 0, skipped: review,
          message: reports.map((r) => `${r.entity}: зв'язано ${r.linked}, на перевірку ${r.review}`).join("; "),
        };
      },
    },
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
