/**
 * Витратні матеріали: праймер і газ.
 * Праймер рахується ТІЛЬКИ по фактично ґрунтованій площі (не по всій покрівлі).
 * Газ рахується окремими нормами за призначенням і округлюється в балонах угору.
 */
import type { RoofingNorms } from "./norms";
import { makeQty, type Qty } from "./qty";

export interface PrimerInput {
  /** Площа, яку реально ґрунтують, м². */
  primedAreaM2: number;
  norms: RoofingNorms;
  /** Ручна норма л/м², якщо потрібно. */
  rateOverride?: number;
}

export function calcPrimer(input: PrimerInput): Qty {
  const rate = Math.max(0, input.rateOverride ?? input.norms.primerLPerM2);
  const liters = +(Math.max(0, input.primedAreaM2) * rate).toFixed(3);
  return makeQty({
    net: liters,
    calc: liters,
    unit: "л",
    pack: input.norms.primerBucketL,
    packUnit: "відро",
  });
}

export interface GasInput {
  norms: RoofingNorms;
  /** Площа наплавлення нижніх шарів, м². */
  bottomAreaM2: number;
  /** Площа наплавлення верхнього шару, м². */
  topAreaM2: number;
  /** Вертикальні площі (парапети, примикання), м². */
  verticalAreaM2: number;
  /** Площа просушки основи, м². */
  dryingAreaM2: number;
  /** Площа локального ремонту, м². */
  repairAreaM2: number;
  /** Кількість вузлових точок (воронки, аератори, проходки). */
  nodePoints: number;
}

export interface GasBreakdown {
  bottomKg: number;
  topKg: number;
  verticalKg: number;
  dryingKg: number;
  repairKg: number;
  nodesKg: number;
  totalKg: number;
  qty: Qty;
}

export function calcGas(input: GasInput): GasBreakdown {
  const n = input.norms;
  const bottomKg = +(Math.max(0, input.bottomAreaM2) * n.gasKgPerM2Bottom).toFixed(3);
  const topKg = +(Math.max(0, input.topAreaM2) * n.gasKgPerM2Top).toFixed(3);
  const verticalKg = +(Math.max(0, input.verticalAreaM2) * n.gasKgPerM2Vertical).toFixed(3);
  const dryingKg = +(Math.max(0, input.dryingAreaM2) * n.gasKgPerM2Drying).toFixed(3);
  const repairKg = +(Math.max(0, input.repairAreaM2) * n.gasKgPerM2Repair).toFixed(3);
  const nodesKg = +(Math.max(0, input.nodePoints) * n.gasKgPerNode).toFixed(3);
  const totalKg = +(bottomKg + topKg + verticalKg + dryingKg + repairKg + nodesKg).toFixed(3);
  return {
    bottomKg, topKg, verticalKg, dryingKg, repairKg, nodesKg, totalKg,
    qty: makeQty({ net: totalKg, calc: totalKg, unit: "кг", pack: n.gasCylinderKg, packUnit: "бал." }),
  };
}
