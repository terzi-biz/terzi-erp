/**
 * TERZI Calculation Core — єдиний канонічний результат розрахунку.
 *
 * Контракт: docs/ERP_LAUNCH_CONTRACT.md
 *
 * Усі споживачі (калькулятор, управлінський екран, внутрішня смета,
 * клієнтська смета, PDF, історія, заказ) беруть цифри ТІЛЬКИ звідси.
 * Розділення внутрішнього і клієнтського контуру виконується тут (C7),
 * податки рахуються один раз (C4), закупівельна кратність не впливає
 * на суму клієнта (C6).
 */

export const CALC_CORE_VERSION = "calc-core@1";
export const CONTRACT_REF = "docs/ERP_LAUNCH_CONTRACT.md";

/** Ставка ПДВ за замовчуванням. */
export const DEFAULT_VAT_RATE = 0.2;

export type CalcBlock = "materials" | "works" | "logistics" | "equipment" | "other";

/** C4: ПДВ нараховується лише на матеріали. */
export function blockIsTaxable(block: CalcBlock): boolean {
  return block === "materials";
}

export interface CanonicalLine {
  key: string;
  block: CalcBlock;
  /** Готова до показу назва позиції. */
  name: string;
  unit: string;
  /** Технічна (розрахункова) кількість — саме вона формує вартість. */
  qty: number;
  /** Закупівельна кількість (рулони, 2-метрові профілі, упаковки). C6. */
  purchaseQty?: number;
  purchaseUnit?: string;
  /** Залишок після закупівельного округлення, в одиницях `unit`. */
  remainder?: number;
  /** Ціна продажу за одиницю, НЕТТО (без ПДВ). */
  pricePerUnit: number;
  /** Собівартість за одиницю. Внутрішнє поле. */
  costPerUnit: number;
  /** Сума продажу, НЕТТО. */
  sum: number;
  /** Собівартість рядка. Внутрішнє поле. */
  cost: number;
  /** Чи показувати рядок клієнту. */
  showToClient: boolean;
  note?: string;
}

export interface CanonicalTotals {
  materialsNet: number;
  materialsVat: number;
  materialsGross: number;
  worksNet: number;
  logisticsNet: number;
  otherNet: number;
  /** Сума, яку платить клієнт: нетто робіт/логістики + брутто матеріалів. */
  totalClient: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  markupPercent: number;
  vatRate: number;
  vatEnabled: boolean;
}

export interface BlockingIssue {
  key: string;
  reason: "missing_code" | "zero_price";
  message: string;
}

export interface CanonicalEstimate {
  coreVersion: string;
  contract: string;
  module: string;
  engineVersion: string;
  priceBookVersion: number | null;
  directionVersion: number | null;
  lines: CanonicalLine[];
  totals: CanonicalTotals;
  warnings: string[];
  /** C8: непорожній список повністю блокує фінальний статус і клієнтський PDF. */
  blocking: BlockingIssue[];
}

export interface BuildCanonicalOptions {
  module: string;
  engineVersion: string;
  priceBookVersion?: number | null;
  directionVersion?: number | null;
  vatEnabled?: boolean;
  vatRate?: number;
  warnings?: string[];
  /** Коди, для яких ціна взята з довідника або дефолту калькулятора. */
  knownCodes?: Iterable<string>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** ПДВ рядка. Нараховується один раз і тільки для матеріалів (C4). */
export function lineVat(line: CanonicalLine, vatRate: number, vatEnabled: boolean): number {
  if (!vatEnabled) return 0;
  if (!blockIsTaxable(line.block)) return 0;
  return r2(line.sum * vatRate);
}

/** Ціна одиниці, яку бачить клієнт: з ПДВ для матеріалів, без — для решти. */
export function clientUnitPrice(line: CanonicalLine, vatRate: number, vatEnabled: boolean): number {
  const k = vatEnabled && blockIsTaxable(line.block) ? 1 + vatRate : 1;
  return r2(line.pricePerUnit * k);
}

export function taxNoteFor(block: CalcBlock, vatEnabled: boolean): string {
  if (!vatEnabled) return "без ПДВ";
  return blockIsTaxable(block) ? "з ПДВ" : "без ПДВ";
}

/** C8: активна позиція без коду або з нульовою ціною — блокуюча помилка. */
export function findBlockingIssues(
  lines: readonly CanonicalLine[],
  knownCodes?: Iterable<string>,
): BlockingIssue[] {
  const known = knownCodes ? new Set(knownCodes) : null;
  const out: BlockingIssue[] = [];
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    if (!l.showToClient) continue;
    if (known && !known.has(l.key)) {
      out.push({ key: l.key, reason: "missing_code", message: `Позиції «${l.name}» немає в прайсі (код ${l.key})` });
      continue;
    }
    if (!(l.pricePerUnit > 0)) {
      out.push({ key: l.key, reason: "zero_price", message: `Нульова ціна продажу: ${l.name} (${l.key})` });
    }
  }
  return out;
}

