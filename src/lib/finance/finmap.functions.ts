import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { periodFilter, syncInput, mappingInput, linkTransactionInput, uuid } from "./finance.schema";
import { z } from "zod";
import { costClassOf, CANONICAL_COST_CLASSES } from "./cost-class";

/** Фінансовий контур: доступ лише admin / director / finance. */
async function assertFinance(context: any) {
  const { data, error } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  if (error) { console.error("is_finance_user", error); throw new Error("Не вдалося перевірити права доступу"); }
  if (data !== true) throw new Error("Немає доступу до фінансових даних");
  return true;
}

// ---------------- Finmap: стан, перевірка, синхронізація ----------------

export const getFinmapStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const [{ data: state }, { data: log }, counts] = await Promise.all([
      context.supabase.from("finmap_sync_state").select("*").order("entity"),
      context.supabase.from("finmap_sync_log").select("*").order("created_at", { ascending: false }).limit(50),
      Promise.all([
        context.supabase.from("finance_accounts").select("id", { count: "exact", head: true }).not("finmap_id", "is", null),
        context.supabase.from("finance_projects").select("id", { count: "exact", head: true }),
        context.supabase.from("finance_counterparties").select("id", { count: "exact", head: true }),
        context.supabase.from("finance_transactions").select("id", { count: "exact", head: true }),
        context.supabase.from("finance_transactions").select("id", { count: "exact", head: true }).eq("match_status", "unmatched"),
        context.supabase.from("finmap_webhook_events").select("id", { count: "exact", head: true }),
      ]),
    ]);
    const [accounts, projects, counterparties, transactions, unmatched, webhooks] = counts;
    return {
      configured: !!process.env["FINMAP_API_KEY"],
      apiVersion: "2.2",
      state: state ?? [],
      log: log ?? [],
      counts: {
        accounts: accounts.count ?? 0,
        projects: projects.count ?? 0,
        counterparties: counterparties.count ?? 0,
        transactions: transactions.count ?? 0,
        unmatched: unmatched.count ?? 0,
        webhookEvents: webhooks.count ?? 0,
      },
    };
  });

export const testFinmapConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const { finmapConfigured, finmap, FinmapError } = await import("./finmap-client.server");
    if (!finmapConfigured()) return { ok: false, message: "Не додано ключ Finmap (FINMAP_API_KEY)" };
    const t0 = Date.now();
    try {
      const health = await finmap.health();
      const accounts = await finmap.accounts(true);
      await context.supabase.from("finmap_sync_log").insert({
        entity: "health", mode: "test", status: "ok", http_status: 200,
        fetched: accounts.length, duration_ms: Date.now() - t0, started_by: context.userId,
        message: `Підключення успішне, рахунків: ${accounts.length}`,
      });
      return { ok: true, message: `Підключено. Стан: ${health?.status ?? "ok"}. Рахунків у Finmap: ${accounts.length}` };
    } catch (e: any) {
      const status = e instanceof FinmapError ? e.status : 503;
      await context.supabase.from("finmap_sync_log").insert({
        entity: "health", mode: "test", status: "error", http_status: status,
        duration_ms: Date.now() - t0, started_by: context.userId, message: String(e?.message ?? e),
      });
      return { ok: false, message: String(e?.message ?? e) };
    }
  });

export const runFinmapSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => syncInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { finmapConfigured } = await import("./finmap-client.server");
    if (!finmapConfigured()) throw new Error("Не додано ключ Finmap (FINMAP_API_KEY)");
    const { runFinmapSync } = await import("./finmap-sync.server");
    const results = await runFinmapSync(context.supabase, { ...data, userId: context.userId });
    return results;
  });

