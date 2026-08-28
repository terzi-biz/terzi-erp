/**
 * Реєстр модулів для серверного Calculation Core.
 *
 * Тут (і тільки тут) історичні рушії калькуляторів запускаються, після чого
 * результат одразу нормалізується в `CanonicalResult`. Клієнтський код більше
 * не рахує підсумки: він передає вхідні параметри і отримує дозволений DTO.
 */
import { calculateScreed, DEFAULT_SETTINGS, DEFAULT_MATERIAL_PRICES, type ScreedInput } from "../screed-calc";
import { calculatePvc, DEFAULT_PVC_LOGISTICS, DEFAULT_PVC_COEFFS, DEFAULT_PVC_WORKS, DEFAULT_PVC_PRICES, type PvcInput } from "../pvc-calc";
import {
  calculateRoofing, DEFAULT_ROOFING_LOGISTICS, DEFAULT_ROOFING_COEFFS, DEFAULT_ROOFING_WORKS, DEFAULT_ROOFING_PRICES,
  type RoofingInput,
} from "../roofing-calc";
import {
  calculateInsulation, DEFAULT_INSULATION_LOGISTICS, DEFAULT_INSULATION_COEFFS,
  DEFAULT_INSULATION_WORKS, DEFAULT_INSULATION_PRICES, type InsulationInput,
} from "../insulation-calc";
import {
  calculateDemolition, DEFAULT_DEMOLITION_LOGISTICS, DEFAULT_DEMOLITION_COEFFS,
  DEFAULT_DEMOLITION_WORKS, DEFAULT_DEMOLITION_PRICES, type DemolitionInput,
} from "../demolition-calc";
import { applyTargetMargin } from "../target-margin";
import { ENGINE_VERSIONS } from "../engines/versions";
import { coreFromLegacyResult, type LegacyResultLike } from "./legacy-adapter";
import { DEFAULT_AMORT_SETTINGS, type AmortSettings } from "./amortization";
import type { CanonicalResult } from "./dto";

export const CALC_MODULES = ["screed", "roofing_pvc", "roofing_rub", "insulation", "demolition"] as const;
export type CalcModule = (typeof CALC_MODULES)[number];

export interface ModulePrices {
  materials?: Record<string, { buy: number; sell: number }>;
  works?: Record<string, number>;
  workCosts?: Record<string, number>;
  logistics?: Record<string, { buy: number; sell: number }>;
  coeffs?: object;
  settings?: object;
}

export interface ModulePreviewRequest {
  module: CalcModule;
  input: Record<string, unknown>;
  prices?: ModulePrices;
  /** Цільова маржа, % (0 — не застосовувати). */
  targetMargin?: number;
  amort?: Partial<AmortSettings>;
  priceBookVersion?: number | null;
}

/** Грошові поля історичного результату — вони НЕ повертаються як «технічні». */
const MONEY_KEYS = new Set([
  "lines", "warnings",
  "materialsSell", "worksSell", "logisticsSell", "subtotalSell",
  "materialsCost", "worksCost", "logisticsCost", "totalCost", "totalClient",
  "amortEquip", "amortTransport", "grossProfit", "marginPercent", "markupPercent",
  "pricePerM2", "vatAdjustment", "fopAdjustment", "minCheckAdjustment",
  "discountAmount", "complexityAmount", "partnerCommission", "core",
]);

export type TechInfo = Record<string, number | string | boolean>;

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Дефолти довідника: гарантують повний прайс навіть за часткового payload. */
const DEFAULT_MATERIALS_BY_MODULE: Record<CalcModule, Record<string, unknown>> = {
  screed: DEFAULT_MATERIAL_PRICES,
  roofing_pvc: DEFAULT_PVC_PRICES,
  roofing_rub: DEFAULT_ROOFING_PRICES,
  insulation: DEFAULT_INSULATION_PRICES,
  demolition: DEFAULT_DEMOLITION_PRICES,
};

