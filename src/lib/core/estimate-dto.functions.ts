/**
 * Серверна видача кошторису в двох роздільних DTO (Launch Contract §7).
 *
 * Клієнтський DTO будується НА СЕРВЕРІ: у network response фізично немає
 * закупівельних цін, собівартості, амортизації, прибутку і маржі.
 * Внутрішній DTO віддається лише після серверної перевірки прав.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CanonicalResult, ClientEstimateDTO, InternalEstimateDTO } from "./dto";
import { toClientDTO, toInternalDTO } from "./dto";

/** Знімок кошторису, збережений у `estimates.calculation_json`. */
export interface StoredCanonical {
  canonical?: CanonicalResult;
}

export const getEstimateDTO = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; mode: "internal" | "client" }) => data)
  .handler(async ({ data, context }): Promise<
    | { ok: true; mode: "client"; dto: ClientEstimateDTO }
    | { ok: true; mode: "internal"; dto: InternalEstimateDTO }
    | { ok: false; error: string }
  > => {
    const { data: row } = await context.supabase
      .from("estimates")
      .select("id,calculation_json")
      .eq("id", data.id)
      .maybeSingle();

    const canonical = (row?.calculation_json as StoredCanonical | null)?.canonical;
    if (!canonical) return { ok: false, error: "Кошторис не містить канонічного знімку розрахунку." };

    if (data.mode === "internal") {
      const { canViewInternalPrices } = await import("@/lib/access.server");
      if (!(await canViewInternalPrices(context.userId))) {
        return { ok: false, error: "Немає прав на перегляд внутрішніх цін." };
      }
      return { ok: true, mode: "internal", dto: toInternalDTO(canonical) };
    }

    return { ok: true, mode: "client", dto: toClientDTO(canonical) };
  });
