/**
 * Класифікація витрат за категорією Finmap: матеріали, роботи, логістика,
 * підрядники, обладнання, накладні, ФОТ, податки, маркетинг.
 *
 * Класифікація — не ціна: жодних сум і норм тут немає. Клас можна перевизначити
 * вручну в довіднику (`finance_categories.cost_class`), код — лише fallback.
 */

export type CostClass =
  | "materials" | "works" | "logistics" | "subcontractors"
  | "equipment" | "payroll" | "marketing" | "taxes" | "overhead" | "other";

export const COST_CLASS_LABELS: Record<CostClass, string> = {
  materials: "Матеріали",
  works: "Роботи",
  logistics: "Логістика і доставка",
  subcontractors: "Підрядники",
  equipment: "Обладнання і амортизація",
  payroll: "ФОТ",
  marketing: "Маркетинг і реклама",
  taxes: "Податки і комісії",
  overhead: "Накладні",
  other: "Інше",
};

/** Прямі виробничі класи, що формують собівартість об'єкта. */
export const DIRECT_COST_CLASSES: CostClass[] = ["materials", "works", "logistics", "subcontractors", "equipment"];

const RULES: { cls: CostClass; keys: string[] }[] = [
  { cls: "subcontractors", keys: ["подрядчик", "підрядник", "субподряд"] },
  { cls: "logistics", keys: ["доставка", "гсм", "паливо", "разгрузка", "розвантаж", "подъем", "підйом", "такси", "таксі", "авторасход", "перевез", "логист", "логіст", "парковк"] },
  { cls: "payroll", keys: ["зп ", "зп", "зарплат", "ставка", "премі", "преми", "kpi", "крi", "офис сотрудник", "офісні", "разнорабоч", "бригадир", "бригады", "бригади"] },
  { cls: "marketing", keys: ["реклам", "маркет", "лидоген", "лідоген", "facebook", "google", "олх", "тикток", "друк"] },
  { cls: "taxes", keys: ["налог", "податк", "vat", "єсв", "эсв", "комиссия банка", "комісія банк", "фоп"] },
  { cls: "equipment", keys: ["оборудован", "обладнан", "амортиз", "инструмент", "інструмент", "спецтехник", "аренда спец", "обслуживание оборуд", "спецоснастк"] },
  { cls: "materials", keys: ["материал", "матеріал", "песок", "пісок", "цемент", "мембран", "рубероид", "руберо", "пенопласт", "полистер", "минеральная вата", "мінеральна вата", "расходник", "витратн", "утеплю"] },
  { cls: "works", keys: ["работы", "роботи", "демонтаж", "кладка", "кровля", "покрівл", "стяжка", "штукатурк", "производствен", "виробнич", "прямые расходы на объект", "прямі витрати"] },
  { cls: "overhead", keys: ["офис", "офіс", "аренда", "оренда", "подписк", "підписк", "бухгалтер", "обучение", "навчання", "консультац", "склад", "страхов", "персонал"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Визначає клас витрат за назвою категорії Finmap. */
export function classifyCostCategory(name: string | null | undefined): CostClass {
  const n = norm(String(name ?? ""));
  if (!n) return "other";
  for (const r of RULES) if (r.keys.some((k) => n.includes(k))) return r.cls;
  return "other";
}

/** Клас категорії з урахуванням ручного перевизначення в довіднику. */
export function costClassOf(category: { name?: string | null; cost_class?: string | null } | null | undefined): CostClass {
  const manual = category?.cost_class as CostClass | null | undefined;
  if (manual && manual in COST_CLASS_LABELS) return manual;
  return classifyCostCategory(category?.name);
}