/** Автозв'язок Finmap ↔ ERP без повторного завантаження даних із Finmap. */
export const runFinmapMatchNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dry_run: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { runFinmapAutoMatch } = await import("./finmap-match.server");
    const reports = await runFinmapAutoMatch(context.supabase, { dryRun: data.dry_run });
    // Пробний прохід нічого не пише — ані зв'язків, ані журналу.
    if (data.dry_run) return reports;
    await context.supabase.from("finmap_sync_log").insert({
      entity: "match", mode: "match", status: "ok",
      fetched: reports.reduce((s, r) => s + r.linked + r.review, 0),
      inserted: reports.reduce((s, r) => s + r.linked, 0),
      skipped: reports.reduce((s, r) => s + r.review, 0),
      started_by: context.userId,
      message: reports.map((r) => `${r.entity}: зв'язано ${r.linked}, на перевірку ${r.review}`).join("; "),
    });
    return reports;
  });

// ---------------- Журнал операцій ----------------

export const listFinanceTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodFilter.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    let q = context.supabase
      .from("finance_transactions")
      .select(
        "*, account:account_id(name), to_account:to_account_id(name), category:category_id(name,kind), counterparty:counterparty_id(name,kind), order:order_id(number,name), client:client_id(name)",
        { count: "exact" },
      )
      .gte("op_date", data.from)
      .lte("op_date", data.to)
      .order("op_date", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.match_status !== "all") q = q.eq("match_status", data.match_status);
    if (data.order_id) q = q.eq("order_id", data.order_id);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.counterparty_id) q = q.eq("counterparty_id", data.counterparty_id);
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    if (data.search) q = q.ilike("comment", `%${data.search}%`);

    const { data: rows, error, count } = await q;
    if (error) { console.error("listFinanceTransactions", error); throw new Error("Не вдалося завантажити операції"); }
    return { rows: rows ?? [], total: count ?? 0 };
  });

