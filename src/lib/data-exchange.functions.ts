import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const exportErpEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entityKey: z.string().min(1).max(60), limit: z.number().int().min(1).max(20000).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { exportEntityOp } = await import("./data-exchange/ops.server");
    const res = await exportEntityOp(context.userId, data);
    return { entityKey: res.entityKey, label: res.label, count: res.count, rowsJson: JSON.stringify(res.rows) };
  });

export const importErpEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entityKey: z.string().min(1).max(60),
        /** Рядки у вигляді JSON (масив об'єктів «ключ поля → значення»). */
        rowsJson: z.string().min(2).max(8_000_000),
        dryRun: z.boolean().default(true),
        updateExisting: z.boolean().default(true),
        changedOnly: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const parsed = JSON.parse(data.rowsJson) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Некоректний формат даних імпорту");
    if (parsed.length > 5000) throw new Error("За один раз можна імпортувати до 5000 рядків");
    const { importEntityOp } = await import("./data-exchange/ops.server");
    const res = await importEntityOp(context.userId, {
      entityKey: data.entityKey,
      rows: parsed as Record<string, unknown>[],
      dryRun: data.dryRun,
      updateExisting: data.updateExisting,
      changedOnly: data.changedOnly,
    });
    return { ...res, preview: JSON.stringify(res.preview) };
  });

