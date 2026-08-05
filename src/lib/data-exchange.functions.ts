import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const exportErpEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entityKey: z.string().min(1).max(60), limit: z.number().int().min(1).max(20000).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { exportEntityOp } = await import("./data-exchange/ops.server");
    return exportEntityOp(context.userId, data);
  });

export const importErpEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entityKey: z.string().min(1).max(60),
        rows: z.array(z.record(z.string(), z.unknown())).max(5000),
        dryRun: z.boolean().default(true),
        updateExisting: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { importEntityOp } = await import("./data-exchange/ops.server");
    return importEntityOp(context.userId, data);
  });