/** Зведення періоду: гроші на рахунках, доходи, витрати, cash flow, дебіторка/кредиторка, ФОП. */
export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodFilter.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const [{ data: accounts }, { data: tx }, { data: invoices }, { data: payroll }, { data: categories }] = await Promise.all([
      context.supabase.from("finance_accounts").select("id,name,currency,opening_balance,actual_balance,balance_synced_at,source").eq("archived", false).order("name"),
      context.supabase.from("finance_transactions").select("kind,amount,amount_uah,op_date,order_id,client_id,counterparty_id,category_id,match_status").gte("op_date", data.from).lte("op_date", data.to),
      context.supabase.from("invoices").select("id,total,paid,status,due_date,client_id,order_id"),
      context.supabase
        .from("payroll_calculations")
        .select("total_payable,paid_amount,base_amount,kpi_amount,bonus_amount,advance_amount,status,payroll_group,period:period_id(period)"),
      context.supabase.from("finance_categories").select("id,name,cost_class").limit(2000),
    ]);

    const rows = (tx ?? []) as any[];
    const amt = (r: any) => Number(r.amount_uah ?? r.amount) || 0;
    const transfers = rows.filter((r) => r.kind === "transfer").reduce((s, r) => s + amt(r), 0);
    void invoices; // дебіторка рахується канонічно за етапами договорів, а не за legacy-рахунками


    // ФОТ періоду: беремо лише розрахунки, місяць яких потрапляє у вибраний діапазон.
    const pay = ((payroll ?? []) as any[]).filter((p) => {
      const per = p.period?.period as string | undefined;
      if (!per) return false;
      return per >= String(data.from).slice(0, 10) && per <= String(data.to).slice(0, 10);
    });
    const sum = (key: string) => pay.reduce((s, p) => s + (Number(p[key]) || 0), 0);
    const payrollAccrued = sum("total_payable");
    const payrollPaid = sum("paid_amount");
    const payrollBase = sum("base_amount");
    const payrollKpi = sum("kpi_amount") + sum("bonus_amount");
    const payrollAdvance = sum("advance_amount");

    // Фактичний ФОТ періоду — з реальних операцій Finmap (категорії класу «ФОТ»).
    // Оновлюється автоматично після кожної синхронізації, без ручного вводу.
    const { costClassOf } = await import("./cost-class");
    const catById = new Map(((categories ?? []) as any[]).map((c) => [c.id, c]));
    const payrollFact = rows
      .filter((r) => r.kind === "expense" && costClassOf(catById.get(r.category_id) ?? null) === "payroll")
      .reduce((s, r) => s + amt(r), 0);

    // Телефонія: фактичні витрати на звʼязок із реальних операцій Finmap
    // (категорії зі згадкою звʼязку/телефонії). Нічого не домислюємо.
    const isTelephony = (c: any) => /зв.?яз|телефон|моб|binotel|київстар|kyivstar|vodafone|lifecell/i.test(String(c?.name ?? ""));
    const telephonyCost = rows
      .filter((r) => r.kind === "expense" && isTelephony(catById.get(r.category_id) ?? null))
      .reduce((s, r) => s + amt(r), 0);
    const telephonyOps = rows.filter((r) => r.kind === "expense" && isTelephony(catById.get(r.category_id) ?? null)).length;

    // Стан оновлення дзвінків: останній успішний синк і кількість дзвінків періоду.
    let callsSyncedAt: string | null = null;
    let callsSyncError: string | null = null;
    let callsCount: number | null = null;
    try {
      const [{ data: integration }, { count }] = await Promise.all([
        context.supabase
          .from("integrations")
          .select("last_success_at,last_sync_at,last_error")
          .eq("provider_key", "binotel")
          .maybeSingle(),
        context.supabase
          .from("crm_calls")
          .select("id", { count: "exact", head: true })
          .gte("started_at", `${data.from}T00:00:00.000Z`)
          .lte("started_at", `${data.to}T23:59:59.999Z`),
      ]);
      callsSyncedAt = ((integration as any)?.last_success_at ?? (integration as any)?.last_sync_at ?? null) as string | null;
      callsSyncError = ((integration as any)?.last_error ?? null) as string | null;
      callsCount = count ?? null;
    } catch {
      // Немає доступу до інтеграцій — блок телефонії просто лишиться без даних.
    }

    // Канонічні KPI — один розрахунок для Огляду і головного Dashboard.
    const { computeManagementKpi } = await import("./management.functions");
    const kpi = await computeManagementKpi(context.supabase, data.from, data.to);

    return {
      accounts: accounts ?? [],
      cashOnAccounts: kpi.cashBalance,
      income: kpi.income, expense: kpi.expense, transfers,
      cashFlow: kpi.profit,
      grossProfit: kpi.profit,
      margin: kpi.margin,
      receivable: kpi.receivableRemaining, overdue: kpi.receivableOverdue,
      receivableDue: kpi.receivableDue,
      payable: kpi.payableRemaining,
      payableOverdue: kpi.payableOverdue,
      scheduledReceipts30: kpi.scheduledReceipts30,
      scheduledPayments30: kpi.scheduledPayments30,
      payrollAccrued, payrollPaid, payrollBase, payrollKpi, payrollAdvance, payrollFact,
      payrollRest: Math.max(payrollAccrued - payrollPaid, 0),
      payrollEmployees: pay.length,
      telephonyCost, telephonyOps,
      callsSyncedAt, callsSyncError, callsCount,
      unmatched: rows.filter((r) => r.match_status === "unmatched").length,
      transactions: rows.length,
    };



  });

// ---------------- Мапінги та звірка ----------------

export const listFinmapMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const { data, error } = await context.supabase
      .from("finmap_entity_mappings").select("*").order("finmap_kind").order("finmap_name").limit(1000);
    if (error) { console.error("listFinmapMappings", error); throw new Error("Не вдалося завантажити відповідності"); }
    return data ?? [];
  });

