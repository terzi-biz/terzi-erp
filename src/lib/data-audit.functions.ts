import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Аудит цілісності даних: dry-run звіти та застосування за підтвердженням. */

const checkEnum = z.enum([
  "client_duplicates",
  "calls_to_leads",
  "leads_to_clients",
  "catalog_issues",
  "estimates_price_version",
]);

export const runDataAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ check: checkEnum, save: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("./data-audit/ops.server");
    await ops.requireAuditAdmin(context.supabase, context.userId);
    const report = await ops.buildAuditReport(data.check);
    if (data.save) {
      await context.supabase.from("data_audit_runs").insert({
        check_key: data.check,
        mode: "dry_run",
        status: "reported",
        affected_count: report.total,
        report: report as unknown as never,
        created_by: context.userId,
      });
    }
    return report;
  });

export const applyDataAuditAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ check: checkEnum, apply_key: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./data-audit/ops.server");
    await ops.requireAuditAdmin(context.supabase, context.userId);
    const res = await ops.applyAuditAction(data.apply_key, context.userId);
    await context.supabase.from("data_audit_runs").insert({
      check_key: data.check,
      mode: "apply",
      status: "applied",
      affected_count: 1,
      applied_count: res.applied,
      applied_at: new Date().toISOString(),
      report: { apply_key: data.apply_key, message: res.message },
      note: res.message,
      created_by: context.userId,
    });
    return res;
  });

export const listDataAuditRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("data_audit_runs")
      .select("id,check_key,mode,status,affected_count,applied_count,note,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("listDataAuditRuns", error.message);
      return [];
    }
    return data ?? [];
  });
