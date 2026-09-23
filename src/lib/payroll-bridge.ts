/**
 * Міст ERP → TERZI Payroll KPI. Чисті (детерміновані) функції:
 * підпис токена HMAC-SHA256 і побудова DTO замовлення. Без секретів і мережі.
 */
import { payrollWorkItems as payrollWorkItemsFn } from "./brigade-economics";
export const PAYROLL_SITE_ORIGIN = "https://terzi-payroll-kpi.terzi-deals.chatgpt.site";
export const PAYROLL_ORDERS_ENDPOINT = `${PAYROLL_SITE_ORIGIN}/api/erp/orders`;
export const PAYROLL_SUMMARY_ENDPOINT = `${PAYROLL_SITE_ORIGIN}/api/erp/summary`;
export const PAYROLL_AUD = "terzi-payroll-kpi";
export const PAYROLL_ISS = "TERZI_ERP";
export const PAYROLL_TOKEN_TTL_SEC = 10 * 60;

export type PayrollScope = "payroll:read" | "payroll:write" | "payroll:admin" | "payroll:sync";

/** ERP brigade key → id приймача. Невідомі ключі не передаються. */
export const PAYROLL_BRIGADE_MAP: Record<string, string> = {
  screed_lesha: "crew-alex",
  screed_vitya: "screed_vitya",
  roofing_1: "roofing_1",
  roofing_2: "roofing_2",
  roofing_3: "roofing_3",
  roofing_4: "roofing_4",
};

export function mapBrigade(key: string | null | undefined): string | undefined {
  return key ? PAYROLL_BRIGADE_MAP[key] : undefined;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

export async function signPayrollToken(
  secret: string,
  sub: string,
  scopes: PayrollScope[],
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec: number = PAYROLL_TOKEN_TTL_SEC,
): Promise<{ token: string; exp: number }> {
  if (!secret) throw new Error("secret missing");
  const exp = nowSec + Math.min(Math.max(ttlSec, 300), 900);
  const payload = base64UrlJson({ aud: PAYROLL_AUD, iss: PAYROLL_ISS, sub, exp, scopes });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return { token: `${payload}.${b64url(sig)}`, exp };
}

export type PayrollOrderDTO = {
  orderId: string;
  month: string;
  name: string;
  leadId?: string;
  measurementId?: string;
  estimateId?: string;
  brigadeId?: string;
  planRevenue?: number;
  planDirectCosts?: number;
  planArea?: number;
  workDate?: string;
  /** Планові рядки (з кошторису/заміру) — лише при перевіреному маппінгу бригади. */
  planWorkItems?: { brigadeId: string; serviceCode: string; quantity: number }[];
  /** Тільки підтверджене виконання (акти/прийняті обсяги). Інакше — omit. */
  workItems?: { brigadeId: string; serviceCode: string; quantity: number }[];
  /** Планові прямі витрати БЕЗ фонду бригад — лише при відомому складі кошторису. */
  planOtherDirectCosts?: number;
  /** true лише разом із workItems з підтверджених ERP-рядків факту. */
  workVerified?: boolean;
  closed?: boolean;
  paid?: boolean;
};

/** Мінімальна довжина секрету в байтах (вимога приймача). */
export const PAYROLL_SECRET_MIN_BYTES = 32;
export function isValidBridgeSecret(s: string | null | undefined): s is string {
  return !!s && new TextEncoder().encode(s).length >= PAYROLL_SECRET_MIN_BYTES;
}
export const WORK_NOT_SENT = "Обсяг роботи не передано";

export type PayrollSource = {
  order: {
    id: string; name: string | null; planned_start: string | null; ordered_at: string | null;
    production_status: string | null; financial_status: string | null;
  };
  measurement?: { id: string; lead_id: string | null; area: number | null; status?: string | null } | null;
  /** Лише затверджений кошторис (approved_at != null) — план, не факт. */
  approvedEstimate?: { id: string; total_client: number | null; total_cost: number | null; area: number | null } | null;
  booking?: { date: string; brigade_key: string | null } | null;
  /** Обсяги робіт об'єкта з ERP (order_work_volumes). Якщо є — мають пріоритет. */
  volumes?: import("./brigade-economics").VolumeRow[];
  /** brigade_key → id бригади в приймачі (з довідника brigades). */
  payrollIds?: Record<string, string | null | undefined>;
};

const kyivMonth = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" })
    .format(new Date(iso)).slice(0, 7);

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v) > 0 ? Number(v) : undefined;

