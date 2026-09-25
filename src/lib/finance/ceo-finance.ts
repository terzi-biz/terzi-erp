/**
 * Фінансовий екран CEO — чисті агрегати поверх Finance Core.
 * Жодних нових формул: GP, накладні, операційний прибуток рахує waterfall.ts.
 * Грошовий рух (Finmap) ≠ нарахування; тут виручка об'єкта = фактичні
 * надходження, прив'язані до замовлення (так само, як у listOrdersFinance).
 */
import { objectEconomy, allocateProductionOverhead, companyWaterfall, type ObjectEconomy } from "./waterfall";

export const DIRECTIONS = [
  { key: "screed", label: "Стяжка" },
  { key: "roofing_pvc", label: "ПВХ-мембрана" },
  { key: "roofing_ruberoid", label: "Руберойд" },
  { key: "liquid_waterproofing", label: "Рідка гідроізоляція" },
  { key: "insulation", label: "Утеплення" },
  { key: "plaster", label: "Штукатурка" },
  { key: "demolition", label: "Демонтаж" },
  { key: "other", label: "Інші роботи" },
] as const;
export type DirectionKey = (typeof DIRECTIONS)[number]["key"];

/** Послуги замовлення → напрямок. Кілька різних послуг → «Інші роботи» (комплекс). */
export function directionOf(services: (string | null | undefined)[]): { key: DirectionKey; mixed: boolean; unknown: boolean } {
  const map: Record<string, DirectionKey> = {
    screed: "screed", roofing_pvc: "roofing_pvc", roofing_ruberoid: "roofing_ruberoid",
    insulation: "insulation", polybeton: "insulation", plaster: "plaster", demolition: "demolition",
    liquid_waterproofing: "liquid_waterproofing",
  };
  const keys = [...new Set(services.filter(Boolean).map((s) => map[String(s)] ?? "other"))];
  if (keys.length === 0) return { key: "other", mixed: false, unknown: true };
  if (keys.length > 1) return { key: "other", mixed: true, unknown: false };
  return { key: keys[0], mixed: false, unknown: false };
}

export type OrderFin = {
  orderId: string;
  direction: DirectionKey;
  planRevenue: number;
  planCost: number;
  factRevenue: number;
  factCost: number;
  active: boolean;
};

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export function buildCeoFinance(input: {
  period: string;
  orders: OrderFin[];
  commercial: number;
  overhead: number;
  taxes: number;
}) {
  const objects: ObjectEconomy[] = input.orders
    .filter((o) => o.factRevenue !== 0 || o.factCost !== 0)
    .map((o) => objectEconomy({ orderId: o.orderId, accrualRevenue: o.factRevenue, directCost: o.factCost, directionKey: o.direction }));

  const company = companyWaterfall({
    period: input.period, objects, roleVariable: 0,
    fixedOpex: input.overhead, mediaSpend: input.commercial, taxes: input.taxes,
  });

  // Операційний прибуток напрямку: GP мінус частка непрямих витрат пропорційно виручці.
  const indirect = input.overhead + input.commercial + input.taxes;
  const alloc = allocateProductionOverhead(objects.map((o) => ({ orderId: o.orderId, revenue: o.revenue })), indirect);

  const directions = DIRECTIONS.map((d) => {
    const objs = objects.filter((o) => o.directionKey === d.key);
    const revenue = r2(objs.reduce((s, o) => s + o.revenue, 0));
    const gp = r2(objs.reduce((s, o) => s + o.grossProfit, 0));
    const share = r2(objs.reduce((s, o) => s + (alloc.get(o.orderId) ?? 0), 0));
    return {
      key: d.key, label: d.label, objects: objs.length, revenue, grossProfit: gp,
      grossMargin: revenue > 0 ? r2((gp / revenue) * 100) : null,
      indirectShare: share,
      operatingProfit: objs.length ? r2(gp - share) : null,
    };
  });

  const active = input.orders.filter((o) => o.active);
  const withPlan = input.orders.filter((o) => o.planCost > 0);
  const production = {
    activeObjects: active.length,
    planRevenue: r2(active.reduce((s, o) => s + o.planRevenue, 0)),
    factRevenue: r2(active.reduce((s, o) => s + o.factRevenue, 0)),
    planCost: r2(active.reduce((s, o) => s + o.planCost, 0)),
    factCost: r2(active.reduce((s, o) => s + o.factCost, 0)),
    overrun: r2(withPlan.reduce((s, o) => s + Math.max(o.factCost - o.planCost, 0), 0)),
    overrunObjects: withPlan.filter((o) => o.factCost > o.planCost).length,
  };

  return { company, directions, production };
}
