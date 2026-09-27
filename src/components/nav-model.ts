/**
 * Єдина інформаційна архітектура бокового меню (Prompt №3, UI v2).
 *
 * Перший рівень — 10 розділів, згрупованих у блоки меню:
 * Продажі / Операції / Склад / Фінанси / Аналітика / Налаштування.
 * Нічого не видалено функціонально: матеріали, роботи, логістика, обладнання,
 * інтеграції, конструктор напрямків тощо перенесені у відповідні підрозділи.
 */

import { moduleLabel } from "@/lib/modules";

export interface NavChild {

  to: string;
  label: string;
  /** Пошуковий параметр для сторінок довідників (module=...). */
  search?: Record<string, string>;
}

export type NavGroupKey = "sales" | "operations" | "warehouse" | "finance" | "analytics" | "settings";

/** Блоки бокового меню (заголовки груп). Порядок = порядок у меню. */
export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
  { key: "sales", label: "Продажі" },
  { key: "operations", label: "Операції" },
  { key: "warehouse", label: "Склад" },
  { key: "finance", label: "Фінанси" },
  { key: "analytics", label: "Аналітика" },
  { key: "settings", label: "Налаштування" },
];

export interface NavSection {
  key: string;
  label: string;
  to: string;
  /** Блок меню; без групи — верхній рівень (Дашборд). */
  group?: NavGroupKey;
  /** Ролі, яким доступний розділ. Порожньо — доступний усім. */
  roles?: string[];
  children: NavChild[];
}

export const MODULE_KEYS = ["screed", "roofing_pvc", "roofing_rub", "insulation", "demolition"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Підписи беруться з канонічного реєстру модулів (src/lib/modules.ts). */
export const MODULE_LABEL: Record<ModuleKey, string> = MODULE_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: moduleLabel(key) }),
  {} as Record<ModuleKey, string>,
);


export const NAV_SECTIONS: NavSection[] = [
  { key: "dashboard", label: "Дашборд", to: "/", children: [] },
  {
    key: "crm",
    label: "CRM",
    group: "sales",
    to: "/crm",
    children: [
      { to: "/crm", label: "Панель CRM" },
      { to: "/crm/leads", label: "Ліди" },
      { to: "/crm/measurements", label: "Заміри" },
      { to: "/crm/tasks", label: "Задачі" },
      { to: "/crm/calls", label: "Дзвінки та повідомлення" },
      { to: "/clients", label: "Клієнти" },
    ],
  },
  {
    key: "calc",
    label: "Розрахунки",
    group: "sales",
    to: "/calc",
    children: [
      { to: "/calc", label: "Напрямки розрахунку" },
      ...MODULE_KEYS.map((m) => ({ to: `/${m}`, label: MODULE_LABEL[m] })),
    ],
  },
  {
    key: "estimates",
    label: "Кошториси і КП",
    group: "sales",
    to: "/history",
    children: [
      { to: "/history", label: "Кошториси і КП" },
      { to: "/data-exchange", label: "Імпорт та експорт" },
    ],
  },
  {
    key: "orders",
    label: "Замовлення і виробництво",
    group: "operations",
    to: "/orders",
    children: [
      { to: "/orders", label: "Замовлення" },
      { to: "/production", label: "Виробництво, план/факт" },
      { to: "/equipment", label: "Обладнання" },
    ],
  },
  {
    key: "calendar",
    label: "Календар",
    group: "operations",
    to: "/operations",
    children: [
      { to: "/operations", label: "Усі календарі" },
      { to: "/operations", label: "Фінансовий календар", search: { cal: "finance" } },
      { to: "/operations", label: "Операційний (виробництво)", search: { cal: "production" } },
      { to: "/operations", label: "Календар замірів", search: { cal: "measure" } },
      { to: "/operations", label: "Адмін-управлінський", search: { cal: "management" } },
      { to: "/crm/measurements", label: "Заміри: список і статуси" },
    ],
  },
  {
    key: "warehouse",
    label: "Склад",
    group: "warehouse",
    to: "/warehouse",
    children: [
      { to: "/warehouse", label: "Запаси" },
      { to: "/warehouse/receipts", label: "Приходи" },
      { to: "/warehouse/issues", label: "Видачі" },
      { to: "/warehouse/monthly", label: "Звіт за місяці" },
    ],
  },
  {
    key: "finance",
    label: "Фінанси",
    group: "finance",
    to: "/finance",
    children: [
      { to: "/finance", label: "Огляд і cash flow", search: { tab: "overview" } },
      { to: "/finance", label: "Операції", search: { tab: "operations" } },
      { to: "/finance", label: "План/факт", search: { tab: "planfact" } },
      { to: "/finance", label: "Звірка", search: { tab: "reconcile" } },
      { to: "/finance", label: "Finmap", search: { tab: "finmap" } },
      { to: "/finance", label: "ФОТ і KPI", search: { tab: "payroll" } },
      { to: "/finance", label: "Дебіторка", search: { tab: "receivables" } },
      { to: "/finance", label: "Кредиторка", search: { tab: "payables" } },
      { to: "/finance", label: "Каса по проєктах", search: { tab: "projects" } },
      { to: "/finance", label: "Рахунки, платежі, витрати", search: { tab: "invoices" } },
    ],
  },

  {
    key: "analytics",
    label: "Аналітика",
    group: "analytics",
    to: "/reports",
    children: [
      { to: "/reports/ceo", label: "CEO-звіт" },
      { to: "/reports/finance-ceo", label: "Фінанси компанії" },
      { to: "/settings/sales-plan", label: "План продажів" },
      { to: "/reports", label: "Продажі та виробництво" },
      { to: "/marketing", label: "Маркетинг" },
      { to: "/data-audit", label: "Якість даних" },
    ],

  },
  {
    key: "settings",
    label: "Налаштування",
    group: "settings",
    to: "/settings",
    roles: ["admin", "director", "finance"],
    children: [
      { to: "/settings", label: "Загальні, податки, документи" },
      { to: "/settings/sales-plan", label: "План продажів" },
      { to: "/materials", label: "Каталог матеріалів" },
      { to: "/works", label: "Роботи" },
      { to: "/logistics", label: "Логістика" },
      { to: "/equipment", label: "Обладнання і амортизація" },
      { to: "/directions-editor", label: "Напрямки (конструктор)" },
      { to: "/access", label: "Користувачі та ролі" },
      { to: "/integrations", label: "Інтеграції, API, webhooks" },
      { to: "/crm/intake", label: "Вхідні ліди (API webhook)" },
      { to: "/settings/control-center", label: "Control Center (правила)" },

      { to: "/branding", label: "Брендинг" },
    ],
  },
];

