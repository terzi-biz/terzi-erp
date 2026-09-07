/** Zod-схеми нового фінансового контуру (окремо від *.functions.ts). */
import { z } from "zod";

export const uuid = z.string().uuid();

export const periodFilter = z.object({
  from: z.string().min(4),
  to: z.string().min(4),
  order_id: uuid.nullish(),
  client_id: uuid.nullish(),
  counterparty_id: uuid.nullish(),
  category_id: uuid.nullish(),
  account_id: uuid.nullish(),
  kind: z.enum(["all", "income", "expense", "transfer"]).default("all"),
  match_status: z.enum(["all", "matched", "unmatched", "needs_review"]).default("all"),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0),
});

export const syncInput = z.object({
  mode: z.enum(["initial", "incremental"]).default("incremental"),
  from: z.string().min(4).optional(),
  to: z.string().min(4).optional(),
});

export const mappingInput = z.object({
  id: uuid.optional(),
  finmap_kind: z.string().min(1).max(40),
  finmap_id: z.string().min(1).max(80),
  finmap_name: z.string().max(300).nullish(),
  erp_entity: z.enum(["client", "supplier", "employee", "order", "category"]),
  erp_id: uuid.nullable(),
  status: z.enum(["matched", "unmatched", "needs_review", "manual"]).default("manual"),
});

export const linkTransactionInput = z.object({
  transaction_id: uuid,
  order_id: uuid.nullish(),
  client_id: uuid.nullish(),
  counterparty_id: uuid.nullish(),
  category_id: uuid.nullish(),
  status: z.enum(["matched", "needs_review", "unmatched"]).default("matched"),
});

export const payrollProfileInput = z.object({
  id: uuid.optional(),
  employee_id: uuid,
  role_key: z.string().max(60).nullish(),
  payroll_group: z.enum(["administrative", "commercial", "production"]).default("administrative"),
  base_salary: z.number().min(0),
  advance_percent: z.number().min(0).max(100).default(50),
  kpi_scheme: z.array(z.object({
    code: z.string().min(1).max(60),
    title: z.string().min(1).max(200),
    kpi_type: z.enum([
      "FIXED_SALARY", "FIXED_KPI", "PERCENT_KPI", "SALES_MARGIN_PERCENT", "OBJECT_PROFIT_PERCENT",
      "PER_M2", "PER_LM", "PER_OBJECT", "QUALITY_BONUS", "MANUAL_BONUS", "DEDUCTION", "REIMBURSEMENT",
    ]),
    target: z.number().optional(),
    weight: z.number().optional(),
    rate: z.number().optional(),
    percent: z.number().optional(),
  })).default([]),
  bonus_rules: z.record(z.any()).default({}),
  payment_rules: z.record(z.any()).default({}),
  valid_from: z.string().min(4),
  valid_to: z.string().min(4).nullish(),
});

export const payrollPeriodInput = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

export const payrollKpiFactInput = z.object({
  calculation_id: uuid,
  code: z.string().min(1),
  actual: z.number(),
  approved: z.boolean().default(false),
});

export const payrollStatusInput = z.object({
  calculation_id: uuid,
  to_status: z.enum([
    "calculated", "awaiting_verification", "verified", "awaiting_approval",
    "approved", "scheduled", "partially_paid", "paid",
  ]),
  comment: z.string().max(500).nullish(),
});
