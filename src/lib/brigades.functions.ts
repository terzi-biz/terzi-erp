/**
 * Бригади ↔ замовлення ↔ кошторис ↔ відомість.
 * Економіка/ставки/виплати — лише owner/admin/director/finance (requirePayrollAccess).
 * Призначення бригад на об'єкт — право orders:edit. Усі записи — service role після перевірки + audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const code = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const MODULES = ["screed", "roofing", "general", "demolition", "insulation"] as const;

async function ctx() {
  const acc = await import("./access.server");
  return { ...acc, db: (await acc.admin()) as any };
}
async function payroll(userId: string) {
  const { requirePayrollAccess } = await import("./payroll-bridge.server");
  return requirePayrollAccess(userId);
}
const kyivMonth = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

export type BrigadeRow = { key: string; label: string; module: string; payroll_id: string | null; active: boolean; sort_order: number; notes: string | null };

export const listBrigades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).from("brigades").select("key,label,module,payroll_id,active,sort_order,notes").order("sort_order");
    return (data ?? []) as BrigadeRow[];
  });

export const upsertBrigade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/), label: z.string().min(1).max(80), module: z.enum(MODULES),
    payroll_id: z.string().max(64).nullable(), active: z.boolean(), sort_order: z.number().int().min(0).max(10000), notes: z.string().max(300).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const { data: prev } = await db.from("brigades").select("*").eq("key", data.key).maybeSingle();
    const { error } = await db.from("brigades").upsert(data, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "staff", action: prev ? "brigade.update" : "brigade.create", entityType: "brigade", entityId: data.key, entityLabel: data.label, oldValue: prev, newValue: data });
    return { ok: true };
  });

export type CatalogBrigadeOption = {
  key: string; label: string; siteId: string | null; source: "catalog" | "local_only"; active: boolean;
  headcount: number | null; rates: { code: string; label: string; unit: string | null; rate: number | null }[]; pendingLocal: boolean;
};
/** Об'єднаний список: каталог відомості канонічний; локальні без зіставлення — «лише ERP». Розцінки клієнта не повертаються. */
async function buildBrigadeOptions(local: BrigadeRow[], actorId: string, withRates: boolean) {
  const { fetchSiteCatalog } = await import("./payroll-bridge.server");
  const { matchSiteId, erpKeyForSiteId } = await import("./payroll-bridge");
  const cat = await fetchSiteCatalog(actorId);
  if (!cat.ok) return { catalogStatus: { ok: false as const, reason: cat.reason }, options: null as CatalogBrigadeOption[] | null };
  const ids = new Set(cat.catalog.brigades.map((b) => b.id));
  const byId = new Map<string, BrigadeRow>();
  for (const l of local) { const id = matchSiteId(l, ids); if (id && !byId.has(id)) byId.set(id, l); }
  const matchedKeys = new Set([...byId.values()].map((l) => l.key));
  const options: CatalogBrigadeOption[] = cat.catalog.brigades.map((b) => {
    const l = byId.get(b.id);
    return { key: l?.key ?? `site:${b.id}`, label: b.name, siteId: b.id, source: "catalog", active: b.active, headcount: b.headcount, pendingLocal: !l,
      rates: withRates ? b.rates.map((r) => ({ code: r.code, label: r.label, unit: r.unit, rate: r.rate })) : [] };
  });
  for (const l of local) if (!matchedKeys.has(l.key)) options.push({ key: l.key, label: l.label, siteId: null, source: "local_only", active: l.active, headcount: null, rates: [], pendingLocal: false });
  void erpKeyForSiteId;
  return { catalogStatus: { ok: true as const, revision: cat.catalog.revision, updatedAt: cat.catalog.updatedAt }, options };
}

