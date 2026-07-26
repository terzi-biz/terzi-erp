import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const safeNum = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Всі підтримувані статуси (нові workflow-статуси + legacy). */
export const ESTIMATE_STATUSES = [
  "preliminary",   // Попередній розрахунок
  "afterMeasure",  // Розрахунок після заміру
  "final",         // Фінальний розрахунок
  "inWork",        // В роботі
  "done",          // Виконано
  "refused",       // Відмова
  // legacy (зберігаємо, щоб старі записи не ламались)
  "draft", "sent", "approved", "archived",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  preliminary: "Попередній розрахунок",
  afterMeasure: "Розрахунок після заміру",
  final: "Фінальний розрахунок",
  inWork: "В роботі",
  done: "Виконано",
  refused: "Відмова",
  draft: "Чернетка",
  sent: "Надіслано",
  approved: "Затверджено",
  archived: "Архів",
};

const estimateInput = z.object({
  id: z.string().uuid().optional(),
  number: z.string().min(1).max(100),
  module: z.enum(["screed", "roofing", "insulation", "demolition"]),
  status: z.enum(ESTIMATE_STATUSES).default("preliminary"),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(200).optional().nullable(),
  client_phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  manager: z.string().max(200).optional().nullable(),
  area: z.number().nonnegative().optional().nullable(),
  thickness_cm: z.number().nonnegative().optional().nullable(),
  total_client: z.preprocess(safeNum, z.number().nonnegative().default(0)),
  total_cost: z.preprocess(safeNum, z.number().nonnegative().default(0)),
  gross_profit: z.preprocess(safeNum, z.number().default(0)),
  margin_percent: z.preprocess(safeNum, z.number().default(0)),
  payload: z.any().default({}),
  // П1.1 — детермінований snapshot розрахунку
  calculation_json: z.any().optional().nullable(),
  engine_version: z.string().max(100).optional().nullable(),
  price_book_version: z.number().int().optional().nullable(),
  // П2.5 — режим клієнтського виду
  client_view_mode: z.enum(["detailed","condensed","turnkey"]).optional(),
});

/** П1.2 — фінансовий gate. Повертає null якщо ok, або текст помилки. */
function financialGate(row: z.infer<typeof estimateInput>, isAdmin: boolean): string | null {
  const tc = Number(row.total_client) || 0;
  const cost = Number(row.total_cost) || 0;
  const gp = Number(row.gross_profit) || 0;
  const mp = Number(row.margin_percent) || 0;
  if (tc < 0 || cost < 0) return "Від'ємні підсумки заборонені";
  const expectedGp = +(tc - cost).toFixed(2);
  if (Math.abs(gp - expectedGp) > 1) {
    return `Валовий прибуток не збігається: ${gp} vs очікуване ${expectedGp}`;
  }
  const expectedMp = tc > 0 ? +((expectedGp / tc) * 100).toFixed(2) : 0;
  if (Math.abs(mp - expectedMp) > 0.5) {
    return `Маржа не збігається: ${mp}% vs очікуване ${expectedMp}%`;
  }
  if (!isAdmin && expectedGp < 0) {
    return "Від'ємна маржа: збереження заборонено (потрібен адміністратор)";
  }
  const calc = row.calculation_json as
    | { lines?: Array<Record<string, unknown>>; totalClient?: number; totalCost?: number }
    | null
    | undefined;
  if (calc && Array.isArray(calc.lines)) {
    for (const l of calc.lines) {
      const q = Number((l as any).qty);
      const pc = Number((l as any).priceClient ?? (l as any).pricePerUnit);
      const c = Number((l as any).cost);
      if ((Number.isFinite(q) && q < 0) || (Number.isFinite(pc) && pc < 0) || (Number.isFinite(c) && c < 0)) {
        return "У snapshot є від'ємні значення qty/ціна/собівартість";
      }
    }
    if (typeof calc.totalClient === "number" && Math.abs(calc.totalClient - tc) > 5) {
      return `Підсумок клієнта не збігається зі snapshot (${calc.totalClient} vs ${tc})`;
    }
    if (typeof calc.totalCost === "number" && Math.abs(calc.totalCost - cost) > 5) {
      return `Собівартість не збігається зі snapshot (${calc.totalCost} vs ${cost})`;
    }
  }
  return null;
}

