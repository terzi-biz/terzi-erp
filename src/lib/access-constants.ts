/** Спільні довідники модуля «Доступи і ролі» (безпечні для клієнта). */
export type AccessScope = "own" | "assigned" | "department" | "company" | "custom";
export type AccessStatus = "invited" | "pending" | "active" | "suspended" | "blocked" | "dismissed" | "archived";

export const ACCESS_MODULES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Головна панель" },
  { key: "leads", label: "Ліди" },
  { key: "clients", label: "Клієнти" },
  { key: "objects", label: "Об'єкти" },
  { key: "measurements", label: "Заміри" },
  { key: "estimates", label: "Кошториси" },
  { key: "proposals", label: "Комерційні пропозиції" },
  { key: "contracts", label: "Договори" },
  { key: "production", label: "Виробництво" },
  { key: "calendar", label: "Календар" },
  { key: "tasks", label: "Задачі" },
  { key: "materials", label: "Матеріали" },
  { key: "warehouse", label: "Склад" },
  { key: "payments", label: "Платежі" },
  { key: "expenses", label: "Витрати" },
  { key: "finance", label: "Фінанси" },
  { key: "reports", label: "Звіти" },
  { key: "staff", label: "Співробітники" },
  { key: "settings", label: "Налаштування" },
  { key: "integrations", label: "Інтеграції" },
  { key: "audit", label: "Журнал дій" },
];

export const ACCESS_ACTIONS: { key: string; label: string; critical?: boolean }[] = [
  { key: "view", label: "Перегляд" },
  { key: "create", label: "Створення" },
  { key: "edit", label: "Редагування" },
  { key: "change_status", label: "Зміна статусу" },
  { key: "assign", label: "Призначення" },
  { key: "approve", label: "Погодження" },
  { key: "archive", label: "Архівування" },
  { key: "restore", label: "Відновлення" },
  { key: "delete_line", label: "Видалення позиції" },
  { key: "hard_delete", label: "Остаточне видалення", critical: true },
  { key: "export", label: "Експорт", critical: true },
  { key: "bulk_edit", label: "Масове редагування", critical: true },
  { key: "manage_settings", label: "Керування налаштуваннями", critical: true },
];

export const SCOPE_LABELS: Record<AccessScope, string> = {
  own: "Лише власні записи",
  assigned: "Призначені записи",
  department: "Записи свого відділу",
  company: "Усі записи компанії",
  custom: "Вибіркові напрямки/модулі",
};

export const STATUS_LABELS: Record<AccessStatus, string> = {
  invited: "Запрошений",
  pending: "Очікує підтвердження",
  active: "Активний",
  suspended: "Тимчасово призупинений",
  blocked: "Заблокований",
  dismissed: "Звільнений",
  archived: "Архівний",
};