export const getOrderBrigades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: all }, { data: assigned }] = await Promise.all([
      sb.from("brigades").select("key,label,module,payroll_id,active,sort_order,notes").order("sort_order"),
      sb.from("order_brigades").select("brigade_key").eq("order_id", data.orderId),
    ]);
    let canEdit = true;
    try { const { requirePermission } = await ctx(); await requirePermission(context.userId, "orders", "edit"); } catch { canEdit = false; }
    let canSeeEconomics = true;
    try { await payroll(context.userId); } catch { canSeeEconomics = false; }
    const { catalogStatus, options } = await buildBrigadeOptions((all ?? []) as BrigadeRow[], context.userId, canSeeEconomics);
    return { brigades: (all ?? []) as BrigadeRow[], options, catalogStatus, assigned: ((assigned ?? []) as any[]).map((r) => r.brigade_key as string), canEdit, canSeeEconomics };
  });

export const setOrderBrigades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid, brigadeKeys: z.array(z.string().max(48)).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, db, writeAudit } = await ctx();
    const actor = await requirePermission(context.userId, "orders", "edit");
    let keys = [...new Set(data.brigadeKeys)];
    const siteKeys = keys.filter((k) => k.startsWith("site:"));
    if (siteKeys.length) {
      // Нова бригада з каталогу відомості: перевіряємо на сервері і створюємо локальний запис із payroll_id.
      const { fetchSiteCatalog } = await import("./payroll-bridge.server");
      const { erpKeyForSiteId } = await import("./payroll-bridge");
      const cat = await fetchSiteCatalog(context.userId);
      if (!cat.ok) throw new Error(cat.reason);
      for (const sk of siteKeys) {
        const id = sk.slice(5);
        const b = cat.catalog.brigades.find((x) => x.id === id && x.active);
        if (!b) throw new Error(`Бригади ${id} немає в каталозі відомості або вона неактивна`);
        const key = erpKeyForSiteId(id);
        const { data: exists } = await db.from("brigades").select("key,payroll_id").eq("key", key).maybeSingle();
        if (exists && exists.payroll_id && exists.payroll_id !== id) throw new Error(`Ключ ${key} уже зіставлено з іншою бригадою`);
        const kind = (b.kind ?? "").toLowerCase();
        const module = (MODULES as readonly string[]).includes(kind) ? kind : "general";
        const row = { key, label: b.name.slice(0, 80), module, payroll_id: id, active: true, sort_order: 1000, notes: "З каталогу відомості" };
        if (!exists) {
          const { error } = await db.from("brigades").insert(row);
          if (error) throw new Error(error.message);
          await writeAudit(actor, { module: "staff", action: "brigade.create_from_catalog", entityType: "brigade", entityId: key, entityLabel: row.label, newValue: row });
        } else if (!exists.payroll_id) {
          await db.from("brigades").update({ payroll_id: id, active: true }).eq("key", key);
        }
        keys = keys.map((k) => (k === sk ? key : k));
      }
      keys = [...new Set(keys)];
    }
    if (keys.length) {
      const { data: found } = await db.from("brigades").select("key").in("key", keys).eq("active", true);
      if ((found ?? []).length !== keys.length) throw new Error("Невідома або неактивна бригада");
    }
    const { data: prev } = await db.from("order_brigades").select("brigade_key").eq("order_id", data.orderId);
    const before = ((prev ?? []) as any[]).map((r) => r.brigade_key);
    const remove = before.filter((k: string) => !keys.includes(k));
    const add = keys.filter((k) => !before.includes(k));
    if (remove.length) await db.from("order_brigades").delete().eq("order_id", data.orderId).in("brigade_key", remove);
    if (add.length) {
      const { error } = await db.from("order_brigades").insert(add.map((k) => ({ order_id: data.orderId, brigade_key: k, created_by: context.userId })));
      if (error) throw new Error(error.message);
    }
    await writeAudit(actor, { module: "orders", action: "order.brigades", entityType: "order", entityId: data.orderId, orderId: data.orderId, oldValue: before, newValue: keys });
    return { ok: true, assigned: keys };
  });

