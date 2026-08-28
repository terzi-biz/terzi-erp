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
import { defaultSellerSettings, type SellerSettings } from "./vat";

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

/** Профіль продавця з історичних полів `payment` / `withVAT`. */
export function sellerFromLegacy(
  payment: "cash" | "cashless" | "fop" | string,
  withVAT: boolean,
  vatRatePercent = 20,
): SellerSettings {
  const profile = withVAT ? "vat_payer" : payment === "fop" ? "fop3" : "fop2";
  const s = defaultSellerSettings(profile as "fop2" | "fop3" | "vat_payer");
  return {
    ...s,
    payment: payment === "cash" ? "cash" : "cashless",
    vatRate: withVAT ? vatRatePercent : 0,
    cashlessAdjustPercent: profile === "fop3" ? s.cashlessAdjustPercent : 0,
    categories: { ...s.categories, works: false, logistics: false, equipment: false, services: false },
  };
}

export interface LegacyResultLike {
  lines: readonly LegacyLine[];
  warnings?: readonly string[];
  materialsCost: number;
  worksCost: number;
  logisticsCost: number;
  amortEquip?: number;
  amortTransport?: number;
  partnerCommission?: number;
}

export interface LegacyCommercial {
  payment: string;
  withVAT: boolean;
  vatRatePercent?: number;
  complexityPercent: number;
  discountPercent: number;
  partnerCommission: number;
  minCheck: number;
  engineVersion: string;
  priceBookVersion?: number | null;
}

/**
 * Канонічний результат для історичного модуля. Різниця між собівартістю блоку
 * і сумою рядків (гарантований фонд бригади, прораб) додається окремими
 * внутрішніми рядками — вони ніколи не потрапляють у клієнтський контур.
 */
export function coreFromLegacyResult(
  module: string,
  areaM2: number,
  res: LegacyResultLike,
  cm: LegacyCommercial,
): CanonicalResult {
  const blockCost = (b: string) =>
    res.lines.filter((l) => l.block === b).reduce((s, l) => s + (+l.qty || 0) * (+l.costPerUnit || 0), 0);
  const internal: LegacyLine[] = [];
  const addDelta = (key: string, name: string, delta: number) => {
    if (delta > 0.005) {
      internal.push({
        key, block: "works", name, unit: "грн", qty: 1,
        pricePerUnit: 0, costPerUnit: +delta.toFixed(2),
      });
    }
  };
  addDelta("int_works_fund", "Гарантований фонд бригади та ІТП (внутрішньо)", res.worksCost - blockCost("works"));
  addDelta("int_materials_fund", "Додаткова собівартість матеріалів (внутрішньо)", res.materialsCost - blockCost("materials"));
  addDelta("int_logistics_fund", "Додаткова собівартість логістики (внутрішньо)", res.logisticsCost - blockCost("logistics"));
  if ((cm.partnerCommission || 0) > 0) {
    internal.push({
      key: "int_commission", block: "other", name: "Комісія партнера (собівартість)", unit: "грн",
      qty: 1, pricePerUnit: 0, costPerUnit: +cm.partnerCommission.toFixed(2),
    });
  }

  return canonicalFromLegacy({
    module,
    areaM2,
    lines: res.lines,
    internalLines: internal,
    seller: sellerFromLegacy(cm.payment, cm.withVAT, cm.vatRatePercent ?? 20),
    amortCost: +((res.amortEquip ?? 0) + (res.amortTransport ?? 0)).toFixed(2),
    adjustments: {
      complexityPercent: cm.complexityPercent,
      discountPercent: cm.discountPercent,
      partnerCommission: cm.partnerCommission,
      minCheck: cm.minCheck,
    },
    ...(res.warnings ? { warnings: res.warnings } : {}),
    engineVersion: cm.engineVersion,
    ...(cm.priceBookVersion !== undefined ? { priceBookVersion: cm.priceBookVersion } : {}),
  });
}
