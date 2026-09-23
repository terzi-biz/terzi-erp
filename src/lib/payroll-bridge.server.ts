import { admin, loadActor } from "./access.server";
import { sha256Hex } from "./integrations/signature.server";
import {
  PAYROLL_ORDERS_ENDPOINT, PAYROLL_SUMMARY_ENDPOINT, PAYROLL_SITE_ORIGIN, buildPayrollOrder, isValidBridgeSecret, signPayrollToken, type PayrollScope,
} from "./payroll-bridge";

function secret(): string | null {
  const s = process.env["PAYROLL_BRIDGE_SECRET"];
  return isValidBridgeSecret(s) ? s : null;
}

export function bridgeConfigured() { return secret() !== null; }

const PAYROLL_ROLE_KEYS = ["owner", "admin", "director", "finance"];
const PAYROLL_LEGACY_ROLES = ["admin", "director", "finance"];

/** Строго: owner або роль admin/director/finance (user_access.role_key активний чи legacy user_roles). Без overrides і finance:view. */
export async function requirePayrollAccess(userId: string) {
  const actor = await loadActor(userId);
  if (actor.isOwner) return actor;
  const db = await admin();
  const [{ data: access }, { data: roles }] = await Promise.all([
    db.from("user_access").select("role_key,status,access_expires_at").eq("user_id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const accessOk = !!access && access.status === "active"
    && (!access.access_expires_at || new Date(access.access_expires_at) > new Date())
    && PAYROLL_ROLE_KEYS.includes(access.role_key ?? "");
  const legacyOk = (!access || access.status === "active") && (roles ?? []).some((r: any) => PAYROLL_LEGACY_ROLES.includes(r.role));
  if (!accessOk && !legacyOk) throw new Error("Доступ лише для власника або ролі admin/director/finance");
  return actor;
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
  const [{ data: order }, { data: meas }, { data: est }, { data: booking }, { data: volumes }, { data: brigades }] = await Promise.all([
    db.from("orders").select("id,name,planned_start,ordered_at,production_status,financial_status").eq("id", orderId).maybeSingle(),
    db.from("order_measurements").select("id,lead_id,area,status,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("estimates").select("id,total_client,total_cost,area,approved_at").eq("order_id", orderId).not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("crew_bookings").select("date,brigade_key").eq("order_id", orderId).order("date", { ascending: true }).limit(1).maybeSingle(),
    (db as any).from("order_work_volumes").select("id,brigade_key,service_code,kind,quantity,unit,source,period,confirmed,voided").eq("order_id", orderId),
    (db as any).from("brigades").select("key,payroll_id"),
  ]);
  const payrollIds = Object.fromEntries(((brigades ?? []) as any[]).map((b) => [b.key, b.payroll_id]));
  return { order, meas, est, booking, volumes: ((volumes ?? []) as any[]).map((v) => ({ ...v, quantity: Number(v.quantity) })), payrollIds };
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
    const { order, meas, est, booking, volumes, payrollIds } = await loadSource(orderId);
    if (!order) return { status: "skipped" as const, message: "Об'єкт не знайдено" };
    const built = buildPayrollOrder({ order: order as any, measurement: meas as any, approvedEstimate: est as any, booking: booking as any, volumes, payrollIds });
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
    const message = built.workNote ? `Надіслано. ${built.workNote}` : "Надіслано з обсягом робіт";
    await log(orderId, trigger, "sent", { http: res.status, hash, actor: actorId, message });
    return { status: "sent" as const, message };
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
  const { data: lastWork } = await db.from("payroll_sync_log").select("message").eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return {
    workNotSent: !!lastWork?.message?.includes("Обсяг роботи не передано"),
    configured: bridgeConfigured(), siteUrl: PAYROLL_SITE_ORIGIN, endpoint: PAYROLL_ORDERS_ENDPOINT,
    lastSent: lastSent ?? null, lastError: lastError ?? null, recent: (recent ?? []) as any[],
  };
}

async function siteGet(query: string, actorId: string) {
  const s = secret();
  if (!s) return { kind: "unconfigured" as const };
  const { token } = await signPayrollToken(s, actorId, ["payroll:sync"]);
  const res = await fetch(`${PAYROLL_SUMMARY_ENDPOINT}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000),
  });
  return { kind: "response" as const, res };
}
function httpReason(status: number, what: string) {
  if (status === 401 || status === 403) return `Відомість відмовила в доступі (HTTP ${status}) — перевірте спільний секрет і scope payroll:sync`;
  if (status === 404) return what;
  return `Відомість відповіла HTTP ${status}`;
}

/** Зведення відомості по об'єкту (GET /api/erp/summary?orderId). Токен — лише на сервері. */
export async function fetchSiteSummary(orderId: string, actorId: string) {
  try {
    const r = await siteGet(`orderId=${encodeURIComponent(orderId)}`, actorId);
    if (r.kind === "unconfigured") return { ok: false as const, code: "unconfigured" as const, reason: "Потрібне налаштування серверного секрету" };
    if (!r.res.ok) return { ok: false as const, code: r.res.status === 404 ? "not_synced" as const : "http" as const, status: r.res.status, reason: httpReason(r.res.status, "Об'єкт ще не синхронізовано з відомістю") };
    const { parseSiteSummary } = await import("./payroll-bridge");
    const parsed = parseSiteSummary(await r.res.json().catch(() => null));
    return parsed ? { ok: true as const, summary: parsed, fetchedAt: new Date().toISOString() } : { ok: false as const, code: "format" as const, reason: "Невідомий формат відповіді відомості" };
  } catch (e) {
    return { ok: false as const, code: "network" as const, reason: e instanceof Error ? e.message : "Помилка зв'язку" };
  }
}

/** Огляд місяця (GET /api/erp/summary?month=YYYY-MM). */
export async function fetchSiteOverview(month: string, actorId: string) {
  try {
    const r = await siteGet(`month=${encodeURIComponent(month)}`, actorId);
    if (r.kind === "unconfigured") return { ok: false as const, code: "unconfigured" as const, reason: "Потрібен серверний секрет" };
    if (!r.res.ok) return { ok: false as const, code: "http" as const, status: r.res.status, reason: httpReason(r.res.status, `У відомості немає даних за ${month}`) };
    const { parseSiteOverview } = await import("./payroll-bridge");
    const parsed = parseSiteOverview(await r.res.json().catch(() => null));
    return parsed ? { ok: true as const, overview: parsed } : { ok: false as const, code: "format" as const, reason: "Невідомий формат відповіді відомості" };
  } catch (e) {
    return { ok: false as const, code: "network" as const, reason: e instanceof Error ? e.message : "Помилка зв'язку" };
  }
}
