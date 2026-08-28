/**
 * Канонічний результат Calculation Core і роздільні DTO (Launch Contract §7).
 *
 * InternalEstimateDTO — усе: закупівля, собівартість, амортизація, прибуток, маржа.
 * ClientEstimateDTO   — лише те, що дозволено бачити замовнику. Заборонені поля
 *                       ФІЗИЧНО відсутні (не `null`), тому їх немає і в network response.
 */
import { CONTRACT_VERSION } from "./contract";
import type { BillingMode, PriceBlockingError, PriceStatus } from "./price-policy";
import type { SellerSettings, VatCategory, VatCategoryTotal } from "./vat";
import { taxStatusLabel } from "./vat";
import type { AmortSettings } from "./amortization";
import type { ProfitResult } from "./margin";

export type CoreBlock = "materials" | "works" | "logistics" | "equipment" | "services" | "other";

/** Категорія ПДВ для блоку. */
export const BLOCK_VAT_CATEGORY: Record<CoreBlock, VatCategory> = {
  materials: "materials",
  works: "works",
  logistics: "logistics",
  equipment: "equipment",
  services: "services",
  other: "services",
};

export interface CoreLine {
  key: string;
  block: CoreBlock;
  name: string;
  unit: string;
  /** Чиста кількість (фізично на об'єкті). */
  qtyNet: number;
  /** Технічна (розрахункова) кількість — за нею рахуються гроші. */
  qtyTech: number;
  /** Рекомендована закупівля у фасовці. */
  qtyPurchase?: number;
  purchaseUnit?: string;
  /** Залишок після закупівлі. */
  remainder?: number;
  buyPerUnit: number;
  sellPerUnit: number;
  cost: number;
  /** Продаж НЕТТО (без ПДВ). */
  sellNet: number;
  vatRate: number;
  vatAmount: number;
  /** Продаж з ПДВ. */
  sellGross: number;
  billingMode: BillingMode;
  priceStatus: PriceStatus;
  catalogCode?: string | null;
  note?: string;
  /** Внутрішній коментар — ніколи не потрапляє в клієнтський DTO. */
  internalNote?: string;
}

export interface CoreVersions {
  contractVersion: string;
  engineVersion: string;
  priceBookVersion: number | null;
  directionVersion: number | null;
}

export interface CanonicalResult {
  module: string;
  areaM2: number;
  lines: CoreLine[];
  /** НЕТТО по блоках. */
  netByBlock: Record<CoreBlock, number>;
  vat: VatCategoryTotal[];
  vatTotal: number;
  /** Виручка без клієнтських податків. */
  revenueNet: number;
  /** Клієнтський підсумок з податками. */
  totalClient: number;
  materialsCost: number;
  worksCost: number;
  logisticsCost: number;
  amortCost: number;
  totalCost: number;
  profit: ProfitResult;
  seller: SellerSettings;
  amort: AmortSettings;
  warnings: string[];
  blockingErrors: PriceBlockingError[];
  versions: CoreVersions;
}

export interface InternalEstimateLine extends CoreLine {}

export interface InternalEstimateDTO {
  kind: "internal";
  module: string;
  areaM2: number;
  lines: InternalEstimateLine[];
  netByBlock: Record<CoreBlock, number>;
  vat: VatCategoryTotal[];
  vatTotal: number;
  revenueNet: number;
  totalClient: number;
  materialsCost: number;
  worksCost: number;
  logisticsCost: number;
  amortCost: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number | null;
  markupPercent: number | null;
  pricePerM2: number;
  warnings: string[];
  blockingErrors: PriceBlockingError[];
  versions: CoreVersions;
}

/** Клієнтський рядок: жодних buy/cost/margin ключів. */
export interface ClientEstimateLine {
  key: string;
  block: CoreBlock;
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  sum: number;
  vatRate: number;
  note?: string;
}

