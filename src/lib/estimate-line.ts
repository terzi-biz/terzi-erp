/**
 * Спільний контракт рядка кошторису для всіх напрямків
 * (стяжка, ПВХ, руберойд, утеплення, демонтаж).
 * Дозволяє переюзати вкладки «Для закупника», «Для прораба», «План/факт».
 */
export interface EstimateLineLike {
  key: string;
  block: "materials" | "works" | "logistics";
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
  sum: number;
  cost: number;
  /** Рекомендована кількість до закупівлі (фасовка). Не впливає на суму. */
  purchaseQty?: number;
  purchaseUnit?: string;
  note?: string;
}
