/**
 * Єдина інформаційна архітектура бокового меню (Prompt №3).
 *
 * Перший рівень — рівно 8 розділів. Нічого не видалено функціонально:
 * матеріали, роботи, логістика, обладнання, інтеграції, конструктор напрямків
 * тощо перенесені у відповідні підрозділи.
 */

import { moduleLabel } from "@/lib/modules";

export interface NavChild {

  to: string;
  label: string;
  /** Пошуковий параметр для сторінок довідників (module=...). */
  search?: Record<string, string>;
}

export interface NavSection {
  key: string;
  label: string;
  to: string;
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
    to: "/crm",
    children: [
      { to: "/crm", label: "Панель CRM" },
      { to: "/crm/requests", label: "Звернення" },
      { to: "/crm/leads", label: "Ліди" },
      { to: "/crm/intake", label: "Вхідні ліди" },
      { to: "/clients", label: "Клієнти" },
      { to: "/crm/contacts", label: "Контакти" },
      { to: "/crm/calls", label: "Дзвінки та повідомлення" },
      { to: "/crm/tasks", label: "Задачі та замери" },
    ],
  },
  {
    key: "calc",
    label: "Розрахунки",
    to: "/calc",
    children: [
      { to: "/calc", label: "Напрямки розрахунку" },
      ...MODULE_KEYS.map((m) => ({ to: `/${m}`, label: MODULE_LABEL[m] })),
    ],
  },
  {
    key: "estimates",
    label: "Кошториси і КП",
    to: "/history",
    children: [
      { to: "/history", label: "Кошториси і КП" },
      { to: "/data-exchange", label: "Імпорт та експорт" },
    ],
  },
  {
    key: "orders",
    label: "Замовлення і виробництво",
    to: "/orders",
    children: [
      { to: "/orders", label: "Замовлення" },
      { to: "/operations", label: "Планування і бригади" },
      { to: "/production", label: "Виробництво, план/факт" },
      { to: "/warehouse", label: "Склад і закупівлі" },
      { to: "/equipment", label: "Обладнання" },
    ],
  },
  {
    key: "finance",
    label: "Фінанси",
    to: "/finance",
    children: [{ to: "/finance", label: "Оплати, витрати, борги, прибутковість" }],
  },
  {
    key: "analytics",
    label: "Аналітика",
    to: "/reports",
    children: [
      { to: "/reports", label: "Продажі та виробництво" },
      { to: "/marketing", label: "Маркетинг" },
      { to: "/data-audit", label: "Якість даних" },
    ],
  },
  {
    key: "settings",
    label: "Налаштування",
    to: "/settings",
    roles: ["admin", "director", "finance"],
    children: [
      { to: "/settings", label: "Загальні, податки, документи" },
      { to: "/materials", label: "Каталог матеріалів" },
      { to: "/works", label: "Роботи" },
      { to: "/logistics", label: "Логістика" },
      { to: "/equipment", label: "Обладнання і амортизація" },
      { to: "/directions-editor", label: "Напрямки (конструктор)" },
      { to: "/access", label: "Користувачі та ролі" },
      { to: "/integrations", label: "Інтеграції, API, webhooks" },
      { to: "/branding", label: "Брендинг" },
    ],
  },
];

/** Розділи, доступні набору ролей користувача. */
export function navForRoles(roles: readonly string[]): NavSection[] {
  return NAV_SECTIONS.filter((s) => !s.roles || s.roles.some((r) => roles.includes(r)));
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
