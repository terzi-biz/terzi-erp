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
});

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

export const saveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => estimateInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_id: context.userId };
    const { data: out, error } = data.id
      ? await context.supabase.from("estimates").update(row).eq("id", data.id).select().single()
      : await context.supabase.from("estimates").insert(row).select().single();
    if (error) { console.error("saveEstimate", error); throw new Error("Не вдалося зберегти кошторис"); }
    return out;
  });

export const updateEstimateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(ESTIMATE_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase
      .from("estimates").update({ status: data.status }).eq("id", data.id)
      .select("id,status").maybeSingle();
    if (error) { console.error("updateEstimateStatus", error); throw new Error("Не вдалося оновити статус"); }
    if (!out) throw new Error("Немає прав або кошторис відсутній");
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
    const { data: out, error } = await context.supabase
      .from("estimates").update({
        schedule_start_at: data.startAtISO,
        schedule_end_at: end,
        duration_override_days: data.durationDays,
      }).eq("id", data.id).select("id,schedule_start_at,schedule_end_at").maybeSingle();
    if (error) { console.error("scheduleEstimate", error); throw new Error("Не вдалося запланувати"); }
    if (!out) throw new Error("Немає прав або кошторис відсутній");
    return out;
  });

export const deleteEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("estimates").delete().eq("id", data.id);
    if (error) { console.error("deleteEstimate", error); throw new Error("Не вдалося видалити кошторис"); }
    return { ok: true };
  });