/** Нижня панель вкладок на мобільному (< md). «Ще» відкриває повне меню. */
export interface MobileTab {
  key: "dashboard" | "leads" | "measurements" | "calendar" | "more";
  label: string;
  to?: string;
  /** Шляхи, на яких вкладка вважається активною. */
  match?: string[];
}

export const MOBILE_TABS: MobileTab[] = [
  { key: "dashboard", label: "Дашборд", to: "/", match: ["/"] },
  { key: "leads", label: "Ліди", to: "/crm/leads", match: ["/crm/leads", "/crm"] },
  { key: "measurements", label: "Заміри", to: "/crm/measurements", match: ["/crm/measurements"] },
  { key: "calendar", label: "Календар", to: "/operations", match: ["/operations"] },
  { key: "more", label: "Ще" },
];

/** Активна вкладка мобільної панелі за шляхом (найдовший збіг). */
export function activeMobileTab(pathname: string): MobileTab["key"] | null {
  if (pathname === "/") return "dashboard";
  let best: { key: MobileTab["key"]; len: number } | null = null;
  for (const t of MOBILE_TABS) {
    for (const m of t.match ?? []) {
      if (m === "/") continue;
      if ((pathname === m || pathname.startsWith(`${m}/`)) && (!best || m.length > best.len)) best = { key: t.key, len: m.length };
    }
  }
  return best?.key ?? null;
}

/** Розділи, доступні набору ролей користувача. */
export function navForRoles(
  roles: readonly string[],
  moduleViews?: readonly { id: string; label: string; route: string | null; visible: boolean }[],
): NavSection[] {
  return NAV_SECTIONS
    .filter((s) => !s.roles || s.roles.some((r) => roles.includes(r)))
    .map((section) => {
      if (section.key !== "calc" || !moduleViews) return section;
      return {
        ...section,
        children: [
          section.children[0],
          ...moduleViews
            .filter((module) => module.visible && module.route)
            .map((module) => ({ to: module.route as string, label: module.label })),
        ],
      };
    });
}

/** Активний розділ за поточним шляхом. */
export function activeSectionKey(pathname: string): string | null {
  if (pathname === "/") return "dashboard";
  let best: { key: string; len: number } | null = null;
  for (const s of NAV_SECTIONS) {
    for (const c of s.children) {
      if (pathname === c.to || pathname.startsWith(`${c.to}/`)) {
        if (!best || c.to.length > best.len) best = { key: s.key, len: c.to.length };
      }
    }
  }
  return best?.key ?? null;
}
