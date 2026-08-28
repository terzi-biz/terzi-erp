/**
 * Амортизація обладнання Calculation Core (Launch Contract §9).
 *
 * Заборонено: рекурсивне нарахування (амортизація на амортизацію) і нарахування
 * на податки. База клієнтської надбавки завжди НЕТТО і без самої амортизації.
 */

export type AmortMethod = "months" | "hours" | "shifts" | "m2" | "orders" | "fixed" | "manual";

export interface EquipmentAsset {
  key: string;
  name: string;
  /** Вартість придбання, грн. */
  purchaseCost: number;
  /** Ліквідаційна вартість, грн. */
  salvageValue: number;
  /** Ресурс у одиницях обраного методу (місяці, години, зміни, м², замовлення). */
  lifeUnits: number;
  /** Використаний ресурс. */
  usedUnits: number;
  /** Обслуговування й ремонт за весь строк, грн. */
  maintenanceCost: number;
  method: AmortMethod;
  /** Ручна або фіксована сума на замовлення, грн. */
  fixedPerOrder?: number;
}

/** Амортизована база: вартість − ліквідаційна + обслуговування. */
export function amortBase(a: EquipmentAsset): number {
  return Math.max(0, a.purchaseCost - a.salvageValue) + Math.max(0, a.maintenanceCost);
}

/** Вартість одиниці ресурсу (місяця, години, зміни, м², замовлення). */
export function amortPerUnit(a: EquipmentAsset): number {
  if (a.method === "fixed" || a.method === "manual") return Math.max(0, a.fixedPerOrder ?? 0);
  if (!(a.lifeUnits > 0)) return 0;
  return +(amortBase(a) / a.lifeUnits).toFixed(4);
}

/** Залишкова вартість активу. */
export function residualValue(a: EquipmentAsset): number {
  if (!(a.lifeUnits > 0)) return Math.max(0, a.purchaseCost - a.salvageValue);
  const used = Math.min(Math.max(0, a.usedUnits), a.lifeUnits);
  const depreciated = (amortBase(a) * used) / a.lifeUnits;
  return +Math.max(0, a.purchaseCost - depreciated).toFixed(2);
}

/** Амортизація, віднесена на конкретне замовлення. */
export function amortForOrder(a: EquipmentAsset, unitsOnOrder: number): number {
  if (a.method === "fixed" || a.method === "manual") return Math.max(0, a.fixedPerOrder ?? 0);
  return +Math.max(0, amortPerUnit(a) * Math.max(0, unitsOnOrder)).toFixed(2);
}

export type ClientAmortMode =
  | "included_in_works"
  | "separate_line"
  | "percent_of_works"
  | "percent_of_works_logistics"
  | "percent_of_net_total"
  | "per_m2"
  | "fixed";

export interface AmortSettings {
  /** Враховувати амортизацію в собівартості. Default ON. */
  includeInCost: boolean;
  /** Включати амортизацію в клієнтську ціну. Default OFF. */
  includeInClientPrice: boolean;
  clientMode: ClientAmortMode;
  /** Відсоток або ставка для обраного режиму. */
  clientValue: number;
}

export const DEFAULT_AMORT_SETTINGS: AmortSettings = {
  includeInCost: true,
  includeInClientPrice: false,
  clientMode: "separate_line",
  clientValue: 0,
};

export interface AmortClientBase {
  /** НЕТТО роботи (без податків і без амортизації). */
  worksNet: number;
  /** НЕТТО логістика. */
  logisticsNet: number;
  /** НЕТТО підсумок кошторису без податків і без амортизації. */
  netTotal: number;
  areaM2: number;
  /** Розрахована амортизація замовлення, грн. */
  amortCost: number;
}

/**
 * Сума амортизації, яку дозволено додати в клієнтську ціну.
 * База ніколи не містить податків і самої амортизації — це виключає рекурсію.
 */
export function clientAmortAmount(s: AmortSettings, b: AmortClientBase): number {
  if (!s.includeInClientPrice) return 0;
  const pct = Math.max(0, s.clientValue) / 100;
  switch (s.clientMode) {
    case "included_in_works":
    case "separate_line":
      return +Math.max(0, b.amortCost).toFixed(2);
    case "percent_of_works":
      return +Math.max(0, b.worksNet * pct).toFixed(2);
    case "percent_of_works_logistics":
      return +Math.max(0, (b.worksNet + b.logisticsNet) * pct).toFixed(2);
    case "percent_of_net_total":
      return +Math.max(0, b.netTotal * pct).toFixed(2);
    case "per_m2":
      return +Math.max(0, b.areaM2 * Math.max(0, s.clientValue)).toFixed(2);
    case "fixed":
      return +Math.max(0, s.clientValue).toFixed(2);
    default:
      return 0;
  }
}

/** Внутрішнє попередження, коли амортизацію вимкнено з собівартості. */
export function amortWarnings(s: AmortSettings, amortCost: number): string[] {
  const out: string[] = [];
  if (!s.includeInCost && amortCost > 0) {
    out.push(
      `Амортизацію вимкнено з собівартості (${amortCost.toFixed(2)} грн не враховано). Вибір збережено у знімку кошторису.`,
    );
  }
  if (s.includeInClientPrice && !s.includeInCost) {
    out.push("Амортизація включена в клієнтську ціну, але не в собівартість — перевірте налаштування.");
  }
  return out;
}
