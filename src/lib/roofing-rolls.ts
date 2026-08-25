/**
 * Каталог наплавних рулонів (нижній / верхній шар) для калькулятора «Руберойд».
 * Джерело правди — база знань `.lovable/knowledge/roofing-calculator.md`
 * (ROOFING_KB_MATERIALS): ціна за м², площа рулона, призначення.
 *
 * Тут лише детермінована вибірка та перерахунок ціни рулона:
 *   ціна рулона = ціна за м² × площа рулона.
 */
import { ROOFING_KB_MATERIALS } from "./roofing-knowledge.generated";

export type RollLayerKind = "bottom" | "top";

export interface RollMaterial {
  code: string;
  name: string;
  brand: string;
  kind: RollLayerKind;      // Підкладковий (нижній) / Верхній (з посипкою)
  rollM2: number;           // площа рулона за прайсом
  widthM: number;           // ширина полотна
  lengthM: number;          // довжина рулона (rollM2 / widthM)
  buyPerM2: number;
  sellPerM2: number;
  weightKgPerM2: number;
  /** Модифікатор бітуму: APP / SBS / ЕКО тощо (з назви прайсу). */
  modifier: string;
  /** Основа полотна: ПЕ (поліестер), СХ (склохолст). */
  base: string;
  supplier?: string;
  /** Кратність закупівлі в рулонах (палета). */
  packMultiple: number;
}

const MARKUP = 1.5;

/** Стандартна ширина наплавного полотна, м. */
export const DEFAULT_ROLL_WIDTH_M = 1;

export const ROLL_AREA_OPTIONS = [10, 15] as const;
export type RollAreaOption = (typeof ROLL_AREA_OPTIONS)[number];

function modifierOf(name: string): string {
  if (/АПП|APP/i.test(name)) return "APP";
  if (/СБС|SBS/i.test(name)) return "SBS";
  if (/ЕЛАСТ/i.test(name)) return "ЕЛАСТ";
  if (/ФЛЕКС/i.test(name)) return "ФЛЕКС";
  if (/ЕКО/i.test(name)) return "ЕКО";
  return "—";
}

function baseOf(name: string): string {
  if (/-ПЕ-/i.test(name)) return "Поліестер";
  if (/-СХ-/i.test(name)) return "Склохолст";
  return "—";
}


function codeOf(name: string): string {
  return "roll_" + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
}

export const ROOFING_ROLLS: RollMaterial[] = ROOFING_KB_MATERIALS
  .filter((m) => m.unit === "м²" && !!m.rollM2 && (m.purpose === "Підкладковий" || m.purpose === "Верхній"))
  .map((m) => ({
    code: codeOf(m.name),
    name: m.name,
    brand: m.category,
    kind: m.purpose === "Верхній" ? ("top" as const) : ("bottom" as const),
    rollM2: Number(m.rollM2),
    buyPerM2: Number(m.price) || 0,
    sellPerM2: +((Number(m.price) || 0) * MARKUP).toFixed(2),
    weightKgPerM2: Number(m.weightKgPerM2) || 0,
  }));

export const BOTTOM_ROLLS = ROOFING_ROLLS.filter((r) => r.kind === "bottom");
export const TOP_ROLLS = ROOFING_ROLLS.filter((r) => r.kind === "top");

export const DEFAULT_BOTTOM_ROLL = BOTTOM_ROLLS.find((r) => r.name.includes("Акваізол ЕКО-ПЕ-3,0"))?.code
  ?? BOTTOM_ROLLS[0]?.code ?? "";
export const DEFAULT_TOP_ROLL = TOP_ROLLS.find((r) => r.name.includes("Акваізол ЕКО-ПЕ-4,0-ПС"))?.code
  ?? TOP_ROLLS[0]?.code ?? "";

export function findRoll(code: string | undefined, kind: RollLayerKind): RollMaterial | undefined {
  const list = kind === "top" ? TOP_ROLLS : BOTTOM_ROLLS;
  return list.find((r) => r.code === code) ?? list.find((r) => r.code === (kind === "top" ? DEFAULT_TOP_ROLL : DEFAULT_BOTTOM_ROLL));
}
