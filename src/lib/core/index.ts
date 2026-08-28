/**
 * TERZI Calculation Core — єдиний канонічний рушій підсумків.
 *
 * Будь-який калькулятор (стяжка, ПВХ, руберойд, утеплення, демонтаж, напрямок
 * конструктора) віддає сирі рядки, а Core рахує: податки, амортизацію,
 * собівартість, виручку, прибуток, маржу, warnings і blocking errors.
 * Управлінський екран, внутрішня і клієнтська сметa, PDF, історія, замовлення
 * і план/факт беруть цифри лише з `CanonicalResult` та його DTO.
 */
import { CONTRACT_VERSION } from "./contract";
import {
  BLOCK_VAT_CATEGORY,
  type CanonicalResult,
  type CoreBlock,
  type CoreLine,
  type CoreVersions,
} from "./dto";
import { computeProfit } from "./margin";
import {
  findBlockingPriceErrors,
  type BillingMode,
  type PricePolicyLine,
  type PriceStatus,
} from "./price-policy";
import {
  clientAmortAmount,
  amortWarnings,
  DEFAULT_AMORT_SETTINGS,
  type AmortSettings,
} from "./amortization";
import { defaultSellerSettings, vatBreakdown, vatRateFor, type SellerSettings } from "./vat";

export * from "./contract";
export * from "./dto";
export * from "./margin";
export * from "./price-policy";
export * from "./vat";
export * from "./amortization";

/** Сирий рядок від калькулятора. */
export interface RawLine {
  key: string;
  block: CoreBlock;
  name: string;
  unit: string;
  qtyNet?: number;
  qtyTech: number;
  qtyPurchase?: number;
  purchaseUnit?: string;
  remainder?: number;
  buyPerUnit?: number;
  sellPerUnit?: number;
  billingMode?: BillingMode;
  priceStatus?: PriceStatus;
  catalogCode?: string | null;
  requiresCatalogCode?: boolean;
  note?: string;
  internalNote?: string;
}

export interface CoreInput {
  module: string;
  areaM2: number;
  lines: readonly RawLine[];
  seller?: SellerSettings;
  amort?: AmortSettings;
  /** Амортизація обладнання, віднесена на замовлення, грн. */
  amortCost?: number;
  warnings?: readonly string[];
  engineVersion: string;
  priceBookVersion?: number | null;
  directionVersion?: number | null;
}

const round2 = (v: number) => +(+v || 0).toFixed(2);
const EMPTY_BLOCKS: Record<CoreBlock, number> = {
  materials: 0, works: 0, logistics: 0, equipment: 0, services: 0, other: 0,
};