/** Повна економіка об'єкта по бригадах (план/факт/різниця). */
export const getOrderBrigadeEconomics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await payroll(context.userId);
    const { db } = await ctx();
    const { computeEconomics, mapEstimateWorks } = await import("./brigade-economics");
    const [{ data: order }, { data: est }, { data: meas }, { data: brigades }, { data: assigned }, { data: volumes }, { data: rates }, { data: payouts }, { data: mappings }] = await Promise.all([
      db.from("orders").select("id,name,planned_start").eq("id", data.orderId).maybeSingle(),
      db.from("estimates").select("id,number,module,total_client,total_cost,internal_lines,approved_at").eq("order_id", data.orderId).not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("order_measurements").select("id,area,status,created_at").eq("order_id", data.orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("brigades").select("key,label,module,payroll_id,active"),
      db.from("order_brigades").select("brigade_key").eq("order_id", data.orderId),
      db.from("order_work_volumes").select("*").eq("order_id", data.orderId).order("created_at"),
      db.from("brigade_work_rates").select("brigade_key,service_code,unit,rate,effective_from,effective_to,active"),
      db.from("order_brigade_payouts").select("*").eq("order_id", data.orderId).order("created_at"),
      db.from("work_code_mappings").select("estimate_module,line_code,service_code,unit,active"),
    ]);
    if (!order) throw new Error("Об'єкт не знайдено");
    const num = (rows: any[] | null, f: string[]) => (rows ?? []).map((r) => { const o = { ...r }; for (const k of f) o[k] = Number(r[k]); return o; });
    const V = num(volumes, ["quantity"]);
    const R = num(rates, ["rate"]);
    const P = num(payouts, ["amount"]);
    const econ = computeEconomics({ estimate: est ?? null, volumes: V, rates: R, payouts: P, factRevenue: null, factNonLabor: null });
    const works = est ? mapEstimateWorks(est.module, est.internal_lines, (mappings ?? []) as any) : { mapped: [], unmapped: [] };
    return JSON.parse(JSON.stringify({
      order, estimate: est ? { id: est.id, number: est.number, module: est.module, approved_at: est.approved_at } : null,
      measurement: meas ?? null, brigades: brigades ?? [], assigned: ((assigned ?? []) as any[]).map((r) => r.brigade_key),
      volumes: V, payouts: P, econ, estimateWorks: works,
      defaultPeriod: kyivMonth(order.planned_start ? new Date(order.planned_start) : new Date()),
      factNote: "Фактична виручка і прямі витрати по об'єкту ще не підтверджені в ERP — факт. маржа: немає даних",
    })) as any;
  });

