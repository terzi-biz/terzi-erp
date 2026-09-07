import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { periodFilter, syncInput, mappingInput, linkTransactionInput, uuid } from "./finance.schema";
import { z } from "zod";

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
    const [{ data: accounts }, { data: tx }, { data: invoices }, { data: payroll }] = await Promise.all([
      context.supabase.from("finance_accounts").select("id,name,currency,opening_balance,actual_balance,balance_synced_at,source").eq("archived", false).order("name"),
      context.supabase.from("finance_transactions").select("kind,amount,amount_uah,op_date,order_id,client_id,counterparty_id,category_id,match_status").gte("op_date", data.from).lte("op_date", data.to),
      context.supabase.from("invoices").select("id,total,paid,status,due_date,client_id,order_id"),
      context.supabase.from("payroll_calculations").select("total_payable,paid_amount,status,payroll_group,period_id"),
    ]);

    const rows = (tx ?? []) as any[];
    const amt = (r: any) => Number(r.amount_uah ?? r.amount) || 0;
    const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + amt(r), 0);
    const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + amt(r), 0);
    const transfers = rows.filter((r) => r.kind === "transfer").reduce((s, r) => s + amt(r), 0);

    const inv = (invoices ?? []) as any[];
    const receivable = inv
      .filter((i) => !["cancelled", "draft"].includes(i.status))
      .reduce((s, i) => s + Math.max((Number(i.total) || 0) - (Number(i.paid) || 0), 0), 0);
    const overdue = inv
      .filter((i) => i.due_date && new Date(i.due_date) < new Date() && (Number(i.total) || 0) > (Number(i.paid) || 0))
      .reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.paid) || 0)), 0);

    const pay = (payroll ?? []) as any[];
    const payrollAccrued = pay.reduce((s, p) => s + (Number(p.total_payable) || 0), 0);
    const payrollPaid = pay.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0);

    return {
      accounts: accounts ?? [],
      cashOnAccounts: (accounts ?? []).reduce((s: number, a: any) => s + (Number(a.actual_balance ?? a.opening_balance) || 0), 0),
      income, expense, transfers,
      cashFlow: income - expense,
      grossProfit: income - expense,
      margin: income > 0 ? ((income - expense) / income) * 100 : 0,
      receivable, overdue,
      payable: Math.max(payrollAccrued - payrollPaid, 0),
      payrollAccrued, payrollPaid,
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
    const patch: Record<string, unknown> = { match_status: status };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;
    const { data: out, error } = await context.supabase
      .from("finance_transactions").update(patch).eq("id", transaction_id).select().single();
    if (error) { console.error("linkFinanceTransaction", error); throw new Error("Не вдалося зберегти зв'язок"); }
    await context.supabase.from("finance_transaction_links").insert({
      transaction_id, entity_type: fields.order_id ? "order" : fields.client_id ? "client" : "counterparty",
      entity_id: fields.order_id ?? fields.client_id ?? fields.counterparty_id ?? null,
      amount: out.amount, confidence: 1, status: "manual", created_by: context.userId,
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
      context.supabase.from("estimates").select("id,order_id,total,materials_total,works_total,logistics_total,created_at").gte("created_at", `${data.from}T00:00:00Z`).lte("created_at", `${data.to}T23:59:59Z`),
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
    plan.revenue = est.reduce((s, e) => s + (Number(e.total) || 0), 0);
    plan.materials = est.reduce((s, e) => s + (Number(e.materials_total) || 0), 0);
    plan.labour = est.reduce((s, e) => s + (Number(e.works_total) || 0), 0);
    plan.logistics = est.reduce((s, e) => s + (Number(e.logistics_total) || 0), 0);

    return ARTICLES.map((a) => {
      const p = plan[a] ?? 0, f = actual[a] ?? 0;
      return { article: a, plan: p, actual: f, variance: f - p, variancePercent: p > 0 ? ((f - p) / p) * 100 : null };
    });
  });