/** Єдина точка, де народжуються підсумкові цифри TERZI. */
export function buildCanonicalResult(input: CoreInput): CanonicalResult {
  const seller = input.seller ?? defaultSellerSettings();
  const amort = input.amort ?? DEFAULT_AMORT_SETTINGS;
  const amortCost = Math.max(0, input.amortCost ?? 0);

  const lines: CoreLine[] = [];
  const netByBlock: Record<CoreBlock, number> = { ...EMPTY_BLOCKS };
  let materialsCost = 0;
  let worksCost = 0;
  let logisticsCost = 0;

  for (const raw of input.lines) {
    const billingMode: BillingMode = raw.billingMode ?? "separate_line";
    const qtyTech = +(raw.qtyTech || 0);
    const buyPerUnit = +(raw.buyPerUnit ?? 0);
    const sellPerUnit = billingMode === "internal_only" ? 0 : +(raw.sellPerUnit ?? 0);
    const cost = round2(qtyTech * buyPerUnit);
    const sellNet = round2(qtyTech * sellPerUnit);
    const vatRate = billingMode === "internal_only" ? 0 : vatRateFor(seller, BLOCK_VAT_CATEGORY[raw.block]);
    // Ставка застосовується один раз до НЕТТО — подвійне нарахування неможливе.
    const vatAmount = vatRate > 0 ? round2((sellNet * vatRate) / 100) : 0;

    lines.push({
      key: raw.key,
      block: raw.block,
      name: raw.name,
      unit: raw.unit,
      qtyNet: raw.qtyNet ?? qtyTech,
      qtyTech,
      ...(raw.qtyPurchase !== undefined ? { qtyPurchase: raw.qtyPurchase } : {}),
      ...(raw.purchaseUnit ? { purchaseUnit: raw.purchaseUnit } : {}),
      ...(raw.remainder !== undefined ? { remainder: raw.remainder } : {}),
      buyPerUnit,
      sellPerUnit,
      cost,
      sellNet,
      vatRate,
      vatAmount,
      sellGross: round2(sellNet + vatAmount),
      billingMode,
      priceStatus: raw.priceStatus ?? (sellPerUnit > 0 || buyPerUnit > 0 ? "confirmed" : "missing"),
      ...(raw.catalogCode !== undefined ? { catalogCode: raw.catalogCode } : {}),
      ...(raw.note ? { note: raw.note } : {}),
      ...(raw.internalNote ? { internalNote: raw.internalNote } : {}),
    });

    netByBlock[raw.block] = round2(netByBlock[raw.block] + sellNet);
    if (raw.block === "materials") materialsCost += cost;
    else if (raw.block === "works") worksCost += cost;
    else if (raw.block === "logistics") logisticsCost += cost;
    else materialsCost += 0, (worksCost += 0), (logisticsCost += 0);
  }

  const otherCost = lines
    .filter((l) => l.block === "equipment" || l.block === "services" || l.block === "other")
    .reduce((s, l) => s + l.cost, 0);

  const linesNet = round2(Object.values(netByBlock).reduce((s, v) => s + v, 0));

  // Клієнтська амортизація рахується від НЕТТО-бази без самої амортизації й без податків.
  const amortClient = clientAmortAmount(amort, {
    worksNet: netByBlock.works,
    logisticsNet: netByBlock.logistics,
    netTotal: linesNet,
    areaM2: input.areaM2,
    amortCost,
  });

  const adjustments = computeAdjustments(
    round2(linesNet + amortClient),
    input.adjustments ?? NO_ADJUSTMENTS,
    seller.payment === "cashless" ? seller.cashlessAdjustPercent : 0,
  );
  const revenueNet = adjustments.net;
  const vat = vatBreakdown(seller, {
    materials: netByBlock.materials,
    works: netByBlock.works,
    logistics: netByBlock.logistics,
    equipment: netByBlock.equipment,
    services: round2(netByBlock.services + netByBlock.other),
  });
  const vatTotal = round2(vat.reduce((s, v) => s + v.vat, 0));
  const totalClient = round2(revenueNet + vatTotal);

  const totalCost = round2(
    materialsCost + worksCost + logisticsCost + otherCost + (amort.includeInCost ? amortCost : 0),
  );

  const policyLines: PricePolicyLine[] = input.lines.map((raw, i) => ({
    key: raw.key,
    block: raw.block,
    name: raw.name,
    qty: +(raw.qtyTech || 0),
    sellPerUnit: lines[i]!.sellPerUnit,
    priceStatus: lines[i]!.priceStatus,
    billingMode: lines[i]!.billingMode,
    ...(raw.requiresCatalogCode ? { requiresCatalogCode: true } : {}),
    ...(raw.catalogCode !== undefined ? { catalogCode: raw.catalogCode } : {}),
  }));

  const versions: CoreVersions = {
    contractVersion: CONTRACT_VERSION,
    engineVersion: input.engineVersion,
    priceBookVersion: input.priceBookVersion ?? null,
    directionVersion: input.directionVersion ?? null,
  };

  return {
    module: input.module,
    areaM2: input.areaM2,
    lines,
    netByBlock,
    vat,
    vatTotal,
    revenueNet,
    totalClient,
    materialsCost: round2(materialsCost),
    worksCost: round2(worksCost),
    logisticsCost: round2(logisticsCost),
    amortCost: round2(amortCost),
    totalCost,
    profit: computeProfit(revenueNet, totalCost),
    seller,
    amort,
    warnings: [...(input.warnings ?? []), ...amortWarnings(amort, amortCost)],
    blockingErrors: findBlockingPriceErrors(policyLines),
    versions,
  };
}
