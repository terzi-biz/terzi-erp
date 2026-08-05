// Довідники подій операційного календаря TERZI (клієнтський, без серверної логіки)

export type EventCategory = "sales" | "measure" | "production" | "management" | "marketing" | "finance";

export const EVENT_CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: "sales", label: "Продажі" },
  { key: "measure", label: "Заміри" },
  { key: "production", label: "Виробництво" },
  { key: "management", label: "Керівництво" },
  { key: "marketing", label: "Маркетинг" },
  { key: "finance", label: "Фінанси та офіс" },
];

export const EVENT_TYPES: { key: string; label: string; category: EventCategory }[] = [
  // Продажі
  { key: "call", label: "Дзвінок клієнту", category: "sales" },
  { key: "call_repeat", label: "Повторний дзвінок", category: "sales" },
  { key: "lead_qualify", label: "Кваліфікація ліда", category: "sales" },
  { key: "meeting", label: "Зустріч", category: "sales" },
  { key: "offer_prepare", label: "Підготовка пропозиції", category: "sales" },
  { key: "estimate_send", label: "Відправка кошторису", category: "sales" },
  { key: "contract_approve", label: "Погодження договору", category: "sales" },
  { key: "prepayment", label: "Отримання передоплати", category: "sales" },
  { key: "debt_control", label: "Контроль заборгованості", category: "sales" },
  // Заміри
  { key: "measure_primary", label: "Первинний замір", category: "measure" },
  { key: "measure_repeat", label: "Повторний замір", category: "measure" },
  { key: "measure_control", label: "Контрольний замір", category: "measure" },
  { key: "measure_final", label: "Виконавчий замір", category: "measure" },
  { key: "measure_report", label: "Підготовка звіту", category: "measure" },
  { key: "measure_handoff", label: "Передача даних кошториснику", category: "measure" },
  // Виробництво
  { key: "site_prepare", label: "Підготовка замовлення", category: "production" },
  { key: "equipment_delivery", label: "Доставка обладнання", category: "production" },
  { key: "material_delivery", label: "Доставка матеріалів", category: "production" },
  { key: "work_start", label: "Початок робіт", category: "production" },
  { key: "work_stage", label: "Етап виконання", category: "production" },
  { key: "tech_control", label: "Технічний контроль", category: "production" },
  { key: "photo_report", label: "Фотозвіт", category: "production" },
  { key: "acceptance", label: "Приймання", category: "production" },
  { key: "fixes", label: "Усунення зауважень", category: "production" },
  { key: "handover", label: "Здача замовлення", category: "production" },
  // Керівництво
  { key: "daily_standup", label: "Щоденна планерка", category: "management" },
  { key: "owner_meeting", label: "Зустріч з власником", category: "management" },
  { key: "finance_meeting", label: "Фінансова нарада", category: "management" },
  { key: "marketing_meeting", label: "Маркетингова нарада", category: "management" },
  { key: "sales_meeting", label: "Нарада з продажів", category: "management" },
  { key: "production_meeting", label: "Виробнича нарада", category: "management" },
  { key: "hr_meeting", label: "HR-зустріч", category: "management" },
  { key: "site_audit", label: "Контроль замовлення", category: "management" },
  { key: "payment_approve", label: "Погодження платежу", category: "management" },
  { key: "discount_approve", label: "Погодження знижки", category: "management" },
  // Маркетинг
  { key: "creative", label: "Підготовка креативу", category: "marketing" },
  { key: "ads_launch", label: "Запуск реклами", category: "marketing" },
  { key: "shooting", label: "Зйомка замовлення", category: "marketing" },
  { key: "content_publish", label: "Публікація контенту", category: "marketing" },
  { key: "ads_analysis", label: "Аналіз кампанії", category: "marketing" },
  { key: "marketing_report", label: "Підготовка звіту", category: "marketing" },
  { key: "contractor_work", label: "Робота з підрядником", category: "marketing" },
  // Фінанси та офіс
  { key: "invoice", label: "Виставлення рахунку", category: "finance" },
  { key: "supplier_payment", label: "Оплата постачальнику", category: "finance" },
  { key: "payroll", label: "Нарахування зарплати", category: "finance" },
  { key: "tax_payment", label: "Податковий платіж", category: "finance" },
  { key: "contract_prepare", label: "Підготовка договору", category: "finance" },
  { key: "docs_send", label: "Відправка документів", category: "finance" },
  { key: "material_order", label: "Замовлення матеріалів", category: "finance" },
  { key: "delivery_control", label: "Контроль поставки", category: "finance" },
  { key: "inventory", label: "Інвентаризація", category: "finance" },
  { key: "household", label: "Господарська задача", category: "finance" },
  { key: "other", label: "Інше", category: "finance" },
];

