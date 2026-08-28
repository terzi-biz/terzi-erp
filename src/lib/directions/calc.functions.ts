/**
 * Generic server endpoints конструктора напрямків: schema + calculate.
 *
 * Будь-який напрямок (у т.ч. створений у конструкторі) рахується тим самим
 * детермінованим рушієм `evaluateDirectionRuntime` на сервері. Формули
 * виконуються безпечним парсером (без eval).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateDirectionRuntime, DIRECTION_ENGINE_VERSION, type RuntimePricing, type RuntimeResult } from "./runtime";

/** Контекст формул не серіалізується і не потрібен клієнту. */
export type DirectionCalcResult = Omit<RuntimeResult, "ctx">;

export type DirectionSource = "draft" | "published";

export interface DirectionSchemaRequest {
  directionId: string;
  source?: DirectionSource;
  version?: number | null;
}

export interface DirectionCalcRequest extends DirectionSchemaRequest {
  inputs: Record<string, unknown>;
  pricing?: RuntimePricing;
}

async function resolveDefinition(
  db: never,
  req: DirectionSchemaRequest,
) {
  const { loadDraftDefinition, loadPublishedDefinition } = await import("./load.server");
  if ((req.source ?? "published") === "draft") {
    return { def: await loadDraftDefinition(db, req.directionId), version: null as number | null };
  }
  const pub = await loadPublishedDefinition(db, req.directionId, req.version ?? null);
  if (!pub) throw new Error("Напрямок ще не має опублікованої версії.");
  return { def: pub.def, version: pub.version };
}

/** Схема напрямку: поля вводу, одиниці, залежності — для рендера форми. */
export const getDirectionSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: DirectionSchemaRequest) => {
    if (!data?.directionId) throw new Error("Не вказано напрямок.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { def, version } = await resolveDefinition(context.supabase as never, data);
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      version,
      engineVersion: DIRECTION_ENGINE_VERSION,
      fields: (def.fields ?? []).map((f) => ({
        field_key: f.field_key,
        label: f.label,
        type: f.type,
        unit: f.unit ?? null,
        default_value: (f.default_value ?? null) as string | number | boolean | null,
        enum_values: (Array.isArray(f.enum_values) ? f.enum_values.map(String) : null) as string[] | null,
        sort_order: f.sort_order ?? 0,
      })),
      formulas: (def.formulas ?? []).map((f) => ({ key: f.formula_key, unit: f.output_unit ?? null })),
    };
  });

/** Розрахунок напрямку. Preview (draft) і продакшн (published) — один рушій. */
export const calculateDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: DirectionCalcRequest) => {
    if (!data?.directionId) throw new Error("Не вказано напрямок.");
    if (!data.inputs || typeof data.inputs !== "object") throw new Error("Немає вхідних параметрів.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{
    version: number | null;
    source: DirectionSource;
    result: DirectionCalcResult;
    internalAllowed: boolean;
  }> => {
    const { def, version } = await resolveDefinition(context.supabase as never, data);
    const { ctx: _ctx, ...result } = evaluateDirectionRuntime(def, data.inputs, data.pricing ?? {});

    const { canViewInternalPrices } = await import("@/lib/access.server");
    const internalAllowed = await canViewInternalPrices(context.userId);
    if (internalAllowed) return { version, source: data.source ?? "published", result, internalAllowed };

    // Без прав на внутрішні ціни віддаємо лише клієнтський контур.
    const safe: DirectionCalcResult = {
      ...result,
      lines: result.lines
        .filter((l) => l.showToClient)
        .map((l) => ({ ...l, costPerUnit: 0, cost: 0, purchaseCost: 0 })),
      totals: { ...result.totals, totalCost: 0, grossProfit: 0, marginPercent: 0, markupPercent: 0 },
    };
    return { version, source: data.source ?? "published", result: safe, internalAllowed };
  });
