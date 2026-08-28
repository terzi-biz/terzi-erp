/**
 * Серверний Calculation Core (Launch Contract §1, §7).
 *
 * Єдина точка, де підсумки кошторису народжуються на сервері. Клієнтський DTO
 * будується тут же, тому в network response фізично немає закупівельних цін,
 * собівартості, амортизації, прибутку і маржі — навіть зі значенням `null`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCanonicalResult, type CoreInput } from "./index";
import { toClientDTO, toInternalDTO, type ClientEstimateDTO, type InternalEstimateDTO } from "./dto";

export interface CalculateCoreRequest extends CoreInput {
  /** Який контур потрібен викликачу. */
  mode: "client" | "internal";
}

export const calculateCanonical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CalculateCoreRequest) => {
    if (!data || typeof data.module !== "string" || !Array.isArray(data.lines)) {
      throw new Error("Некоректний запит до Calculation Core.");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<
    | { ok: true; mode: "client"; dto: ClientEstimateDTO }
    | { ok: true; mode: "internal"; dto: InternalEstimateDTO }
    | { ok: false; error: string }
  > => {
    const { mode, ...input } = data;
    const canonical = buildCanonicalResult(input);

    if (mode === "internal") {
      const { canViewInternalPrices } = await import("@/lib/access.server");
      if (!(await canViewInternalPrices(context.userId))) {
        return { ok: false, error: "Немає прав на перегляд внутрішніх цін." };
      }
      return { ok: true, mode: "internal", dto: toInternalDTO(canonical) };
    }

    return { ok: true, mode: "client", dto: toClientDTO(canonical) };
  });