export const saveFinmapMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => mappingInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const payload = { ...data, decided_by: context.userId, decided_at: new Date().toISOString() };
    const { data: out, error } = await context.supabase
      .from("finmap_entity_mappings")
      .upsert(payload, { onConflict: "finmap_kind,finmap_id" })
      .select().single();
    if (error) { console.error("saveFinmapMapping", error); throw new Error("Не вдалося зберегти відповідність"); }

    // Синхронізуємо локальні довідники за ID (не за назвою).
    if (data.erp_entity === "client" && data.erp_id) {
      await context.supabase.from("finance_counterparties").update({ client_id: data.erp_id })
        .eq("finmap_kind", data.finmap_kind).eq("finmap_id", data.finmap_id);
    }
    if (data.erp_entity === "employee" && data.erp_id) {
      await context.supabase.from("finance_counterparties").update({ employee_id: data.erp_id })
        .eq("finmap_kind", data.finmap_kind).eq("finmap_id", data.finmap_id);
    }
    if (data.erp_entity === "order" && data.erp_id) {
      await context.supabase.from("finance_projects").update({ order_id: data.erp_id }).eq("finmap_id", data.finmap_id);
      await context.supabase.from("finance_transactions").update({ order_id: data.erp_id, match_status: "matched" })
        .is("order_id", null)
        .in("finance_project_id",
          (await context.supabase.from("finance_projects").select("id").eq("finmap_id", data.finmap_id)).data?.map((p: any) => p.id) ?? [],
        );
    }
    // Ручні рішення оператора фіксуємо в журналі аудиту.
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, module: "finance", action: "finmap.mapping.save", is_critical: true,
      entity_type: data.erp_entity, entity_id: data.erp_id ?? null, entity_label: data.finmap_name ?? null,
      new_value: payload as never,
    });
    return out;
  });

/** Підказки звірки: до чого можна прив'язати непов'язану операцію (з рівнем впевненості). */
export const suggestTransactionLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ transaction_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: tx, error } = await context.supabase
      .from("finance_transactions").select("*").eq("id", data.transaction_id).single();
    if (error || !tx) throw new Error("Операцію не знайдено");

    const amount = Number(tx.amount_uah ?? tx.amount) || 0;
    const suggestions: { entity: "order" | "client" | "employee"; id: string; label: string; confidence: number; reason: string }[] = [];

    if (tx.kind === "income") {
      const { data: inv } = await context.supabase
        .from("invoices").select("id,number,total,paid,order_id,client_id,order:order_id(number,name),client:client_id(name)")
        .neq("status", "cancelled").limit(300);
      for (const i of (inv ?? []) as any[]) {
        const rest = (Number(i.total) || 0) - (Number(i.paid) || 0);
        if (rest <= 0) continue;
        const exact = Math.abs(rest - amount) < 0.5;
        if (exact || Math.abs(rest - amount) / Math.max(rest, 1) < 0.05) {
          suggestions.push({
            entity: "order", id: i.order_id ?? i.client_id, confidence: exact ? 0.9 : 0.6,
            label: `Рахунок ${i.number ?? ""} · ${i.order?.number ?? i.client?.name ?? ""}`,
            reason: exact ? "Сума збігається з залишком по рахунку" : "Сума близька до залишку по рахунку",
          });
        }
      }
    }

    if (tx.counterparty_id) {
      const { data: cp } = await context.supabase
        .from("finance_counterparties").select("client_id,employee_id,name").eq("id", tx.counterparty_id).maybeSingle();
      if (cp?.client_id) suggestions.push({ entity: "client", id: cp.client_id, label: cp.name, confidence: 0.85, reason: "Контрагент уже зіставлений із клієнтом" });
      if (cp?.employee_id) suggestions.push({ entity: "employee", id: cp.employee_id, label: cp.name, confidence: 0.85, reason: "Контрагент уже зіставлений зі співробітником" });
    }

    if (tx.finance_project_id) {
      const { data: pr } = await context.supabase
        .from("finance_projects").select("order_id,name,order:order_id(number,name)").eq("id", tx.finance_project_id).maybeSingle();
      if (pr?.order_id) suggestions.push({ entity: "order", id: pr.order_id, label: `${pr.order?.number ?? ""} ${pr.order?.name ?? pr.name}`, confidence: 0.95, reason: "Проєкт Finmap зіставлений із замовленням" });
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return { transaction: tx, suggestions: suggestions.slice(0, 10) };
  });