/** Будує DTO; повертає причину пропуску, якщо немає перевіреного місяця чи назви. */
export function buildPayrollOrder(src: PayrollSource): { dto: PayrollOrderDTO; workNote: string | null } | { skip: string } {
  const { order, measurement, approvedEstimate: est, booking } = src;
  const name = order.name?.trim();
  if (!name) return { skip: "Об'єкт без назви" };
  const dateSrc = booking?.date ?? order.planned_start ?? order.ordered_at;
  if (!dateSrc) return { skip: "Немає дати робіт / планового старту — місяць невідомий" };
  const dto: PayrollOrderDTO = { orderId: order.id, month: kyivMonth(dateSrc), name };
  if (measurement?.id) dto.measurementId = measurement.id;
  if (measurement?.lead_id) dto.leadId = measurement.lead_id;
  if (est?.id) {
    dto.estimateId = est.id;
    const r = num(est.total_client); if (r !== undefined) dto.planRevenue = r;
    const c = num(est.total_cost); if (c !== undefined) dto.planDirectCosts = c;
  }
  const area = num(est?.area) ?? num(measurement?.area);
  if (area !== undefined) dto.planArea = area;
  if (booking?.date) dto.workDate = booking.date.slice(0, 10);
  const fromDir = src.payrollIds && booking?.brigade_key ? src.payrollIds[booking.brigade_key] : undefined;
  const brigade = fromDir || mapBrigade(booking?.brigade_key);
  if (brigade) dto.brigadeId = brigade;
  // Завершений замір ≠ виконані роботи: з нього — лише planWorkItems.
  let workNote: string | null = null;
  if (src.volumes && src.volumes.some((v) => !v.voided)) {
    const w = payrollWorkItemsFn(src.volumes, src.payrollIds ?? PAYROLL_BRIGADE_MAP);
    if (w.plan.length) dto.planWorkItems = w.plan;
    if (w.fact.length) { dto.workItems = w.fact; dto.workVerified = true; }
    const notes: string[] = [];
    if (!w.fact.length) notes.push(`${WORK_NOT_SENT}: немає підтвердженого факту виконання`);
    if (w.skipped) notes.push(`пропущено рядків без зіставленої бригади: ${w.skipped}`);
    workNote = notes.length ? notes.join("; ") : null;
    if (order.production_status === "handed_over" || order.production_status === "warranty") dto.closed = true;
    if (order.financial_status === "paid" || order.financial_status === "financially_closed") dto.paid = true;
    return { dto, workNote };
  }
  const measArea = measurement && ["done", "completed"].includes(measurement.status ?? "") ? num(measurement.area) : undefined;
  const planArea = num(est?.area) ?? measArea;
  if (!brigade) workNote = `${WORK_NOT_SENT}: бригаду не призначено або не зіставлено`;
  else if (planArea === undefined) workNote = `${WORK_NOT_SENT}: немає достовірної площі кошторису/заміру`;
  else if (!booking?.brigade_key?.startsWith("screed_")) workNote = `${WORK_NOT_SENT}: для цього напрямку немає підтвердженого коду робіт`;
  else {
    dto.planWorkItems = [{ brigadeId: brigade, serviceCode: "screed_base", quantity: planArea }];
    workNote = `${WORK_NOT_SENT}: виконання не підтверджене актом (передано лише план)`;
  }
  // workItems і фактичні фінполя (revenue/materials/subcontract/other/equipment/logistics)
  // не передаються: в ERP немає підтверджених актів/обсягів. planDirectCosts = total_cost
  // кошторису як є (вже включає працю); planOtherDirectCosts не виділяється — склад невідомий.
  if (order.production_status === "handed_over" || order.production_status === "warranty") dto.closed = true;
  if (order.financial_status === "paid" || order.financial_status === "financially_closed") dto.paid = true;
  return { dto, workNote };
}

export type SiteSummary = {
  planCrew: number | null; crewFact: number | null; planGross: number | null; gross: number | null;
  planMargin: number | null; margin: number | null; verified: boolean; paid: boolean; closed: boolean;
};
/** Невідоме/некоректне число → null (не 0). Прапорці — лише явне true. */
export function parseSiteSummary(raw: unknown): SiteSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = ((raw as any).summary && typeof (raw as any).summary === "object" ? (raw as any).summary : raw) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const keys = ["planCrew", "crewFact", "planGross", "gross", "planMargin", "margin"] as const;
  if (!keys.some((k) => k in o) && !("verified" in o)) return null;
  return {
    planCrew: n(o.planCrew), crewFact: n(o.crewFact), planGross: n(o.planGross), gross: n(o.gross),
    planMargin: n(o.planMargin), margin: n(o.margin),
    verified: o.verified === true, paid: o.paid === true, closed: o.closed === true,
  };
}
