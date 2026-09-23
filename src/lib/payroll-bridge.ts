/**
 * Міст ERP → TERZI Payroll KPI. Чисті (детерміновані) функції:
 * підпис токена HMAC-SHA256 і побудова DTO замовлення. Без секретів і мережі.
 */
import { payrollWorkItems as payrollWorkItemsFn } from "./brigade-economics";
export const PAYROLL_SITE_ORIGIN = "https://terzi-payroll-kpi.terzi-deals.chatgpt.site";
export const PAYROLL_ORDERS_ENDPOINT = `${PAYROLL_SITE_ORIGIN}/api/erp/orders`;
export const PAYROLL_CATALOG_ENDPOINT = `${PAYROLL_SITE_ORIGIN}/api/erp/catalog`;
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
  general_1: "demo_students",
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
  approvedEstimate?: { id: string; total_client: number | null; total_cost: number | null; area: number | null; internal_lines?: unknown } | null;
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

/**
 * Інші прямі витрати плану БЕЗ праці — лише якщо склад кошторису повний і узгоджений:
 * кожна cost відома, сума всіх рядків = total_cost (допуск округлення). Інакше undefined (omit).
 */
export function planOtherDirectCostsFrom(lines: unknown, totalCost: unknown): number | undefined {
  if (!Array.isArray(lines) || lines.length === 0) return undefined;
  const tc = typeof totalCost === "number" ? totalCost : typeof totalCost === "string" ? Number(totalCost) : NaN;
  if (!Number.isFinite(tc) || tc <= 0) return undefined;
  let all = 0, other = 0, labor = 0;
  for (const l of lines as any[]) {
    if (!l || typeof l !== "object" || typeof l.block !== "string" || !l.block) return undefined;
    const c = typeof l.cost === "number" ? l.cost : typeof l.cost === "string" && l.cost.trim() !== "" ? Number(l.cost) : NaN;
    if (!Number.isFinite(c) || c < 0) return undefined;
    all += c;
    if (l.block === "works") labor += c; else other += c;
  }
  if (labor <= 0) return undefined; // без трудових рядків розділення не доведене
  if (Math.abs(all - tc) > Math.max(1, tc * 0.0005)) return undefined;
  return Math.round(other * 100) / 100;
}

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
    const planRows = src.volumes.filter((v) => !v.voided && v.kind === "plan");
    const ids = src.payrollIds ?? PAYROLL_BRIGADE_MAP;
    const planFullyMapped = planRows.length > 0 && planRows.every((v) => !!ids[v.brigade_key] && v.quantity > 0);
    if (planFullyMapped && dto.planDirectCosts !== undefined) {
      const other = planOtherDirectCostsFrom(est?.internal_lines, est?.total_cost);
      if (other !== undefined) dto.planOtherDirectCosts = other;
    }
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
    if (dto.planDirectCosts !== undefined) {
      const other = planOtherDirectCostsFrom(est?.internal_lines, est?.total_cost);
      if (other !== undefined) dto.planOtherDirectCosts = other;
    }
    workNote = `${WORK_NOT_SENT}: виконання не підтверджене актом (передано лише план)`;
  }
  // workItems і фактичні фінполя (revenue/materials/subcontract/other/equipment/logistics)
  // не передаються: в ERP немає підтверджених актів/обсягів. planDirectCosts = total_cost
  // кошторису як є (вже включає працю); planOtherDirectCosts — лише при повному узгодженому складі.
  if (order.production_status === "handed_over" || order.production_status === "warranty") dto.closed = true;
  if (order.financial_status === "paid" || order.financial_status === "financially_closed") dto.paid = true;
  return { dto, workNote };
}

