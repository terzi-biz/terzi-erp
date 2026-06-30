import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const safeNum = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const estimateInput = z.object({
  id: z.string().uuid().optional(),
  number: z.string().min(1).max(100),
  module: z.enum(["screed", "roofing", "insulation", "demolition"]),
  status: z.enum(["draft", "sent", "approved", "inWork", "done", "refused", "archived"]).default("draft"),
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

export const listEstimates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("estimates").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listEstimates", error); throw new Error("Не вдалося завантажити кошториси"); }
    const rows = data ?? [];
    const internal = await userIsInternal(context.supabase, context.userId);
    return internal ? rows : rows.map(stripInternal);
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

export const deleteEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("estimates").delete().eq("id", data.id);
    if (error) { console.error("deleteEstimate", error); throw new Error("Не вдалося видалити кошторис"); }
    return { ok: true };
  });