async function userIsInternal(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

function stripInternal<T extends Record<string, any>>(row: T): T {
  const out: any = { ...row, total_cost: null, gross_profit: null, margin_percent: null };
  if (out.payload && typeof out.payload === "object") {
    const p = { ...out.payload };
    delete p.totalCost; delete p.grossProfit; delete p.marginPercent;
    delete p.materialsCost; delete p.worksCost; delete p.logisticsCost;
    if (Array.isArray(p.lines)) {
      p.lines = p.lines.map((l: any) => {
        const { costPerUnit, cost, ...rest } = l;
        return rest;
      });
    }
    out.payload = p;
  }
  return out;
}

/** Додає manager_display з profiles за owner_id. */
async function attachManager(supabase: any, rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean)));
  if (!ownerIds.length) return rows.map((r) => ({ ...r, manager_display: r.manager || null }));
  const { data: profs } = await supabase
    .from("profiles").select("user_id,display_name,email").in("user_id", ownerIds);
  const map = new Map<string, string>();
  (profs ?? []).forEach((p: any) => map.set(p.user_id, p.display_name || p.email || ""));
  return rows.map((r) => ({
    ...r,
    manager_display: r.manager || map.get(r.owner_id) || null,
  }));
}

async function actorName(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles").select("display_name,email").eq("user_id", userId).maybeSingle();
  return (data?.display_name || data?.email || null) as string | null;
}

async function logAudit(
  supabase: any, userId: string, estimateId: string,
  action: string, changes: Record<string, any> = {},
) {
  try {
    const name = await actorName(supabase, userId);
    await supabase.from("estimate_audit_log").insert({
      estimate_id: estimateId, actor_id: userId, actor_name: name,
      action, changes,
    });
  } catch (e) { console.error("logAudit", e); }
}

function diffFields(before: Record<string, any>, after: Record<string, any>, keys: string[]) {
  const out: Record<string, { from: any; to: any }> = {};
  for (const k of keys) {
    const a = before?.[k] ?? null;
    const b = after?.[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}

export const listEstimates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("estimates").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listEstimates", error); throw new Error("Не вдалося завантажити кошториси"); }
    const rows = data ?? [];
    const internal = await userIsInternal(context.supabase, context.userId);
    const withMgr = await attachManager(context.supabase, rows);
    return internal ? withMgr : withMgr.map(stripInternal);
  });

export const listEstimatesByClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("estimates").select("*")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (error) { console.error("listEstimatesByClient", error); throw new Error("Не вдалося завантажити кошториси клієнта"); }
    const internal = await userIsInternal(context.supabase, context.userId);
    const withMgr = await attachManager(context.supabase, rows ?? []);
    return internal ? withMgr : withMgr.map(stripInternal);
  });

export const getEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("estimates").select("*").eq("id", data.id).maybeSingle();
    if (error) { console.error("getEstimate", error); throw new Error("Не вдалося отримати кошторис"); }
    if (!row) throw new Error("Кошторис не знайдено");
    const internal = await userIsInternal(context.supabase, context.userId);
    const [withMgr] = await attachManager(context.supabase, [row]);
    return internal ? withMgr : stripInternal(withMgr);
  });

const AUDITED_FIELDS = [
  "number","status","client_id","client_name","client_phone","address","manager",
  "area","thickness_cm","total_client","total_cost","gross_profit","margin_percent",
] as const;

export const saveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => estimateInput.parse(d))
  .handler(async ({ data, context }) => {
    const isAdmin = await userIsInternal(context.supabase, context.userId);
    const gateError = financialGate(data, isAdmin);
    if (gateError) throw new Error(gateError);
    const row = { ...data, owner_id: context.userId };
    let before: any = null;
    if (data.id) {
      const { data: prev } = await context.supabase
        .from("estimates").select("*").eq("id", data.id).maybeSingle();
      before = prev;
    }
    const { data: out, error } = data.id
      ? await context.supabase.from("estimates").update(row).eq("id", data.id).select().single()
      : await context.supabase.from("estimates").insert(row).select().single();
    if (error) { console.error("saveEstimate", error); throw new Error("Не вдалося зберегти кошторис"); }

    if (data.id && before) {
      const changes = diffFields(before, out, AUDITED_FIELDS as unknown as string[]);
      if (Object.keys(changes).length) {
        await logAudit(context.supabase, context.userId, out.id, "updated", changes);
      }
    } else {
      await logAudit(context.supabase, context.userId, out.id, "created", { number: out.number, module: out.module });
    }
    return out;
  });

const partialEditInput = z.object({
  id: z.string().uuid(),
  number: z.string().min(1).max(100).optional(),
  client_name: z.string().max(200).nullable().optional(),
  client_phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  manager: z.string().max(200).nullable().optional(),
  area: z.number().nonnegative().nullable().optional(),
  thickness_cm: z.number().nonnegative().nullable().optional(),
  total_client: z.preprocess(safeNum, z.number().nonnegative()).optional(),
  note: z.string().max(500).optional(),
});

