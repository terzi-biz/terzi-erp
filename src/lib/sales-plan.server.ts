/** Серверна логіка місячних планів продажів (без createServerFn). */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_COMPANY_SALES_TARGET,
  SALES_COMPANY_METRIC,
  canEditSalesPlan,
  managerMetricKey,
  monthStart,
  sumManagersDriftWarning,
} from "./sales-plan";
import { kyivToday } from "./kyiv-time";

export type SalesPlanManagerRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  role_key: string | null;
  target: number;
};

export type SalesPlanPayload = {
  month: string;
  company_target: number;
  notes: string | null;
  locked_at: string | null;
  admin_unlocked: boolean;
  created_by: string | null;
  updated_at: string | null;
  managers: SalesPlanManagerRow[];
  editable: boolean;
  edit_reason: "window" | "admin_override" | "unlocked" | "locked";
  seeded_default: boolean;
  drift: ReturnType<typeof sumManagersDriftWarning>;
  /** Fact for the month from analytics_overview (contract_value). */
  fact_contract_value: number | null;
  fact_label: string;
};

async function userRoles(sb: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

export function isPlanAdmin(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("director");
}

export function canWritePlan(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("director") || roles.includes("finance");
}

/** Активні менеджери: status=active + (продажі / manager role / усі з role_key). */
export async function listActiveManagers(sb: SupabaseClient): Promise<SalesPlanManagerRow[]> {
  const [{ data: access }, { data: profiles }] = await Promise.all([
    sb.from("user_access").select("user_id,role_key,status,department,position").eq("status", "active"),
    sb.from("profiles").select("user_id,display_name,email,department"),
  ]);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
  type Tagged = SalesPlanManagerRow & { salesHint: boolean };
  const tagged: Tagged[] = [];
  for (const a of access ?? []) {
    const pr: any = profileMap.get(a.user_id) ?? {};
    const dept = String(a.department ?? pr.department ?? "").toLowerCase();
    const role = String(a.role_key ?? "").toLowerCase();
    const salesHint =
      role.includes("manager") ||
      role.includes("sales") ||
      role === "owner" ||
      role === "ops_admin" ||
      dept.includes("продаж") ||
      dept.includes("sales") ||
      dept.includes("комерц");
    tagged.push({
      user_id: a.user_id,
      display_name: pr.display_name ?? pr.email ?? null,
      email: pr.email ?? null,
      department: a.department ?? pr.department ?? null,
      role_key: a.role_key,
      target: 0,
      salesHint,
    });
  }
  const salesOnly = tagged.filter((r) => r.salesHint);
  const picked = salesOnly.length > 0 ? salesOnly : tagged;
  return picked
    .map(({ salesHint: _s, ...rest }) => rest)
    .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "uk"));
}