/** План з реальних рядків затвердженого кошторису (через маппінг) або з площі завершеного заміру. */
export const pullPlanVolumes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid, brigadeKey: z.string().max(48), source: z.enum(["estimate", "measurement"]), serviceCode: code.optional(), period }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const { mapEstimateWorks } = await import("./brigade-economics");
    const { data: ob } = await db.from("order_brigades").select("brigade_key").eq("order_id", data.orderId).eq("brigade_key", data.brigadeKey).maybeSingle();
    if (!ob) throw new Error("Бригаду не призначено на цей об'єкт");
    let rows: any[] = [];
    let ref = "";
    if (data.source === "estimate") {
      const { data: est } = await db.from("estimates").select("id,module,internal_lines").eq("order_id", data.orderId).not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle();
      if (!est) throw new Error("Немає затвердженого кошторису");
      const { data: mappings } = await db.from("work_code_mappings").select("estimate_module,line_code,service_code,unit,active");
      const { mapped } = mapEstimateWorks(est.module, est.internal_lines, (mappings ?? []) as any);
      if (!mapped.length) throw new Error("Жодна позиція робіт кошторису не зіставлена з кодом роботи — налаштуйте маппінг");
      ref = `estimate:${est.id}`;
      rows = mapped.map((m) => ({ service_code: m.service_code, quantity: m.quantity, unit: m.unit, source_ref: `${ref}:${m.code}` }));
    } else {
      if (!data.serviceCode) throw new Error("Вкажіть код роботи");
      const { data: meas } = await db.from("order_measurements").select("id,area,status").eq("order_id", data.orderId).in("status", ["done", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const area = Number(meas?.area);
      if (!meas || !(area > 0)) throw new Error("Немає завершеного заміру з площею");
      ref = `measurement:${meas.id}`;
      rows = [{ service_code: data.serviceCode, quantity: area, unit: "м²", source_ref: ref }];
    }
    // Попередній план цього джерела для бригади — анулюється (історія зберігається).
    await db.from("order_work_volumes").update({ voided: true }).eq("order_id", data.orderId).eq("brigade_key", data.brigadeKey)
      .eq("kind", "plan").eq("source", data.source).eq("voided", false);
    const ins = rows.map((r) => ({ ...r, order_id: data.orderId, brigade_key: data.brigadeKey, kind: "plan", source: data.source, period: data.period, created_by: context.userId }));
    const { error } = await db.from("order_work_volumes").insert(ins);
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "production", action: "work_volume.plan_pull", entityType: "order", entityId: data.orderId, orderId: data.orderId, newValue: ins });
    return { ok: true, count: ins.length };
  });

export const addWorkVolume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    orderId: uuid, brigadeKey: z.string().max(48), serviceCode: code, kind: z.enum(["plan", "fact"]),
    quantity: z.number().positive().max(1e7), unit: z.string().max(16).nullable(), period, note: z.string().max(300).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const { data: b } = await db.from("brigades").select("key").eq("key", data.brigadeKey).maybeSingle();
    if (!b) throw new Error("Невідома бригада");
    const row = { order_id: data.orderId, brigade_key: data.brigadeKey, service_code: data.serviceCode, kind: data.kind, quantity: data.quantity, unit: data.unit, source: "manual", period: data.period, note: data.note, created_by: context.userId, confirmed: false };
    const { error } = await db.from("order_work_volumes").insert(row);
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "production", action: "work_volume.add", entityType: "order", entityId: data.orderId, orderId: data.orderId, newValue: row });
    return { ok: true };
  });

/** Підтвердження факту обсягу / виплати — окрема явна дія. Анулювання не видаляє рядок. */
export const setRecordState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ table: z.enum(["order_work_volumes", "order_brigade_payouts"]), id: uuid, action: z.enum(["confirm", "void"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const { data: prev } = await db.from(data.table).select("*").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("Запис не знайдено");
    if (prev.voided) throw new Error("Запис анульовано");
    if (data.action === "confirm" && data.table === "order_work_volumes" && prev.kind !== "fact") throw new Error("План не підтверджується як факт — додайте окремий рядок факту");
    const patch = data.action === "confirm" ? { confirmed: true, confirmed_by: context.userId, confirmed_at: new Date().toISOString() } : { voided: true };
    const { error } = await db.from(data.table).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "finance", action: `${data.table}.${data.action}`, entityType: data.table, entityId: data.id, orderId: prev.order_id, oldValue: prev, newValue: patch, isCritical: data.action === "confirm" });
    return { ok: true };
  });

export const addPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: uuid, brigadeKey: z.string().max(48), amount: z.number().positive().max(1e9), period, note: z.string().max(300).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const row = { order_id: data.orderId, brigade_key: data.brigadeKey, amount: data.amount, period: data.period, source: "manual", note: data.note, created_by: context.userId, confirmed: false };
    const { error } = await db.from("order_brigade_payouts").insert(row);
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "finance", action: "brigade_payout.add", entityType: "order", entityId: data.orderId, orderId: data.orderId, newValue: row, financialImpact: data.amount });
    return { ok: true };
  });

