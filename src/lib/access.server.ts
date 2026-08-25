/**
 * Серверна логіка модуля «Доступи і ролі».
 * Усі перевірки прав виконуються тут (не на frontend) — приховані кнопки не є захистом.
 */
import { getRequest } from "@tanstack/react-start/server";

export type { AccessScope, AccessStatus } from "./access-constants";
export { ACCESS_MODULES, ACCESS_ACTIONS, SCOPE_LABELS, STATUS_LABELS } from "./access-constants";
import type { AccessScope, AccessStatus } from "./access-constants";
void (0 as unknown as AccessScope | AccessStatus);

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type Actor = {
  userId: string;
  name: string | null;
  roleKey: string | null;
  isOwner: boolean;
  canManage: boolean;
};

/** Читає доступ користувача службовим клієнтом (RLS не заважає перевірці). */
export async function loadActor(userId: string): Promise<Actor> {
  const db = await admin();
  const [{ data: access }, { data: profile }, { data: legacyRoles }] = await Promise.all([
    db.from("user_access").select("role_key,status,access_expires_at").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const legacy = (legacyRoles ?? []).map((r: any) => r.role as string);
  const legacyOwner = legacy.includes("admin") || legacy.includes("director");
  const roleKey = access?.role_key ?? (legacyOwner ? "owner" : null);
  const active = access ? access.status === "active" : legacyOwner;
  const isOwner = Boolean(active && (roleKey === "owner" || legacyOwner));
  return {
    userId,
    name: profile?.display_name ?? null,
    roleKey,
    isOwner,
    canManage: isOwner || Boolean(active && roleKey === "ops_admin"),
  };
}

export async function requireAccessManager(userId: string): Promise<Actor> {
  const actor = await loadActor(userId);
  if (!actor.canManage) throw new Error("Доступ лише для власника або операційного адміністратора");
  return actor;
}

export async function requireOwner(userId: string): Promise<Actor> {
  const actor = await loadActor(userId);
  if (!actor.isOwner) throw new Error("Дію може виконати лише власник системи");
  return actor;
}

/** Серверна перевірка конкретного права (модуль + дія). */
export async function requirePermission(userId: string, module: string, action: string): Promise<Actor> {
  const actor = await loadActor(userId);
  if (actor.isOwner) return actor;
  const db = await admin();
  const { data: access } = await db
    .from("user_access")
    .select("role_key,status,access_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!access || access.status !== "active") throw new Error("Акаунт не активний");
  if (access.access_expires_at && new Date(access.access_expires_at) < new Date()) {
    throw new Error("Термін тимчасового доступу завершився");
  }
  const { data: override } = await db
    .from("user_permission_overrides")
    .select("effect,expires_at")
    .eq("user_id", userId)
    .eq("module", module)
    .eq("action", action)
    .maybeSingle();
  if (override && (!override.expires_at || new Date(override.expires_at) > new Date())) {
    if (override.effect === "deny") throw new Error("Дію заборонено індивідуальним обмеженням");
    return actor;
  }
  const { data: rp } = await db
    .from("role_permissions")
    .select("allowed")
    .eq("role_key", access.role_key ?? "")
    .eq("module", module)
    .eq("action", action)
    .maybeSingle();
  if (!rp?.allowed) throw new Error("Недостатньо прав для цієї дії");
  return actor;
}

export type AuditEntry = {
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  clientId?: string | null;
  orderId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  financialImpact?: number | null;
  isCritical?: boolean;
};

function requestMeta() {
  try {
    const req = getRequest();
    const h = req?.headers;
    return {
      device: h?.get("user-agent") ?? null,
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("cf-connecting-ip") ?? null,
    };
  } catch {
    return { device: null, ip: null };
  }
}

export async function writeAudit(actor: Actor, entry: AuditEntry) {
  const db = await admin();
  const meta = requestMeta();
  await db.from("audit_logs").insert({
    actor_id: actor.userId,
    actor_name: actor.name,
    actor_role: actor.roleKey,
    module: entry.module,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    entity_label: entry.entityLabel ?? null,
    client_id: entry.clientId ?? null,
    order_id: entry.orderId ?? null,
    old_value: (entry.oldValue ?? null) as any,
    new_value: (entry.newValue ?? null) as any,
    reason: entry.reason ?? null,
    financial_impact: entry.financialImpact ?? null,
    is_critical: entry.isCritical ?? false,
    device: meta.device,
    ip_address: meta.ip,
    auth_method: null,
  });
}

/** Одноразовий токен запрошення: у базі зберігаємо лише хеш. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(`terzi:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Право бачити внутрішні ціни (собівартість, маржа, прибуток).
 * Дозволено: власник, ролі admin/director/finance (legacy `user_roles`),
 * роль доступу owner/ops_admin/finance або granular-право finance:view.
 * Індивідуальний deny-override перекриває все.
 */
export async function canViewInternalPrices(userId: string): Promise<boolean> {
  const db = await admin();
  const { data: override } = await db
    .from("user_permission_overrides")
    .select("effect,expires_at")
    .eq("user_id", userId)
    .eq("module", "finance")
    .eq("action", "view")
    .maybeSingle();
  const overrideActive = override && (!override.expires_at || new Date(override.expires_at) > new Date());
  if (overrideActive && override!.effect === "deny") return false;
  if (overrideActive && override!.effect === "allow") return true;

  const actor = await loadActor(userId);
  if (actor.isOwner) return true;

  const { data: legacyRoles } = await db.from("user_roles").select("role").eq("user_id", userId);
  const legacy = (legacyRoles ?? []).map((r: { role: string }) => r.role);
  if (legacy.includes("admin") || legacy.includes("director") || legacy.includes("finance")) return true;

  const { data: access } = await db
    .from("user_access")
    .select("role_key,status,access_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!access || access.status !== "active") return false;
  if (access.access_expires_at && new Date(access.access_expires_at) < new Date()) return false;
  if (["owner", "ops_admin", "finance"].includes(access.role_key ?? "")) return true;

  const { data: rp } = await db
    .from("role_permissions")
    .select("allowed")
    .eq("role_key", access.role_key ?? "")
    .eq("module", "finance")
    .eq("action", "view")
    .maybeSingle();
  return rp?.allowed === true;
}