async function monthFact(sb: SupabaseClient, month: string): Promise<number | null> {
  const from = monthStart(month);
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${from.slice(0, 7)}-${String(last).padStart(2, "0")}`;
  const { data, error } = await sb.rpc("analytics_overview", { p_from: from, p_to: to });
  if (error) return null;
  const v = (data as any)?.kpi?.contract_value;
  return v == null ? null : Number(v);
}

export async function listPlanOp(
  sb: SupabaseClient,
  userId: string,
  monthRaw: string,
): Promise<SalesPlanPayload> {
  const month = monthStart(monthRaw);
  const roles = await userRoles(sb, userId);
  const adminOverride = roles.includes("admin"); // owner maps to admin via dual RBAC

  const [{ data: plan }, { data: lines }, managers] = await Promise.all([
    sb.from("sales_plan_months" as any).select("*").eq("month", month).maybeSingle(),
    sb.from("sales_plan_managers" as any).select("user_id,target").eq("month", month),
    listActiveManagers(sb),
  ]);

  const lineMap = new Map((lines ?? []).map((l: any) => [l.user_id, Number(l.target) || 0]));
  const managerRows = managers.map((m) => ({
    ...m,
    target: lineMap.has(m.user_id) ? (lineMap.get(m.user_id) as number) : m.target,
  }));
  // Include orphan lines (managers removed from active list but still have targets)
  for (const [uid, target] of lineMap) {
    if (!managerRows.some((m) => m.user_id === uid)) {
      managerRows.push({
        user_id: uid,
        display_name: null,
        email: null,
        department: null,
        role_key: null,
        target,
      });
    }
  }

  const seeded = !plan;
  const company_target = plan ? Number((plan as any).company_target) || 0 : DEFAULT_COMPANY_SALES_TARGET;
  const admin_unlocked = Boolean((plan as any)?.admin_unlocked);
  const gate = canEditSalesPlan({
    planMonth: month,
    todayKyiv: kyivToday(),
    isAdminOverride: adminOverride,
    adminUnlocked: admin_unlocked,
  });
  const editable = gate.editable && canWritePlan(roles);
  const drift = sumManagersDriftWarning(company_target, managerRows);
  const fact = await monthFact(sb, month);

  return {
    month,
    company_target,
    notes: (plan as any)?.notes ?? null,
    locked_at: (plan as any)?.locked_at ?? null,
    admin_unlocked,
    created_by: (plan as any)?.created_by ?? null,
    updated_at: (plan as any)?.updated_at ?? null,
    managers: managerRows,
    editable,
    edit_reason: gate.reason,
    seeded_default: seeded,
    drift,
    fact_contract_value: fact,
    fact_label:
      "Факт MVP = sum(orders.amount_total) де commercial_status ∈ {contract, awaiting_prepayment, sold} за місяць (analytics_overview.contract_value). Не Finmap.",
  };
}

export async function upsertCompanyTargetOp(
  sb: SupabaseClient,
  userId: string,
  input: { month: string; company_target: number; notes?: string | null },
): Promise<{ ok: true; warning: string | null; plan: SalesPlanPayload }> {
  const roles = await userRoles(sb, userId);
  if (!canWritePlan(roles)) throw new Error("Немає права редагувати план продажів");
  const month = monthStart(input.month);
  const existing = await listPlanOp(sb, userId, month);
  if (!existing.editable) {
    throw new Error(
      existing.edit_reason === "locked"
        ? "План закритий: редагування лише з 1 по 5 число місяця (або unlock адміном)."
        : "План недоступний для редагування",
    );
  }
  const company_target = Math.max(0, Number(input.company_target) || 0);
  const row = {
    month,
    company_target,
    notes: input.notes ?? existing.notes,
    updated_at: new Date().toISOString(),
    created_by: existing.created_by ?? userId,
    locked_at: existing.locked_at,
    admin_unlocked: existing.admin_unlocked,
  };
  const { error } = await sb.from("sales_plan_months" as any).upsert(row, { onConflict: "month" });
  if (error) throw new Error(error.message);

  // Explicit legacy mirror (trigger also writes; keep idempotent)
  await sb.from("analytics_targets").upsert(
    { month, metric: SALES_COMPANY_METRIC, target: company_target, updated_at: new Date().toISOString() },
    { onConflict: "month,metric" },
  );

  const plan = await listPlanOp(sb, userId, month);
  return { ok: true, warning: plan.drift.message, plan };
}

export async function upsertManagerTargetsOp(
  sb: SupabaseClient,
  userId: string,
  input: { month: string; lines: Array<{ user_id: string; target: number }> },
): Promise<{ ok: true; warning: string | null; plan: SalesPlanPayload }> {
  const roles = await userRoles(sb, userId);
  if (!canWritePlan(roles)) throw new Error("Немає права редагувати план продажів");
  const month = monthStart(input.month);
  const existing = await listPlanOp(sb, userId, month);
  if (!existing.editable) {
    throw new Error(
      existing.edit_reason === "locked"
        ? "План закритий: редагування лише з 1 по 5 число місяця (або unlock адміном)."
        : "План недоступний для редагування",
    );
  }
  // Ensure month row exists
  if (existing.seeded_default) {
    const { error: e0 } = await sb.from("sales_plan_months" as any).upsert(
      {
        month,
        company_target: existing.company_target,
        notes: existing.notes,
        created_by: userId,
        updated_at: new Date().toISOString(),
        admin_unlocked: false,
      },
      { onConflict: "month" },
    );
    if (e0) throw new Error(e0.message);
  }

  const lines = input.lines.map((l) => ({
    month,
    user_id: l.user_id,
    target: Math.max(0, Number(l.target) || 0),
    updated_at: new Date().toISOString(),
  }));
  if (lines.length) {
    const { error } = await sb.from("sales_plan_managers" as any).upsert(lines, { onConflict: "month,user_id" });
    if (error) throw new Error(error.message);
  }

  // Mirror per-manager into analytics_targets
  for (const l of lines) {
    await sb.from("analytics_targets").upsert(
      {
        month,
        metric: managerMetricKey(l.user_id),
        target: l.target,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "month,metric" },
    );
  }

  const plan = await listPlanOp(sb, userId, month);
  return { ok: true, warning: plan.drift.message, plan };
}

export async function setSalesPlanUnlockOp(
  sb: SupabaseClient,
  userId: string,
  input: { month: string; unlocked: boolean },
): Promise<{ ok: true; plan: SalesPlanPayload }> {
  const roles = await userRoles(sb, userId);
  if (!roles.includes("admin")) throw new Error("Unlock доступний лише адміну / власнику");
  const month = monthStart(input.month);
  const existing = await listPlanOp(sb, userId, month);
  const { error } = await sb.from("sales_plan_months" as any).upsert(
    {
      month,
      company_target: existing.company_target,
      notes: existing.notes,
      created_by: existing.created_by ?? userId,
      updated_at: new Date().toISOString(),
      admin_unlocked: input.unlocked,
      locked_at: input.unlocked ? null : new Date().toISOString(),
    },
    { onConflict: "month" },
  );
  if (error) throw new Error(error.message);
  return { ok: true, plan: await listPlanOp(sb, userId, month) };
}
