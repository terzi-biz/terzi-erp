import { z } from "zod";

/** Схеми валідації імпорту складу в окремому модулі (serverfn-split видаляє
 *  module-scope константи всередині *.functions.ts). */

export const previewImportSchema = z.object({
  bundleId: z.string().min(1).max(120),
  schemaVersion: z.string().min(1).max(20),
  fileSha256: z.string().length(64),
  fileBytes: z.number().int().min(1).max(64 * 1024 * 1024),
  sourceCommit: z.string().max(80).nullable().default(null),
  sourceName: z.string().max(200).nullable().default(null),
  productionImportAllowed: z.boolean().default(false),
  counters: z.record(z.string(), z.number()).default({}),
  problems: z.array(z.string().max(400)).max(200).default([]),
});

export const stageChunkSchema = z.object({
  runId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        source_kind: z.enum(["requirement", "supplier_product", "legacy_row"]),
        external_key: z.string().min(1).max(300),
        source_hash: z.string().max(120).default(""),
        raw: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(250),
});

export const listRowsSchema = z.object({
  runId: z.string().uuid(),
  kind: z.enum(["requirement", "supplier_product", "legacy_row"]).optional(),
  decision: z.enum(["needs_review", "verified", "linked", "created", "excluded"]).optional(),
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
});

export const reviewRowSchema = z.object({
  rowId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  decision: z.enum(["needs_review", "verified", "excluded"]),
  mapping: z
    .object({
      name: z.string().max(300).nullable().optional(),
      sku: z.string().max(100).nullable().optional(),
      unit_erp: z.string().max(30).nullable().optional(),
      module_resolved: z.string().max(50).nullable().optional(),
      catalog_item_id: z.string().uuid().nullable().optional(),
      category: z.string().max(120).nullable().optional(),
    })
    .optional(),
});

export const promoteRowsSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1).max(200),
});

export const runIdSchema = z.object({ runId: z.string().uuid() });

export const itemIdSchema = z.object({ itemId: z.string().uuid() });

export const attributeSaveSchema = z.object({
  itemId: z.string().uuid(),
  attribute_key: z.string().min(1).max(60),
  data_type: z.enum(["number", "range", "text"]),
  numeric_value: z.number().nullable().default(null),
  min_value: z.number().nullable().default(null),
  max_value: z.number().nullable().default(null),
  text_value: z.string().max(400).nullable().default(null),
  unit: z.string().max(30).nullable().default(null),
  source_text: z.string().max(400).nullable().default(null),
  verification_status: z.enum(["unknown", "source_only", "review_required", "verified"]).default("unknown"),
});

export const packUnitSaveSchema = z.object({
  itemId: z.string().uuid(),
  id: z.string().uuid().optional(),
  unit_label: z.string().min(1).max(60),
  base_qty_per_pack: z.number().positive(),
  barcode: z.string().max(60).nullable().default(null),
  verification_status: z.enum(["unknown", "source_only", "review_required", "verified"]).default("unknown"),
  source_text: z.string().max(300).nullable().default(null),
});

export const applicationSaveSchema = z.object({
  itemId: z.string().uuid(),
  module: z.string().min(1).max(50),
  link_type: z.enum(["catalog", "material", "none"]).default("none"),
  catalog_item_id: z.string().uuid().nullable().default(null),
  material_item_id: z.string().uuid().nullable().default(null),
  note: z.string().max(300).nullable().default(null),
});

export const deleteByIdSchema = z.object({ id: z.string().uuid() });