/** Єдина точка формування канонічного результату. */
export function buildCanonicalEstimate(
  lines: readonly CanonicalLine[],
  opts: BuildCanonicalOptions,
): CanonicalEstimate {
  const vatEnabled = opts.vatEnabled ?? false;
  const vatRate = opts.vatRate ?? DEFAULT_VAT_RATE;

  let materialsNet = 0, worksNet = 0, logisticsNet = 0, otherNet = 0, totalCost = 0;
  for (const l of lines) {
    totalCost += l.cost;
    if (l.block === "materials") materialsNet += l.sum;
    else if (l.block === "works") worksNet += l.sum;
    else if (l.block === "logistics") logisticsNet += l.sum;
    else otherNet += l.sum;
  }
  materialsNet = r2(materialsNet);
  worksNet = r2(worksNet);
  logisticsNet = r2(logisticsNet);
  otherNet = r2(otherNet);
  totalCost = r2(totalCost);

  const materialsVat = vatEnabled ? r2(materialsNet * vatRate) : 0;
  const materialsGross = r2(materialsNet + materialsVat);
  const totalClient = r2(materialsGross + worksNet + logisticsNet + otherNet);
  const netRevenue = r2(materialsNet + worksNet + logisticsNet + otherNet);
  const grossProfit = r2(netRevenue - totalCost);

  return {
    coreVersion: CALC_CORE_VERSION,
    contract: CONTRACT_REF,
    module: opts.module,
    engineVersion: opts.engineVersion,
    priceBookVersion: opts.priceBookVersion ?? null,
    directionVersion: opts.directionVersion ?? null,
    lines: lines.map((l) => ({ ...l })),
    totals: {
      materialsNet, materialsVat, materialsGross, worksNet, logisticsNet, otherNet,
      totalClient, totalCost, grossProfit,
      marginPercent: netRevenue > 0 ? r2((grossProfit / netRevenue) * 100) : 0,
      markupPercent: totalCost > 0 ? r2((grossProfit / totalCost) * 100) : 0,
      vatRate, vatEnabled,
    },
    warnings: [...(opts.warnings ?? [])],
    blocking: findBlockingIssues(lines, opts.knownCodes),
  };
}

// ─────────────────────────── DTO split (C7) ───────────────────────────

export interface InternalEstimateLineDTO extends CanonicalLine {
  vat: number;
  clientUnitPrice: number;
  clientSum: number;
}

export interface InternalEstimateDTO {
  kind: "internal";
  coreVersion: string;
  module: string;
  engineVersion: string;
  priceBookVersion: number | null;
  directionVersion: number | null;
  lines: InternalEstimateLineDTO[];
  totals: CanonicalTotals;
  warnings: string[];
  blocking: BlockingIssue[];
}

export interface ClientEstimateLineDTO {
  key: string;
  block: CalcBlock;
  name: string;
  unit: string;
  qty: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  /** Ціна за одиницю для клієнта (матеріали — з ПДВ). */
  pricePerUnit: number;
  sum: number;
  taxNote: string;
}

export interface ClientEstimateDTO {
  kind: "client";
  module: string;
  lines: ClientEstimateLineDTO[];
  totals: {
    materials: number;
    works: number;
    logistics: number;
    other: number;
    vatOnMaterials: number;
    total: number;
    vatEnabled: boolean;
    vatRate: number;
  };
  taxNote: string;
}

export function toInternalEstimateDTO(est: CanonicalEstimate): InternalEstimateDTO {
  const { vatRate, vatEnabled } = est.totals;
  return {
    kind: "internal",
    coreVersion: est.coreVersion,
    module: est.module,
    engineVersion: est.engineVersion,
    priceBookVersion: est.priceBookVersion,
    directionVersion: est.directionVersion,
    lines: est.lines.map((l) => {
      const vat = lineVat(l, vatRate, vatEnabled);
      return { ...l, vat, clientUnitPrice: clientUnitPrice(l, vatRate, vatEnabled), clientSum: r2(l.sum + vat) };
    }),
    totals: est.totals,
    warnings: est.warnings,
    blocking: est.blocking,
  };
}

/**
 * Клієнтська проекція. Жодного поля собівартості, закупівлі, прибутку
 * чи маржинальності тут бути не може — це перевіряється тестами (C7).
 */