export const listRatesAndMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await payroll(context.userId);
    const { db } = await ctx();
    const [{ data: rates }, { data: mappings }] = await Promise.all([
      db.from("brigade_work_rates").select("*").order("brigade_key").order("effective_from", { ascending: false }),
      db.from("work_code_mappings").select("*").order("estimate_module").order("line_code"),
    ]);
    return JSON.parse(JSON.stringify({ rates: rates ?? [], mappings: mappings ?? [] })) as { rates: any[]; mappings: any[] };
  });

/** Нова ставка = новий рядок з датою дії; попередня закривається (історія не перезаписується). */
export const addRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brigadeKey: z.string().max(48), serviceCode: code, unit: z.string().min(1).max(16), rate: z.number().positive().max(1e6), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(300).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const dayBefore = new Date(`${data.effectiveFrom}T00:00:00Z`); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    await db.from("brigade_work_rates").update({ effective_to: dayBefore.toISOString().slice(0, 10) })
      .eq("brigade_key", data.brigadeKey).eq("service_code", data.serviceCode).is("effective_to", null).lt("effective_from", data.effectiveFrom);
    const row = { brigade_key: data.brigadeKey, service_code: data.serviceCode, unit: data.unit, rate: data.rate, effective_from: data.effectiveFrom, note: data.note, created_by: context.userId };
    const { error } = await db.from("brigade_work_rates").insert(row);
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "staff", action: "brigade_rate.add", entityType: "brigade", entityId: data.brigadeKey, newValue: row, isCritical: true });
    return { ok: true };
  });

export const upsertMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ estimateModule: z.string().min(1).max(32), lineCode: z.string().min(1).max(32), serviceCode: code, unit: z.string().max(16).nullable(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await payroll(context.userId);
    const { db, writeAudit } = await ctx();
    const row = { estimate_module: data.estimateModule, line_code: data.lineCode, service_code: data.serviceCode, unit: data.unit, active: data.active, created_by: context.userId };
    const { error } = await db.from("work_code_mappings").upsert(row, { onConflict: "estimate_module,line_code" });
    if (error) throw new Error(error.message);
    await writeAudit(actor, { module: "settings", action: "work_mapping.upsert", entityType: "work_code_mapping", entityId: `${data.estimateModule}:${data.lineCode}`, newValue: row });
    return { ok: true };
  });

/** Зведення для дашборду. Без доступу → null (блок приховано). */
export const getPayrollDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { await payroll(context.userId); } catch { return null; }
    const { db } = await ctx();
    const { bridgeConfigured, fetchSiteOverview } = await import("./payroll-bridge.server");
    const month = kyivMonth(new Date());
    const sitePromise = fetchSiteOverview(month, context.userId);
    const [{ count: unconfirmedFact }, { data: pays }, { count: planOrders }, { data: lastSent }, { data: lastError }] = await Promise.all([
      db.from("order_work_volumes").select("id", { count: "exact", head: true }).eq("kind", "fact").eq("confirmed", false).eq("voided", false),
      db.from("order_brigade_payouts").select("amount,confirmed").eq("period", month).eq("voided", false),
      db.from("order_work_volumes").select("order_id", { count: "exact", head: true }).eq("kind", "plan").eq("voided", false).eq("period", month),
      db.from("payroll_sync_log").select("created_at").eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("payroll_sync_log").select("created_at,message").eq("status", "error").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const confirmed = ((pays ?? []) as any[]).filter((p) => p.confirmed);
    const site = await sitePromise;
    return {
      month, configured: bridgeConfigured(), site,
      confirmedPayouts: confirmed.length ? confirmed.reduce((s, p) => s + Number(p.amount), 0) : null,
      unconfirmedPayouts: ((pays ?? []) as any[]).filter((p) => !p.confirmed).length,
      unconfirmedFact: unconfirmedFact ?? 0, planRows: planOrders ?? 0,
      lastSent: lastSent?.created_at ?? null, lastError: lastError ? { at: lastError.created_at, message: lastError.message } : null,
    };
  });