export type SiteLine = { brigadeId: string; serviceCode: string; quantity: number | null; unit: string | null; amount: number | null };
export type SiteSummary = {
  revision: string | null; updatedAt: string | null; month: string | null; brigadeIds: string[];
  planRevenue: number | null; planDirectCosts: number | null; planCrew: number | null; planGross: number | null; planMargin: number | null;
  revenue: number | null; directCosts: number | null; crewFact: number | null; gross: number | null; margin: number | null;
  variance: number | null; crewPaid: number | null;
  verified: boolean; closed: boolean; act: boolean; paid: boolean;
  planLines: SiteLine[]; factLines: SiteLine[];
};
export type SiteOverview = {
  revision: string | null; updatedAt: string | null; month: string;
  staffCount: number | null; staffApproved: number | null; staffApprovedDue: number | null;
  crewAccrued: number | null; crewPaid: number | null; crewDue: number | null; ordersCount: number | null;
};
const sNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sStr = (v: unknown) => (typeof v === "string" && v ? v : null);
function lines(v: unknown): SiteLine[] {
  return Array.isArray(v) ? v.filter((l) => l && typeof l === "object").map((l: any) => ({
    brigadeId: String(l.brigadeId ?? ""), serviceCode: String(l.serviceCode ?? ""),
    quantity: sNum(l.quantity), unit: sStr(l.unit), amount: sNum(l.amount),
  })) : [];
}
/** Невідоме/некоректне число → null (не 0). Прапорці — лише явне true. Підтримує {order:{...}} і пласку форму. */
export function parseSiteSummary(raw: unknown): SiteSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const o = (r.order && typeof r.order === "object" ? r.order : r.summary && typeof r.summary === "object" ? r.summary : r) as Record<string, any>;
  const keys = ["planCrew", "crewFact", "planGross", "gross", "planMargin", "margin", "planRevenue", "revenue"];
  if (!keys.some((k) => k in o) && !("verified" in o)) return null;
  return {
    revision: r.revision != null ? String(r.revision) : null, updatedAt: sStr(r.updatedAt), month: sStr(o.month),
    brigadeIds: Array.isArray(o.brigadeIds) ? o.brigadeIds.map(String) : [],
    planRevenue: sNum(o.planRevenue), planDirectCosts: sNum(o.planDirectCosts), planCrew: sNum(o.planCrew), planGross: sNum(o.planGross), planMargin: sNum(o.planMargin),
    revenue: sNum(o.revenue), directCosts: sNum(o.directCosts), crewFact: sNum(o.crewFact), gross: sNum(o.gross), margin: sNum(o.margin),
    variance: sNum(o.variance), crewPaid: sNum(o.crewPaid),
    verified: o.verified === true, closed: o.closed === true, act: o.act === true, paid: o.paid === true,
    planLines: lines(o.planLines), factLines: lines(o.factLines),
  };
}
export function parseSiteOverview(raw: unknown): SiteOverview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any; const o = r.overview;
  if (!o || typeof o !== "object" || typeof o.month !== "string") return null;
  return {
    revision: r.revision != null ? String(r.revision) : null, updatedAt: sStr(r.updatedAt), month: o.month,
    staffCount: sNum(o.staffCount), staffApproved: sNum(o.staffApproved), staffApprovedDue: sNum(o.staffApprovedDue),
    crewAccrued: sNum(o.crewAccrued), crewPaid: sNum(o.crewPaid), crewDue: sNum(o.crewDue), ordersCount: sNum(o.ordersCount),
  };
}

export type SiteRate = { code: string; label: string; unit: string | null; rate: number | null; clientRate: number | null; pricing: string | null; minimum: number | null };
export type SiteBrigade = { id: string; name: string; kind: string | null; active: boolean; headcount: number | null; rates: SiteRate[] };
export type SiteCatalog = { revision: string | null; updatedAt: string | null; brigades: SiteBrigade[] };
/** Каталог бригад відомості. Некоректні записи відкидаються; невідомі числа → null. */
export function parseSiteCatalog(raw: unknown): SiteCatalog | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).brigades)) return null;
  const r = raw as any;
  const brigades: SiteBrigade[] = r.brigades
    .filter((b: any) => b && typeof b.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.id))
    .map((b: any) => ({
      id: b.id, name: sStr(b.name) ?? b.id, kind: sStr(b.kind), active: b.active === true, headcount: sNum(b.headcount),
      rates: Array.isArray(b.rates) ? b.rates.filter((x: any) => x && typeof x.code === "string").map((x: any) => ({
        code: x.code, label: sStr(x.label) ?? x.code, unit: sStr(x.unit), rate: sNum(x.rate), clientRate: sNum(x.clientRate), pricing: sStr(x.pricing), minimum: sNum(x.minimum),
      })) : [],
    }));
  return { revision: r.revision != null ? String(r.revision) : null, updatedAt: sStr(r.updatedAt), brigades };
}
/** ERP-ключ для бригади з каталогу: існуючий алias, або безпечний slug з id. */
export function erpKeyForSiteId(id: string): string {
  const alias = Object.entries(PAYROLL_BRIGADE_MAP).find(([, v]) => v === id)?.[0];
  if (alias) return alias;
  const slug = id.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "");
  return ("p_" + slug).slice(0, 47);
}
/** Зіставлення локальної бригади з каталогом: payroll_id, потім канонічний алias. Інших збігів немає. */
export function matchSiteId(local: { key: string; payroll_id: string | null }, ids: Set<string>): string | null {
  if (local.payroll_id && ids.has(local.payroll_id)) return local.payroll_id;
  const a = PAYROLL_BRIGADE_MAP[local.key];
  return a && ids.has(a) ? a : null;
}