export function eventTypeLabel(key: string) {
  return EVENT_TYPES.find((t) => t.key === key)?.label ?? key;
}
export function typesForCategory(cat: EventCategory) {
  return EVENT_TYPES.filter((t) => t.category === cat);
}
export function categoryOfType(key: string): EventCategory {
  return EVENT_TYPES.find((t) => t.key === key)?.category ?? "finance";
}

// Напрямки робіт → колір (HEX, працює на тёмному фоні)
export const DIRECTIONS: { key: string; label: string; color: string }[] = [
  { key: "screed", label: "Стяжка", color: "#3FB950" },
  { key: "pvc", label: "ПВХ-мембрана", color: "#3B82F6" },
  { key: "ruberoid", label: "Руберойд", color: "#A855F7" },
  { key: "insulation", label: "Утеплення", color: "#F59E0B" },
  { key: "demolition", label: "Демонтаж", color: "#EF4444" },
  { key: "plaster", label: "Машинна штукатурка", color: "#14B8A6" },
  { key: "polystyrene", label: "Полістиролбетон", color: "#84CC16" },
];

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  sales: "#CBD3DB",
  measure: "#CBD3DB",
  production: "#CBD3DB",
  management: "#B07C15",
  marketing: "#CBD3DB",
  finance: "#D89B2B",
};

export function eventColor(direction: string | null | undefined, category: string): string {
  const d = DIRECTIONS.find((x) => x.key === direction);
  if (d) return d.color;
  return CATEGORY_COLOR[(category as EventCategory) ?? "finance"] ?? "#CBD3DB";
}

export const EVENT_STATUSES: { key: string; label: string }[] = [
  { key: "planned", label: "Заплановано" },
  { key: "confirmed", label: "Підтверджено" },
  { key: "in_progress", label: "В роботі" },
  { key: "done", label: "Завершено" },
  { key: "overdue", label: "Прострочено" },
  { key: "cancelled", label: "Скасовано" },
  { key: "attention", label: "Потребує уваги" },
];
export function statusLabel(k: string) {
  return EVENT_STATUSES.find((s) => s.key === k)?.label ?? k;
}

export const PRIORITIES: { key: string; label: string }[] = [
  { key: "low", label: "Низький" },
  { key: "normal", label: "Звичайний" },
  { key: "high", label: "Високий" },
  { key: "critical", label: "Критичний" },
];

export const DEPARTMENTS: { key: string; label: string }[] = [
  { key: "management", label: "Керівництво" },
  { key: "sales", label: "Продажі" },
  { key: "marketing", label: "Маркетинг" },
  { key: "measure", label: "Заміри" },
  { key: "estimating", label: "Кошториси" },
  { key: "production", label: "Виробництво" },
  { key: "finance", label: "Фінанси" },
  { key: "supply", label: "Постачання та склад" },
  { key: "logistics", label: "Транспорт" },
  { key: "other", label: "Інше" },
];
export function departmentLabel(k?: string | null) {
  return DEPARTMENTS.find((d) => d.key === k)?.label ?? "Без відділу";
}
