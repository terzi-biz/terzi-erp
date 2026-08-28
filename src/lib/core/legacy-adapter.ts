/**
 * Міст між історичними калькуляторами (стяжка, ПВХ, руберойд, утеплення,
 * демонтаж) і єдиним Calculation Core.
 *
 * Модулі більше не мають рахувати податки, коригування, собівартість, прибуток
 * і маржу самостійно — вони віддають сирі рядки, а всі підсумки народжуються
 * рівно один раз у `buildCanonicalResult`.
 */
import { buildCanonicalResult, type CoreInput, type RawLine } from "./index";
import type { CanonicalResult, CoreBlock } from "./dto";
import type { CommercialAdjustments } from "./adjustments";
import type { AmortSettings } from "./amortization";
import type { SellerSettings } from "./vat";

/** Рядок історичного калькулятора. */
export interface LegacyLine {
  key: string;
  block: string;
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  note?: string;
}

const BLOCKS: readonly CoreBlock[] = [
  "materials",
  "works",
  "logistics",
  "equipment",
  "services",
  "other",
];

function toBlock(b: string): CoreBlock {
  return (BLOCKS as readonly string[]).includes(b) ? (b as CoreBlock) : "other";
}

export function toRawLine(l: LegacyLine): RawLine {
  return {
    key: l.key,
    block: toBlock(l.block),
    name: l.name,
    unit: l.unit,
    qtyTech: +l.qty || 0,
    ...(l.purchaseQty !== undefined ? { qtyPurchase: l.purchaseQty } : {}),
    ...(l.purchaseUnit ? { purchaseUnit: l.purchaseUnit } : {}),
    buyPerUnit: +l.costPerUnit || 0,
    sellPerUnit: +l.pricePerUnit || 0,
    priceStatus:
      (+l.pricePerUnit || 0) > 0 || (+l.costPerUnit || 0) > 0 ? "confirmed" : "confirmed_zero",
    ...(l.note ? { note: l.note } : {}),
  };
}

export interface LegacyToCoreOptions {
  module: string;
  areaM2: number;
  lines: readonly LegacyLine[];
  /** Позиції, що існують лише у внутрішньому контурі (бригада, прораб тощо). */
  internalLines?: readonly LegacyLine[];
  seller?: SellerSettings;
  amort?: AmortSettings;
  amortCost?: number;
  adjustments?: CommercialAdjustments;
  warnings?: readonly string[];
  engineVersion: string;
  priceBookVersion?: number | null;
  directionVersion?: number | null;
}

/** Канонічний результат із рядків історичного калькулятора. */
export function canonicalFromLegacy(o: LegacyToCoreOptions): CanonicalResult {
  const lines: RawLine[] = [
    ...o.lines.map(toRawLine),
    ...(o.internalLines ?? []).map((l) => ({
      ...toRawLine(l),
      billingMode: "internal_only" as const,
    })),
  ];
  const input: CoreInput = {
    module: o.module,
    areaM2: o.areaM2,
    lines,
    engineVersion: o.engineVersion,
    ...(o.seller ? { seller: o.seller } : {}),
    ...(o.amort ? { amort: o.amort } : {}),
    ...(o.amortCost !== undefined ? { amortCost: o.amortCost } : {}),
    ...(o.adjustments ? { adjustments: o.adjustments } : {}),
    ...(o.warnings ? { warnings: o.warnings } : {}),
    ...(o.priceBookVersion !== undefined ? { priceBookVersion: o.priceBookVersion } : {}),
    ...(o.directionVersion !== undefined ? { directionVersion: o.directionVersion } : {}),
  };
  return buildCanonicalResult(input);
}