export const linkFinanceTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkTransactionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { transaction_id, status, ...fields } = data;
    const { data: before } = await context.supabase
      .from("finance_transactions").select("order_id,client_id,counterparty_id,match_status").eq("id", transaction_id).maybeSingle();
    const patch: Record<string, unknown> = { match_status: status };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;
    const { data: out, error } = await context.supabase
      .from("finance_transactions").update(patch as never).eq("id", transaction_id).select().single();
    if (error) { console.error("linkFinanceTransaction", error); throw new Error("Не вдалося зберегти зв'язок"); }
    await context.supabase.from("finance_transaction_links").insert({
      transaction_id, entity_type: fields.order_id ? "order" : fields.client_id ? "client" : "counterparty",
      entity_id: (fields.order_id ?? fields.client_id ?? fields.counterparty_id ?? null) as string,
      amount: out.amount, confidence: 1, status: "manual", created_by: context.userId,
    });
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, module: "finance", action: "transaction.link", is_critical: true,
      entity_type: "finance_transaction", entity_id: transaction_id,
      order_id: (fields.order_id ?? null) as string | null,
      client_id: (fields.client_id ?? null) as string | null,
      old_value: (before ?? null) as never, new_value: patch as never,
      financial_impact: Number(out.amount_uah ?? out.amount) || 0,
    });
    return out;
  });

/** План/факт по статтях за період: план — з кошторисів замовлень, факт — з операцій Finmap. */
export const getPlanFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodFilter.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const [{ data: tx }, { data: cats }, { data: estimates }] = await Promise.all([
      context.supabase.from("finance_transactions").select("kind,amount,amount_uah,category_id,order_id").gte("op_date", data.from).lte("op_date", data.to),
      context.supabase.from("finance_categories").select("id,name,kind,plan_article"),
      context.supabase.from("estimates").select("id,order_id,total_client,total_cost,internal_lines,created_at").gte("created_at", `${data.from}T00:00:00Z`).lte("created_at", `${data.to}T23:59:59Z`),
    ]);
    const catMap = new Map((cats ?? []).map((c: any) => [c.id, c]));
    const ARTICLES = ["revenue", "materials", "labour", "logistics", "equipment", "subcontract", "marketing", "administration", "other"] as const;

    const actual: Record<string, number> = Object.fromEntries(ARTICLES.map((a) => [a, 0]));
    for (const r of (tx ?? []) as any[]) {
      const v = Number(r.amount_uah ?? r.amount) || 0;
      if (r.kind === "transfer") continue;
      if (r.kind === "income") { actual.revenue += v; continue; }
      const art = (catMap.get(r.category_id) as any)?.plan_article ?? "other";
      actual[ARTICLES.includes(art) ? art : "other"] += v;
    }

    const est = (estimates ?? []) as any[];
    const plan: Record<string, number> = Object.fromEntries(ARTICLES.map((a) => [a, 0]));
    plan.revenue = est.reduce((s, e) => s + (Number(e.total_client) || 0), 0);
    // Плановий кошик витрат — із незмінного знімка кошторису (internal_lines).
    const ARTICLE_BY_KIND: Record<string, string> = {
      material: "materials", materials: "materials",
      work: "labour", works: "labour", labor: "labour", labour: "labour",
      logistics: "logistics", delivery: "logistics",
      equipment: "equipment", amortization: "equipment",
      subcontract: "subcontract", other: "other",
    };
    let classified = 0;
    for (const e of est) {
      const lines = Array.isArray(e.internal_lines) ? e.internal_lines : [];
      for (const l of lines as any[]) {
        const art = ARTICLE_BY_KIND[String(l?.kind ?? l?.type ?? "other").toLowerCase()] ?? "other";
        const v = Number(l?.cost ?? l?.total_cost ?? l?.amount) || 0;
        plan[art] += v;
        classified += v;
      }
    }
    const totalCost = est.reduce((s, e) => s + (Number(e.total_cost) || 0), 0);
    if (classified <= 0 && totalCost > 0) plan.other = totalCost;

    return ARTICLES.map((a) => {
      const p = plan[a] ?? 0, f = actual[a] ?? 0;
      return { article: a, plan: p, actual: f, variance: f - p, variancePercent: p > 0 ? ((f - p) / p) * 100 : null };
    });
  });

/**
 * Звірка: що саме заважає фінансам зійтися — операції без замовлення/клієнта,
 * проєкти й контрагенти без ERP-сутності, категорії без класу витрат.
 */
