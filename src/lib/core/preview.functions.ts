/**
 * Авторизований серверний live-preview калькуляторів (Launch Contract §1, §7).
 *
 * Клієнт надсилає лише вхідні параметри й довідникові ціни, а отримує:
 *   - клієнтський DTO завжди;
 *   - внутрішній DTO (собівартість, амортизація, маржа, прибуток) — тільки
 *     після серверної перевірки прав.
 * Другого розрахунку підсумків на фронтенді не існує.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildModulePreview, CALC_MODULES, type ModulePreviewRequest, type TechInfo } from "./module-registry";
import { toClientDTO, toInternalDTO, type ClientEstimateDTO, type InternalEstimateDTO } from "./dto";
import type { CanonicalResult } from "./dto";

export interface ModulePreviewResponse {
  ok: true;
  tech: TechInfo;
  client: ClientEstimateDTO;
  /** Присутній лише для користувачів з правом на внутрішні ціни. */
  internal?: InternalEstimateDTO;
  /** Канонічний результат для незмінного знімка — теж лише внутрішній контур. */
  canonical?: CanonicalResult;
  warnings: string[];
}

export const previewModuleEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ModulePreviewRequest) => {
    if (!data || !(CALC_MODULES as readonly string[]).includes(data.module)) {
      throw new Error("Невідомий модуль розрахунку.");
    }
    if (!data.input || typeof data.input !== "object") throw new Error("Немає вхідних параметрів.");
    return data;
  })
  .handler(async ({ data, context }): Promise<ModulePreviewResponse | { ok: false; error: string }> => {
    const { canonical, tech } = buildModulePreview(data);
    const { canViewInternalPrices } = await import("@/lib/access.server");
    const internalAllowed = await canViewInternalPrices(context.userId);

    return {
      ok: true,
      tech,
      client: toClientDTO(canonical),
      warnings: [...canonical.warnings],
      ...(internalAllowed
        ? { internal: toInternalDTO(canonical), canonical }
        : {}),
    };
  });
