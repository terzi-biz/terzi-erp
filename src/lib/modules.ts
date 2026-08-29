/**
 * Канонічний реєстр модулів TERZI ERP.
 *
 * Єдине джерело правди для: навігації, каталогів, калькуляторів, кошторисів,
 * історії, виробництва і звітів. Нових hardcoded route-мап створювати не можна.
 * Fallback «невідомий модуль → screed» заборонений: невідомий id повертає null.
 */

export type ModuleId =
  | "screed"
  | "roofing_pvc"
  | "roofing_rub"
  | "insulation"
  | "demolition"
  | "plaster"
  | "polybeton"
  | "other";

/** Тип виробничих робіт для планування бригад і план/факту. */
export type ProductionType = "floor" | "roof" | "insulation" | "demolition" | "finishing" | "other";

export interface TerziModule {
  id: ModuleId;
  label: string;
  /** Маршрут калькулятора (null — калькулятора ще немає). */
  route: string | null;
  /** Ключ вкладки довідника матеріалів/робіт. */
  catalogModule: ModuleId;
  /** Ключ, під яким модуль зберігається в estimates.module. */
  estimateModule: ModuleId;
  /** Чи є детермінований рушій розрахунку в `src/lib/core/module-registry.ts`. */
  hasCalculator: boolean;
  productionType: ProductionType;
  /** Ролі, яким модуль доступний; порожньо — усім автентифікованим. */
  permissions: readonly string[];
  active: boolean;
}

export const TERZI_MODULES: readonly TerziModule[] = [
  { id: "screed", label: "Стяжка", route: "/screed", catalogModule: "screed", estimateModule: "screed", hasCalculator: true, productionType: "floor", permissions: [], active: true },
  { id: "roofing_pvc", label: "ПВХ мембрана", route: "/roofing_pvc", catalogModule: "roofing_pvc", estimateModule: "roofing_pvc", hasCalculator: true, productionType: "roof", permissions: [], active: true },
  { id: "roofing_rub", label: "Руберойд", route: "/roofing_rub", catalogModule: "roofing_rub", estimateModule: "roofing_rub", hasCalculator: true, productionType: "roof", permissions: [], active: true },
  { id: "insulation", label: "Утеплення", route: "/insulation", catalogModule: "insulation", estimateModule: "insulation", hasCalculator: true, productionType: "insulation", permissions: [], active: true },
  { id: "demolition", label: "Демонтаж", route: "/demolition", catalogModule: "demolition", estimateModule: "demolition", hasCalculator: true, productionType: "demolition", permissions: [], active: true },
  { id: "plaster", label: "Штукатурка", route: null, catalogModule: "plaster", estimateModule: "plaster", hasCalculator: false, productionType: "finishing", permissions: [], active: false },
  { id: "polybeton", label: "Полібетон", route: null, catalogModule: "polybeton", estimateModule: "polybeton", hasCalculator: false, productionType: "floor", permissions: [], active: false },
  { id: "other", label: "Інше", route: null, catalogModule: "other", estimateModule: "other", hasCalculator: false, productionType: "other", permissions: [], active: false },
] as const;

const BY_ID = new Map<string, TerziModule>(TERZI_MODULES.map((m) => [m.id, m]));

/** Модуль за id. Невідомий id → null (жодного мовчазного fallback). */
export function findModule(id: string | null | undefined): TerziModule | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Людська назва модуля; для невідомого — сам id, а не «Стяжка». */
export function moduleLabel(id: string | null | undefined): string {
  return findModule(id)?.label ?? (id ?? "—");
}

/** Модулі з робочим калькулятором (активні). */
export function calculatorModules(): TerziModule[] {
  return TERZI_MODULES.filter((m) => m.active && m.hasCalculator);
}

/** Модулі, доступні набору ролей. */
export function modulesForRoles(roles: readonly string[]): TerziModule[] {
  return TERZI_MODULES.filter(
    (m) => m.active && (m.permissions.length === 0 || m.permissions.some((p) => roles.includes(p))),
  );
}