/** Часткове редагування прямо з історії — з журналюванням. */
export const updateEstimateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => partialEditInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, note, ...patch } = data;
    const { data: before, error: e0 } = await context.supabase
      .from("estimates").select("*").eq("id", id).maybeSingle();
    if (e0) { console.error(e0); throw new Error("Не вдалося зчитати кошторис"); }
    if (!before) throw new Error("Немає прав або кошторис відсутній");

    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) cleaned[k] = v;
    if (!Object.keys(cleaned).length) return before;

    const { data: out, error } = await context.supabase
      .from("estimates").update(cleaned as any).eq("id", id).select().maybeSingle();
    if (error) { console.error("updateEstimateFields", error); throw new Error("Не вдалося зберегти зміни"); }
    if (!out) throw new Error("Немає прав або кошторис відсутній");

    const changes = diffFields(before, out, Object.keys(cleaned));
    if (Object.keys(changes).length || note) {
      await logAudit(context.supabase, context.userId, id, "edited_in_history",
        { ...changes, ...(note ? { note } : {}) });
    }
    return out;
  });

export const updateEstimateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(ESTIMATE_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase
      .from("estimates").select("status").eq("id", data.id).maybeSingle();
    const { data: out, error } = await context.supabase
      .from("estimates").update({ status: data.status }).eq("id", data.id)
      .select("id,status").maybeSingle();
    if (error) { console.error("updateEstimateStatus", error); throw new Error("Не вдалося оновити статус"); }
    if (!out) throw new Error("Немає прав або кошторис відсутній");
    if (prev?.status !== out.status) {
      await logAudit(context.supabase, context.userId, out.id, "status_changed",
        { status: { from: prev?.status ?? null, to: out.status } });
    }
    return out;
  });

export const scheduleEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      startAtISO: z.string().nullable(),
      durationDays: z.number().positive().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    let end: string | null = null;
    if (data.startAtISO && data.durationDays) {
      const s = new Date(data.startAtISO);
      const e = new Date(s); e.setDate(e.getDate() + Math.max(1, Math.ceil(data.durationDays)));
      end = e.toISOString();
    }
    const { data: prev } = await context.supabase
      .from("estimates").select("schedule_start_at,schedule_end_at,duration_override_days")
      .eq("id", data.id).maybeSingle();
    const { data: out, error } = await context.supabase
      .from("estimates").update({
        schedule_start_at: data.startAtISO,
        schedule_end_at: end,
        duration_override_days: data.durationDays,
      }).eq("id", data.id).select("id,schedule_start_at,schedule_end_at").maybeSingle();
    if (error) { console.error("scheduleEstimate", error); throw new Error("Не вдалося запланувати"); }
    if (!out) throw new Error("Немає прав або кошторис відсутній");
    await logAudit(context.supabase, context.userId, out.id,
      data.startAtISO ? "scheduled" : "schedule_cleared",
      {
        schedule_start_at: { from: prev?.schedule_start_at ?? null, to: out.schedule_start_at },
        schedule_end_at: { from: prev?.schedule_end_at ?? null, to: out.schedule_end_at },
        duration_override_days: { from: prev?.duration_override_days ?? null, to: data.durationDays },
      });
    return out;
  });

export const deleteEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase
      .from("estimates").select("number").eq("id", data.id).maybeSingle();
    if (prev) {
      // журнал перед видаленням, бо ON DELETE CASCADE прибере записи
      await logAudit(context.supabase, context.userId, data.id, "deleted", { number: prev.number });
    }
    const { error } = await context.supabase.from("estimates").delete().eq("id", data.id);
    if (error) { console.error("deleteEstimate", error); throw new Error("Не вдалося видалити кошторис"); }
    return { ok: true };
  });

export const listEstimateAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ estimate_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("estimate_audit_log").select("*")
      .eq("estimate_id", data.estimate_id)
      .order("created_at", { ascending: false });
    if (error) { console.error("listEstimateAudit", error); throw new Error("Не вдалося завантажити журнал"); }
    return rows ?? [];
  });

/* ============================================================
   П2.4 — Версії кошторису (immutable snapshots)
   ============================================================ */

async function snapshotEstimate(supabase: any, estimateId: string) {
  const { data: row, error } = await supabase
    .from("estimates").select("*").eq("id", estimateId).maybeSingle();
  if (error || !row) throw new Error("Кошторис не знайдено для snapshot");
  return {
    number: row.number, module: row.module, status: row.status,
    client_id: row.client_id, client_name: row.client_name,
    client_phone: row.client_phone, address: row.address, manager: row.manager,
    area: row.area, thickness_cm: row.thickness_cm,
    total_client: row.total_client, total_cost: row.total_cost,
    gross_profit: row.gross_profit, margin_percent: row.margin_percent,
    payload: row.payload, calculation_json: row.calculation_json,
  };
}

export const listEstimateVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ estimate_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("estimate_versions")
      .select("id,version_no,snapshot_kind,engine_version,price_book_version,approved_by_name,note,created_at")
      .eq("estimate_id", data.estimate_id)
      .order("version_no", { ascending: false });
    if (error) { console.error("listEstimateVersions", error); throw new Error("Не вдалося завантажити версії"); }
    return rows ?? [];
  });