export function toClientEstimateDTO(est: CanonicalEstimate): ClientEstimateDTO {
  const { vatRate, vatEnabled } = est.totals;
  const lines: ClientEstimateLineDTO[] = [];
  for (const l of est.lines) {
    if (!l.showToClient || !(l.qty > 0)) continue;
    const vat = lineVat(l, vatRate, vatEnabled);
    const dto: ClientEstimateLineDTO = {
      key: l.key,
      block: l.block,
      name: l.name,
      unit: l.unit,
      qty: l.qty,
      pricePerUnit: clientUnitPrice(l, vatRate, vatEnabled),
      sum: r2(l.sum + vat),
      taxNote: taxNoteFor(l.block, vatEnabled),
    };
    if (l.purchaseQty !== undefined) dto.purchaseQty = l.purchaseQty;
    if (l.purchaseUnit !== undefined) dto.purchaseUnit = l.purchaseUnit;
    lines.push(dto);
  }
  return {
    kind: "client",
    module: est.module,
    lines,
    totals: {
      materials: est.totals.materialsGross,
      works: est.totals.worksNet,
      logistics: est.totals.logisticsNet,
      other: est.totals.otherNet,
      vatOnMaterials: est.totals.materialsVat,
      total: est.totals.totalClient,
      vatEnabled,
      vatRate,
    },
    taxNote: vatEnabled
      ? "Матеріали — з ПДВ. Роботи та логістика — без ПДВ."
      : "Ціни без ПДВ.",
  };
}

/** Поля, які ніколи не залишають сервер у клієнтському контурі. */
export const FORBIDDEN_CLIENT_FIELDS = [
  "cost", "costPerUnit", "buy", "buyPrice", "buy_price",
  "profit", "grossProfit", "margin", "marginPercent", "markupPercent",
  "totalCost", "purchasePrice",
] as const;

/** Рекурсивна перевірка, що в об'єкті немає внутрішніх полів. */
export function containsInternalFields(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if ((FORBIDDEN_CLIENT_FIELDS as readonly string[]).includes(k)) found.add(k);
      walk(child);
    }
  };
  walk(value);
  return [...found];
}

/** C8: чи можна перевести смету у фінальний статус / віддати клієнтський PDF. */
export function isReleasable(est: CanonicalEstimate): boolean {
  return est.blocking.length === 0;
}

export function assertReleasable(est: CanonicalEstimate): void {
  if (!isReleasable(est)) {
    throw new Error(
      "Заблоковано (" + CONTRACT_REF + ", C8): " + est.blocking.map((b) => b.message).join("; "),
    );
  }
}

// ─────────────────────── Обладнання / амортизація ───────────────────────

export interface EquipmentAmortInput {
  /** Вартість придбання, грн. */
  purchaseCost: number;
  /** Строк експлуатації, місяців. */
  lifetimeMonths: number;
  /** Скільки замовлень обслуговує одиниця техніки за місяць. */
  ordersPerMonth: number;
  /** Націнка на амортизацію для клієнта, %. */
  markupPercent: number;
}

export interface EquipmentAmortResult {
  monthlyAmort: number;
  amortPerOrder: number;
  sellPerOrder: number;
  profitPerOrder: number;
  marginPercent: number;
}

/**
 * Детермінована амортизація обладнання. Ціна продажу завжди виводиться
 * з собівартості, тому від'ємна маржинальність (−400…−5900%) неможлива.
 */
export function equipmentAmortization(input: EquipmentAmortInput): EquipmentAmortResult {
  const months = Math.max(1, input.lifetimeMonths);
  const orders = Math.max(1, input.ordersPerMonth);
  const monthlyAmort = r2(Math.max(0, input.purchaseCost) / months);
  const amortPerOrder = r2(monthlyAmort / orders);
  const markup = Math.max(0, input.markupPercent);
  const sellPerOrder = r2(amortPerOrder * (1 + markup / 100));
  const profitPerOrder = r2(sellPerOrder - amortPerOrder);
  return {
    monthlyAmort,
    amortPerOrder,
    sellPerOrder,
    profitPerOrder,
    marginPercent: sellPerOrder > 0 ? r2((profitPerOrder / sellPerOrder) * 100) : 0,
  };
}

// ─────────────────────── Закупівельна кратність (C6) ───────────────────────

export interface PurchaseRounding {
  purchaseQty: number;
  remainder: number;
}

/** Кількість пакувань (рулонів / штук) і залишок у робочих одиницях. */
export function purchaseByPack(techQty: number, packSize: number): PurchaseRounding {
  if (!(packSize > 0) || !(techQty > 0)) return { purchaseQty: 0, remainder: 0 };
  const packs = Math.ceil(techQty / packSize);
  return { purchaseQty: packs, remainder: r2(packs * packSize - techQty) };
}

/** Округлення до кратності в тих самих одиницях (напр. пісок до 1 т). */
export function purchaseByStep(techQty: number, step: number): PurchaseRounding {
  if (!(step > 0) || !(techQty > 0)) return { purchaseQty: 0, remainder: 0 };
  const q = Math.ceil(techQty / step) * step;
  return { purchaseQty: r2(q), remainder: r2(q - techQty) };
}
