import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  previewImportSchema,
  stageChunkSchema,
  listRowsSchema,
  reviewRowSchema,
  promoteRowsSchema,
  runIdSchema,
} from "@/lib/warehouse-import.schema";

/** Проміжний імпорт складу: перегляд → черга перевірки → рішення → створення SKU. */

export const previewWarehouseImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { previewImport } = await import("./warehouse-import.server");
    return previewImport(context.userId, data);
  });

export const startWarehouseImportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { startRun } = await import("./warehouse-import.server");
    return startRun(context.userId, data);
  });

export const stageWarehouseImportChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => stageChunkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { stageChunk } = await import("./warehouse-import.server");
    return stageChunk(context.userId, data.runId, data.rows as any);
  });

export const listWarehouseImportRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listRuns } = await import("./warehouse-import.server");
    return listRuns(context.userId);
  });

export const listWarehouseImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRowsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { listRows } = await import("./warehouse-import.server");
    return listRows(context.userId, data);
  });

export const reviewWarehouseImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewRowSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { reviewRow } = await import("./warehouse-import.server");
    return reviewRow(context.userId, data as any);
  });

export const promoteWarehouseImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoteRowsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { promoteRows } = await import("./warehouse-import.server");
    return promoteRows(context.userId, data.rowIds);
  });

export const closeWarehouseImportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { requireImportAccess } = await import("./warehouse-import.server");
    await requireImportAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("warehouse_import_runs").update({ status: "closed" }).eq("id", data.runId);
    if (error) throw new Error("Не вдалося закрити запуск");
    return { ok: true };
  });

export const getWarehouseImportAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { canViewInternalPrices } = await import("./access.server");
    return { allowed: await canViewInternalPrices(context.userId) };
  });