function runEngine(req: ModulePreviewRequest): LegacyResultLike & Record<string, unknown> {
  const p = req.prices ?? {};
  const materials = {
    ...DEFAULT_MATERIALS_BY_MODULE[req.module],
    ...(p.materials ?? {}),
  } as never;
  const logistics = (p.logistics ?? undefined) as never;
  const coeffs = (p.coeffs ?? undefined) as never;
  switch (req.module) {
    case "screed":
      return calculateScreed(
        req.input as unknown as ScreedInput,
        materials,
        (p.works ?? {}) as never,
        { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } as never,
        (p.logistics ?? undefined) as never,
      ) as never;
    case "roofing_pvc":
      return calculatePvc(
        req.input as unknown as PvcInput,
        materials,
        { ...DEFAULT_PVC_WORKS, ...(p.works ?? {}) },
        (p.workCosts ?? {}) as Record<string, number>,
        (logistics ?? DEFAULT_PVC_LOGISTICS) as never,
        (coeffs ?? DEFAULT_PVC_COEFFS) as never,
      ) as never;
    case "roofing_rub":
      return calculateRoofing(
        req.input as unknown as RoofingInput,
        materials,
        { ...DEFAULT_ROOFING_WORKS, ...(p.works ?? {}) } as never,
        (p.workCosts ?? {}) as Record<string, number>,
        (logistics ?? DEFAULT_ROOFING_LOGISTICS) as never,
        (coeffs ?? DEFAULT_ROOFING_COEFFS) as never,
      ) as never;
    case "insulation":
      return calculateInsulation(
        req.input as unknown as InsulationInput,
        materials,
        { ...DEFAULT_INSULATION_WORKS, ...(p.works ?? {}) } as never,
        (logistics ?? DEFAULT_INSULATION_LOGISTICS) as never,
        (coeffs ?? DEFAULT_INSULATION_COEFFS) as never,
      ) as never;
    case "demolition":
      return calculateDemolition(
        req.input as unknown as DemolitionInput,
        materials,
        { ...DEFAULT_DEMOLITION_WORKS, ...(p.works ?? {}) } as never,
        (logistics ?? DEFAULT_DEMOLITION_LOGISTICS) as never,
        (coeffs ?? DEFAULT_DEMOLITION_COEFFS) as never,
      ) as never;
    default:
      throw new Error(`Невідомий модуль розрахунку: ${String(req.module)}`);
  }
}

const ENGINE_VERSION_BY_MODULE: Record<CalcModule, string> = {
  screed: (ENGINE_VERSIONS as Record<string, string>)["screed"] ?? "screed@1",
  roofing_pvc: (ENGINE_VERSIONS as Record<string, string>)["roofing_pvc"] ?? "pvc@1",
  roofing_rub: (ENGINE_VERSIONS as Record<string, string>)["roofing_rub"] ?? "roofing@1",
  insulation: (ENGINE_VERSIONS as Record<string, string>)["insulation"] ?? "insulation@1",
  demolition: (ENGINE_VERSIONS as Record<string, string>)["demolition"] ?? "demolition@1",
};

export interface ModulePreviewResult {
  canonical: CanonicalResult;
  /** Технічні (негрошові) показники рушія: обʼєм, товщина, контейнери тощо. */
  tech: TechInfo;
}

/**
 * Єдина серверна точка live-preview: рушій → цільова маржа → Calculation Core.
 * Амортизація керується перемикачами і впливає на канонічний результат.
 */
export function buildModulePreview(req: ModulePreviewRequest): ModulePreviewResult {
  const raw = runEngine(req);
  const withMargin = applyTargetMargin(raw as never, req.targetMargin) as unknown as
    LegacyResultLike & Record<string, unknown>;

  const amort: AmortSettings = { ...DEFAULT_AMORT_SETTINGS, ...(req.amort ?? {}) };
  const input = req.input as Record<string, unknown>;
  const areaM2 = num(input["area"] ?? input["areaM2"]);

  const canonical = coreFromLegacyResult(req.module, areaM2, withMargin, {
    payment: String(input["payment"] ?? "cash"),
    withVAT: input["withVAT"] === true,
    complexityPercent: num(input["complexityPercent"]),
    discountPercent: num(input["discountPercent"]),
    partnerCommission: num(input["partnerCommission"]),
    minCheck: num(input["minCheck"]),
    engineVersion: ENGINE_VERSION_BY_MODULE[req.module],
    priceBookVersion: req.priceBookVersion ?? null,
    amort,
  });

  const tech: TechInfo = {};
  for (const [k, v] of Object.entries(withMargin)) {
    if (MONEY_KEYS.has(k)) continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") tech[k] = v;
  }

  return { canonical, tech };
}