export interface ClientEstimateDTO {
  kind: "client";
  module: string;
  areaM2: number;
  lines: ClientEstimateLine[];
  /** Підсумок по блоках у клієнтських цінах (з ПДВ там, де він є). */
  totalsByBlock: Partial<Record<CoreBlock, number>>;
  /** Сума ПДВ, уже включена у відповідні рядки. */
  vatAmount: number;
  vatLabel: string;
  taxStatus: string;
  total: number;
  pricePerM2: number;
  contractVersion: string;
}

const round2 = (v: number) => +(+v || 0).toFixed(2);

export function toInternalDTO(r: CanonicalResult): InternalEstimateDTO {
  return {
    kind: "internal",
    module: r.module,
    areaM2: r.areaM2,
    lines: r.lines.map((l) => ({ ...l })),
    netByBlock: { ...r.netByBlock },
    vat: r.vat.map((v) => ({ ...v })),
    vatTotal: r.vatTotal,
    revenueNet: r.revenueNet,
    totalClient: r.totalClient,
    materialsCost: r.materialsCost,
    worksCost: r.worksCost,
    logisticsCost: r.logisticsCost,
    amortCost: r.amortCost,
    totalCost: r.totalCost,
    grossProfit: r.profit.grossProfit,
    marginPercent: r.profit.marginPercent,
    markupPercent: r.profit.markupPercent,
    pricePerM2: r.areaM2 > 0 ? round2(r.totalClient / r.areaM2) : 0,
    warnings: [...r.warnings],
    blockingErrors: r.blockingErrors.map((e) => ({ ...e })),
    versions: { ...r.versions },
  };
}

/**
 * Клієнтська проекція. Будується перерахуванням дозволених полів — саме тому
 * жодне внутрішнє поле не може «протекти» при додаванні нових полів у CoreLine.
 */
export function toClientDTO(r: CanonicalResult): ClientEstimateDTO {
  const lines: ClientEstimateLine[] = [];
  const totalsByBlock: Partial<Record<CoreBlock, number>> = {};

  for (const l of r.lines) {
    if (l.billingMode === "internal_only") continue;
    if (l.billingMode === "included_in_base") continue;
    if (!(l.qtyTech > 0)) continue;
    const sum = round2(l.sellGross);
    const line: ClientEstimateLine = {
      key: l.key,
      block: l.block,
      name: l.name,
      unit: l.unit,
      qty: l.qtyTech,
      pricePerUnit: l.qtyTech > 0 ? round2(sum / l.qtyTech) : round2(l.sellPerUnit),
      sum,
      vatRate: l.vatRate,
      ...(l.note ? { note: l.note } : {}),
    };
    lines.push(line);
    totalsByBlock[l.block] = round2((totalsByBlock[l.block] ?? 0) + sum);
  }

  const total = round2(r.totalClient);
  return {
    kind: "client",
    module: r.module,
    areaM2: r.areaM2,
    lines,
    totalsByBlock,
    vatAmount: round2(r.vatTotal),
    vatLabel: r.vatTotal > 0 ? `У т.ч. ПДВ ${r.seller.vatRate}% на матеріали` : "Без ПДВ",
    taxStatus: taxStatusLabel(r.seller),
    total,
    pricePerM2: r.areaM2 > 0 ? round2(total / r.areaM2) : 0,
    contractVersion: CONTRACT_VERSION,
  };
}

/** Ключі, заборонені в клієнтському контурі (використовується в тестах і аудиті). */
export const FORBIDDEN_CLIENT_KEYS = [
  "buyPerUnit",
  "costPerUnit",
  "cost",
  "totalCost",
  "materialsCost",
  "worksCost",
  "logisticsCost",
  "amortCost",
  "grossProfit",
  "marginPercent",
  "markupPercent",
  "internalNote",
  "priceStatus",
  "billingMode",
] as const;

/** Рекурсивно перевіряє, що в об'єкті немає заборонених ключів (навіть зі значенням null). */
export function hasForbiddenClientKeys(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((FORBIDDEN_CLIENT_KEYS as readonly string[]).includes(k)) found.add(k);
      walk(val);
    }
  };
  walk(value);
  return [...found];
}
