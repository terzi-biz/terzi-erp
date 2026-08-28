/**
 * Податковий модуль Calculation Core (Launch Contract §4).
 *
 * Правила:
 *   — матеріали з ПДВ, роботи й логістика без ПДВ;
 *   — ПДВ доступний лише продавцю-платнику ПДВ;
 *   — подвійне нарахування виключене: якщо ціна вже брутто, ставка не додається;
 *   — вхідний ПДВ постачальника для неплатника входить у закупівельну собівартість.
 */
import { VAT_DEFAULTS } from "./contract";

export type SellerProfile = "fop2" | "fop3" | "vat_payer";
export type PaymentForm = "cash" | "cashless";

export interface VatCategories {
  materials: boolean;
  works: boolean;
  logistics: boolean;
  equipment: boolean;
  services: boolean;
}

export interface SellerSettings {
  profile: SellerProfile;
  payment: PaymentForm;
  /** Ставка ПДВ, % (лише для продавця-платника). */
  vatRate: number;
  categories: VatCategories;
  /** Клієнтська коригувальна надбавка за безготівку, % (ФОП 2 = 0, ФОП 3 = 6). */
  cashlessAdjustPercent: number;
}

export const DEFAULT_VAT_CATEGORIES: VatCategories = { ...VAT_DEFAULTS };

export function defaultSellerSettings(profile: SellerProfile = "fop2"): SellerSettings {
  return {
    profile,
    payment: "cashless",
    vatRate: profile === "vat_payer" ? VAT_DEFAULTS.rate : 0,
    categories: { ...DEFAULT_VAT_CATEGORIES },
    cashlessAdjustPercent: profile === "fop3" ? 6 : 0,
  };
}

/** Чи є продавець платником ПДВ. Для інших профілів галочки категорій вимкнені. */
export function isVatPayer(s: SellerSettings): boolean {
  return s.profile === "vat_payer";
}

export type VatCategory = keyof VatCategories;

/** Ставка ПДВ для конкретної категорії; 0 — «Без ПДВ». */
export function vatRateFor(s: SellerSettings, category: VatCategory): number {
  if (!isVatPayer(s)) return 0;
  if (!s.categories[category]) return 0;
  return Math.max(0, s.vatRate);
}

export interface VatCategoryTotal {
  category: VatCategory;
  base: number;
  rate: number;
  vat: number;
  total: number;
}

/**
 * Нараховує ПДВ на НЕТТО-базу. Якщо `alreadyGross` — сума вже містить податок,
 * і ми лише виділяємо його, а не додаємо повторно (заборона подвійного ПДВ).
 */
export function applyVat(base: number, rate: number, alreadyGross = false): VatCategoryTotal["vat"] {
  if (!(rate > 0) || !(base > 0)) return 0;
  return alreadyGross ? +(base - base / (1 + rate / 100)).toFixed(2) : +((base * rate) / 100).toFixed(2);
}

/** Підсумок по категоріях: база, ставка, сума податку та підсумок. */
export function vatBreakdown(
  s: SellerSettings,
  netByCategory: Partial<Record<VatCategory, number>>,
): VatCategoryTotal[] {
  const cats: VatCategory[] = ["materials", "works", "logistics", "equipment", "services"];
  return cats
    .filter((c) => (netByCategory[c] ?? 0) !== 0)
    .map((category) => {
      const base = +(netByCategory[category] ?? 0).toFixed(2);
      const rate = vatRateFor(s, category);
      const vat = applyVat(base, rate);
      return { category, base, rate, vat, total: +(base + vat).toFixed(2) };
    });
}

/** Людський підпис податкового статусу для клієнтського документа. */
export function taxStatusLabel(s: SellerSettings): string {
  if (!isVatPayer(s)) return "Без ПДВ";
  const active = (Object.keys(s.categories) as VatCategory[]).filter((c) => s.categories[c]);
  if (!active.length || !(s.vatRate > 0)) return "Без ПДВ";
  return `З ПДВ ${s.vatRate}% (${active.length === 1 && active[0] === "materials" ? "матеріали" : "обрані категорії"})`;
}