export const getFinanceReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().min(4).optional(), to: z.string().min(4).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertFinance(context);

    let txq = context.supabase
      .from("finance_transactions")
      .select("id,kind,amount,amount_uah,op_date,order_id,client_id,comment,category:category_id(id,name,cost_class),counterparty:counterparty_id(name)")
      .limit(20000);
    if (data.from) txq = txq.gte("op_date", data.from);
    if (data.to) txq = txq.lte("op_date", data.to);

    const [{ data: tx }, { data: projects }, { data: cps }, { data: cats }] = await Promise.all([
      txq,
      context.supabase.from("finance_projects").select("id,name,order_id,client_id,match_score").limit(5000),
      context.supabase.from("finance_counterparties").select("id,name,finmap_kind,client_id,employee_id,match_score").limit(5000),
      context.supabase.from("finance_categories").select("id,name,kind,cost_class").limit(2000),
    ]);

    const rows = (tx ?? []) as any[];
    const money = (t: any) => Number(t.amount_uah ?? t.amount) || 0;
    const nonTransfer = rows.filter((t) => t.kind !== "transfer");
    const noOrder = nonTransfer.filter((t) => !t.order_id);
    const noClient = nonTransfer.filter((t) => !t.client_id);
    const noCategory = nonTransfer.filter((t) => !t.category?.id);

    const sum = (list: any[]) => Math.round(list.reduce((s, t) => s + money(t), 0) * 100) / 100;

    return {
      transactions: {
        total: rows.length,
        totalAmount: sum(nonTransfer),
        noOrder: { count: noOrder.length, amount: sum(noOrder) },
        noClient: { count: noClient.length, amount: sum(noClient) },
        noCategory: { count: noCategory.length, amount: sum(noCategory) },
        top: noOrder
          .sort((a, b) => money(b) - money(a))
          .slice(0, 50)
          .map((t) => ({
            id: t.id, kind: t.kind, op_date: t.op_date, amount: money(t),
            category: t.category?.name ?? null, counterparty: t.counterparty?.name ?? null, comment: t.comment ?? null,
          })),
      },
      projects: {
        total: (projects ?? []).length,
        noOrder: ((projects ?? []) as any[]).filter((p) => !p.order_id).length,
        rows: ((projects ?? []) as any[]).filter((p) => !p.order_id).slice(0, 50)
          .map((p) => ({ id: p.id, name: p.name, client_id: p.client_id, score: p.match_score })),
      },
      counterparties: {
        total: (cps ?? []).length,
        unmapped: ((cps ?? []) as any[]).filter((c) => !c.client_id && !c.employee_id).length,
        rows: ((cps ?? []) as any[]).filter((c) => !c.client_id && !c.employee_id).slice(0, 50)
          .map((c) => ({ id: c.id, name: c.name, kind: c.finmap_kind, score: c.match_score })),
      },
      categories: {
        total: (cats ?? []).length,
        unclassified: ((cats ?? []) as any[]).filter((c) => !c.cost_class).length,
        rows: ((cats ?? []) as any[]).filter((c) => !c.cost_class).slice(0, 100)
          .map((c) => ({ id: c.id, name: c.name, kind: c.kind, suggested: costClassOf(c) })),
      },
    };
  });

/** Ручне закріплення класу витрат за статтею Finmap (переглядається фінансистом). */
export const saveCategoryCostClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ category_id: uuid, cost_class: z.enum(CANONICAL_COST_CLASSES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: before } = await context.supabase
      .from("finance_categories").select("id,name,cost_class").eq("id", data.category_id).maybeSingle();
    const { error } = await context.supabase
      .from("finance_categories").update({ cost_class: data.cost_class }).eq("id", data.category_id);
    if (error) { console.error("saveCategoryCostClass", error); throw new Error("Не вдалося зберегти клас витрат"); }
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, module: "finance", action: "category.cost_class", is_critical: true,
      entity_type: "finance_category", entity_id: data.category_id, entity_label: before?.name ?? null,
      old_value: { cost_class: before?.cost_class ?? null }, new_value: { cost_class: data.cost_class },
    });
    return { ok: true };
  });