export const getEstimateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("estimate_versions").select("*").eq("id", data.id).maybeSingle();
    if (error) { console.error("getEstimateVersion", error); throw new Error("Не вдалося отримати версію"); }
    if (!row) throw new Error("Версію не знайдено");
    return row;
  });

export const approveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      note: z.string().max(1000).optional(),
      kind: z.enum(["approved", "production"]).default("approved"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const snap = await snapshotEstimate(context.supabase, data.id);
    const { data: prev } = await context.supabase
      .from("estimate_versions")
      .select("version_no").eq("estimate_id", data.id)
      .order("version_no", { ascending: false }).limit(1).maybeSingle();
    const nextNo = (prev?.version_no ?? 0) + 1;

    const { data: prof } = await context.supabase
      .from("profiles").select("display_name,email").eq("user_id", context.userId).maybeSingle();
    const actor = (prof?.display_name || prof?.email || null) as string | null;

    const { data: est } = await context.supabase
      .from("estimates").select("engine_version,price_book_version").eq("id", data.id).maybeSingle();

    const { data: ver, error } = await context.supabase.from("estimate_versions").insert({
      estimate_id: data.id,
      version_no: nextNo,
      snapshot_kind: data.kind,
      snapshot: snap,
      engine_version: est?.engine_version ?? null,
      price_book_version: est?.price_book_version ?? null,
      approved_by: context.userId,
      approved_by_name: actor,
      note: data.note ?? null,
    }).select().single();
    if (error) { console.error("approveEstimate", error); throw new Error("Не вдалося створити версію"); }

    if (data.kind === "approved") {
      await context.supabase.from("estimates")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", data.id);
    } else {
      await context.supabase.from("estimates")
        .update({ status: "inWork" })
        .eq("id", data.id);
    }
    await logAudit(context.supabase, context.userId, data.id,
      data.kind === "approved" ? "approved_version" : "production_version",
      { version_no: nextNo, note: data.note ?? null });
    return ver;
  });

export const forkEstimateFromVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ version_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ver, error } = await context.supabase
      .from("estimate_versions").select("*").eq("id", data.version_id).maybeSingle();
    if (error || !ver) throw new Error("Версію не знайдено");
    const s = ver.snapshot as any;
    const suffix = "-v" + (ver.version_no + 1);
    const newRow: any = {
      number: (s.number || "TRZ") + suffix,
      module: s.module,
      status: "draft",
      client_id: s.client_id,
      client_name: s.client_name,
      client_phone: s.client_phone,
      address: s.address,
      manager: s.manager,
      area: s.area,
      thickness_cm: s.thickness_cm,
      total_client: s.total_client ?? 0,
      total_cost: s.total_cost ?? 0,
      gross_profit: s.gross_profit ?? 0,
      margin_percent: s.margin_percent ?? 0,
      payload: s.payload ?? {},
      calculation_json: s.calculation_json ?? null,
      engine_version: ver.engine_version,
      price_book_version: ver.price_book_version,
      owner_id: context.userId,
    };
    const { data: out, error: e2 } = await context.supabase
      .from("estimates").insert(newRow).select().single();
    if (e2) { console.error("forkEstimate", e2); throw new Error("Не вдалося створити копію"); }
    await logAudit(context.supabase, context.userId, out.id, "forked_from_version",
      { source_version: ver.version_no, source_estimate: ver.estimate_id });
    return out;
  });

/* ============================================================
   П3.10 — Аналітика: прибуток за розрізами
   ============================================================ */

export const reportProfitBy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    dimension: z.enum(["manager", "module", "status"]).default("manager"),
    dateFrom: z.string().optional().nullable(),
    dateTo: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const isAdmin = await userIsInternal(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Доступ лише для адміністраторів");
    let q = context.supabase.from("estimates")
      .select("owner_id,manager,module,status,total_client,total_cost,gross_profit,created_at");
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);
    const { data: rows, error } = await q;
    if (error) { console.error("reportProfitBy", error); throw new Error("Не вдалося зібрати звіт"); }
    const withMgr = await attachManager(context.supabase, rows ?? []);
    const buckets = new Map<string, { key: string; count: number; sell: number; cost: number; profit: number }>();
    for (const r of withMgr as any[]) {
      const key = String(
        data.dimension === "manager" ? (r.manager_display || "—") :
        data.dimension === "module" ? (r.module || "—") :
        (r.status || "—")
      );
      const b = buckets.get(key) ?? { key, count: 0, sell: 0, cost: 0, profit: 0 };
      b.count += 1;
      b.sell += Number(r.total_client) || 0;
      b.cost += Number(r.total_cost) || 0;
      b.profit += Number(r.gross_profit) || 0;
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => b.profit - a.profit);
  });
