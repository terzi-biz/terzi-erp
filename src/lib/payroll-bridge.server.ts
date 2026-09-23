import { admin, canViewInternalPrices, loadActor } from "./access.server";
import { sha256Hex } from "./integrations/signature.server";
import {
  PAYROLL_ORDERS_ENDPOINT, PAYROLL_SITE_ORIGIN, buildPayrollOrder, signPayrollToken, type PayrollScope,
} from "./payroll-bridge";

function secret(): string | null {
  const s = process.env["PAYROLL_BRIDGE_SECRET"];
  return s && s.length >= 16 ? s : null;
}

export function bridgeConfigured() { return secret() !== null; }

export async function requirePayrollAccess(userId: string) {
  if (!(await canViewInternalPrices(userId))) throw new Error("Доступ лише для власника або фінансової ролі");
  return loadActor(userId);
}

export async function issueOpenUrl(userId: string) {
  const actor = await requirePayrollAccess(userId);
  const s = secret();
  if (!s) return { ok: false as const, reason: "Потрібне налаштування серверного секрету PAYROLL_BRIDGE_SECRET" };
  const db = await admin();
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
  const isFinAdmin = actor.isOwner || actor.roleKey === "finance" || (roles ?? []).some((r: any) => ["admin", "finance"].includes(r.role));
  const scopes: PayrollScope[] = ["payroll:read", "payroll:write", ...(isFinAdmin ? ["payroll:admin" as const] : [])];
  const { token, exp } = await signPayrollToken(s, userId, scopes);
  return { ok: true as const, url: `${PAYROLL_SITE_ORIGIN}/#erp_token=${token}`, exp, scopes };
}

async function loadSource(orderId: string) {
  const db = await admin();
  const [{ data: order }, { data: meas }, { data: est }, { data: booking }] = await Promise.all([
    db.from("orders").select("id,name,planned_start,ordered_at,production_status,financial_status").eq("id", orderId).maybeSingle(),
    db.from("order_measurements").select("id,lead_id,area,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("estimates").select("id,total_client,total_cost,area,approved_at").eq("order_id", orderId).not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("crew_bookings").select("date,brigade_key").eq("order_id", orderId).order("date", { ascending: true }).limit(1).maybeSingle(),
  ]);
  return { order, meas, est, booking };
}

async function log(orderId: string, trigger: string, status: "sent" | "error" | "skipped", extra: { http?: number; message?: string; hash?: string; actor?: string | null }) {
  const db = await admin();
  await db.from("payroll_sync_log").insert({
    order_id: orderId, trigger, status, http_status: extra.http ?? null,
    message: extra.message?.slice(0, 500) ?? null, payload_hash: extra.hash ?? null, actor_id: extra.actor ?? null,
  });
}

/** Передає один об'єкт у Payroll KPI. Ніколи не кидає — помилки лише логуються (без токена). */
export async function syncOrderToPayroll(orderId: string | null | undefined, trigger: string, actorId: string | null) {
  if (!orderId) return { status: "skipped" as const, message: "Немає об'єкта" };
  try {
    const s = secret();
    if (!s) return { status: "skipped" as const, message: "Секрет не налаштовано" };
    const { order, meas, est, booking } = await loadSource(orderId);
    if (!order) return { status: "skipped" as const, message: "Об'єкт не знайдено" };
    const built = buildPayrollOrder({ order: order as any, measurement: meas as any, approvedEstimate: est as any, booking: booking as any });
    if ("skip" in built) { await log(orderId, trigger, "skipped", { message: built.skip, actor: actorId }); return { status: "skipped" as const, message: built.skip }; }
    const body = JSON.stringify({ orders: [built.dto] });
    const hash = await sha256Hex(body);
    const { token } = await signPayrollToken(s, actorId ?? "system", ["payroll:sync"]);
    const res = await fetch(PAYROLL_ORDERS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": `${orderId}:${hash.slice(0, 16)}` },
      body, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).replace(/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g, "[token]");
      const message = `HTTP ${res.status}: ${text.slice(0, 300)}`;
      await log(orderId, trigger, "error", { http: res.status, message, hash, actor: actorId });
      return { status: "error" as const, message };
    }
    await log(orderId, trigger, "sent", { http: res.status, hash, actor: actorId });
    return { status: "sent" as const, message: "Надіслано" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Невідома помилка";
    await log(orderId, trigger, "error", { message, actor: actorId }).catch(() => {});
    return { status: "error" as const, message };
  }
}

export async function bridgeStatus(userId: string) {
  await requirePayrollAccess(userId);
  const db = await admin();
  const [{ data: lastSent }, { data: lastError }, { data: recent }] = await Promise.all([
    db.from("payroll_sync_log").select("created_at,order_id").eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payroll_sync_log").select("created_at,order_id,message,http_status").eq("status", "error").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payroll_sync_log").select("id,created_at,order_id,trigger,status,http_status,message,orders:order_id(name,number)").order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    configured: bridgeConfigured(), siteUrl: PAYROLL_SITE_ORIGIN, endpoint: PAYROLL_ORDERS_ENDPOINT,
    lastSent: lastSent ?? null, lastError: lastError ?? null, recent: (recent ?? []) as any[],
  };
}
