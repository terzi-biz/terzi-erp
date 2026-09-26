/**
 * Наскрізна економіка маркетингу: канал/кампанія → ліди → замовлення → GP.
 *
 * Чистий детермінований модуль. Нових фінансових формул не вводить:
 * виручка й собівартість приходять уже агрегованими з Finance Core
 * (фактичні рухи Finmap, прив'язані до `orders`).
 *
 * Дві бази окупності:
 *   ROMI(виручка) = (Revenue − Spend) / Spend × 100
 *   ROMI(GP)      = (GP − Spend) / Spend × 100
 *
 * Два часові режими задаються на рівні вибірки даних (див. economics.functions.ts):
 *   cohort — ліди періоду з усіма їх подальшими грошима;
 *   cash   — гроші періоду, розкручені назад до каналу.
 *
 * Якщо підтверджених даних немає — повертається null («немає даних»),
 * ніколи 0 і ніколи прогноз.
 */

export const ROMI_BASES = ["revenue", "gross_profit"] as const;
export type RomiBasis = (typeof ROMI_BASES)[number];

export const TIMING_MODES = ["cohort", "cash"] as const;
export type TimingMode = (typeof TIMING_MODES)[number];

export const TIMING_LABELS: Record<TimingMode, string> = {
  cohort: "Когорта (за датою заявки)",
  cash: "Каса (за датою грошей)",
};

export const ROMI_LABELS: Record<RomiBasis, string> = {
  revenue: "ROMI від виручки",
  gross_profit: "ROMI від валового прибутку",
};

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const div = (a: number, b: number): number | null => (b > 0 ? r2(a / b) : null);

/** Сирий зріз одного каналу/кампанії. */
export type EconomySlice = {
  key: string;
  label: string;
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  qualified: number;
  measurements: number;
  contracts: number;
  /** Замовлень із хоча б однією підтвердженою операцією. */
  ordersWithMoney: number;
  /** Фактична виручка (надходження Finmap по замовленнях зрізу). */
  revenue: number;
  /** Фактична пряма собівартість (витрати Finmap по тих самих замовленнях). */
  directCost: number;
};

export type EconomyRow = EconomySlice & {
  ctr: number | null;
  cpc: number | null;
  cpl: number | null;
  cpql: number | null;
  cpMeasurement: number | null;
  cac: number | null;
  /** null — підтверджених надходжень немає. */
  revenueFact: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  romiRevenue: number | null;
  romiGross: number | null;
};

/** ROMI від довільної бази. null, якщо витрат немає — ділити немає на що. */
export function romiOf(base: number | null, spend: number): number | null {
  if (base === null || spend <= 0) return null;
  return r2(((base - spend) / spend) * 100);
}

export function buildEconomyRow(s: EconomySlice): EconomyRow {
  const hasMoney = s.ordersWithMoney > 0 && (s.revenue !== 0 || s.directCost !== 0);
  const revenue = hasMoney ? r2(s.revenue) : null;
  const gp = revenue === null ? null : r2(revenue - s.directCost);
  return {
    ...s,
    spend: r2(s.spend),
    directCost: r2(s.directCost),
    ctr: s.impressions > 0 ? r2((s.clicks / s.impressions) * 100) : null,
    cpc: div(s.spend, s.clicks),
    cpl: div(s.spend, s.leads),
    cpql: div(s.spend, s.qualified),
    cpMeasurement: div(s.spend, s.measurements),
    cac: div(s.spend, s.contracts),
    revenueFact: revenue,
    grossProfit: gp,
    grossMargin: revenue && revenue > 0 && gp !== null ? r2((gp / revenue) * 100) : null,
    romiRevenue: romiOf(revenue, s.spend),
    romiGross: romiOf(gp, s.spend),
  };
}

export function buildEconomyRows(slices: EconomySlice[]): EconomyRow[] {
  return slices.map(buildEconomyRow).sort((a, b) => b.spend - a.spend || b.leads - a.leads);
}

/** Підсумок по всіх зрізах — рахується з сирих значень, а не з похідних. */
export function totalEconomy(slices: EconomySlice[], label = "Разом"): EconomyRow {
  const acc: EconomySlice = {
    key: "__total__", label,
    spend: 0, clicks: 0, impressions: 0, leads: 0, qualified: 0,
    measurements: 0, contracts: 0, ordersWithMoney: 0, revenue: 0, directCost: 0,
  };
  for (const s of slices) {
    acc.spend += s.spend; acc.clicks += s.clicks; acc.impressions += s.impressions;
    acc.leads += s.leads; acc.qualified += s.qualified;
    acc.measurements += s.measurements; acc.contracts += s.contracts;
    acc.ordersWithMoney += s.ordersWithMoney; acc.revenue += s.revenue; acc.directCost += s.directCost;
  }
  return buildEconomyRow(acc);
}
