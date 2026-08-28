/**
 * Ролевий склад приладової панелі (Prompt №3).
 * Кожна метрика має визначення і джерело — вони показуються у tooltip.
 */

export type DashRole = "manager" | "estimator" | "foreman" | "finance" | "director" | "admin";

export interface WidgetDef {
  id: string;
  label: string;
  /** Визначення метрики для tooltip. */
  definition: string;
  /** Джерело даних для tooltip. */
  source: string;
  group: "kpi" | "dynamics" | "actions";
}

export const WIDGETS: WidgetDef[] = [
  { id: "new_requests", label: "Нові звернення", definition: "Ліди у статусі «нове» за обраний період.", source: "CRM: leads", group: "kpi" },
  { id: "missed_calls", label: "Пропущені дзвінки", definition: "Вхідні дзвінки без відповіді за період.", source: "Binotel: calls", group: "kpi" },
  { id: "sla", label: "SLA першої реакції", definition: "Частка звернень, оброблених у нормативний час.", source: "CRM: leads, tasks", group: "kpi" },
  { id: "tasks", label: "Мої задачі", definition: "Відкриті задачі, призначені користувачу.", source: "CRM: tasks", group: "actions" },
  { id: "measurements", label: "Замери", definition: "Заплановані та виконані замери за період.", source: "CRM: tasks (тип «замір»)", group: "kpi" },
  { id: "sent_estimates", label: "Надіслані кошториси", definition: "Кошториси зі статусом «надіслано» за період.", source: "Кошториси", group: "kpi" },
  { id: "funnel", label: "Воронка", definition: "Розподіл угод за етапами воронки.", source: "CRM: leads", group: "dynamics" },
  { id: "personal_sales", label: "Особисті продажі", definition: "Сума виграних угод менеджера за період.", source: "Замовлення", group: "kpi" },

  { id: "pending_measurements", label: "Замери в очікуванні", definition: "Замери без розрахунку.", source: "CRM: tasks + кошториси", group: "kpi" },
  { id: "drafts", label: "Чернетки кошторисів", definition: "Кошториси у статусі «чернетка».", source: "Кошториси", group: "kpi" },
  { id: "blocking_errors", label: "Blocking errors", definition: "Позиції, що блокують фіналізацію кошторису.", source: "Calculation Core: blockingErrors", group: "actions" },
  { id: "no_price", label: "Позиції без ціни/коду", definition: "Рядки без підтвердженої ціни або коду довідника.", source: "Прайс-бук + Core", group: "actions" },

  { id: "active_objects", label: "Активні об'єкти", definition: "Замовлення у виробництві.", source: "Замовлення", group: "kpi" },
  { id: "deadlines", label: "Строки", definition: "Замовлення з наближеним або простроченим дедлайном.", source: "Планування", group: "actions" },
  { id: "brigades", label: "Бригади", definition: "Завантаження бригад на період.", source: "Операційний календар", group: "dynamics" },
  { id: "plan_fact", label: "План/факт", definition: "Відхилення фактичних обсягів від планових.", source: "Виробництво: план/факт", group: "dynamics" },

  { id: "payments", label: "Оплати", definition: "Сума надходжень за період.", source: "Фінанси: платежі", group: "kpi" },
  { id: "expenses", label: "Витрати", definition: "Сума витрат за період.", source: "Фінанси: витрати", group: "kpi" },
  { id: "receivables", label: "Дебіторка", definition: "Несплачений залишок за виставленими рахунками.", source: "Фінанси: рахунки", group: "kpi" },
  { id: "cash_flow", label: "Cash flow", definition: "Надходження мінус витрати за період.", source: "Фінанси", group: "dynamics" },
  { id: "taxes", label: "Податки", definition: "Нарахований ПДВ і надбавки продавця.", source: "Calculation Core: vat", group: "kpi" },
  { id: "margin", label: "Маржинальність", definition: "(Ціна − собівартість) / ціна за канонічним результатом.", source: "Calculation Core: profit", group: "kpi" },

  { id: "revenue", label: "Виручка", definition: "Сума клієнтських підсумків за період.", source: "Кошториси / замовлення", group: "kpi" },
  { id: "profit", label: "Прибуток", definition: "Виручка мінус собівартість за канонічним результатом.", source: "Calculation Core", group: "kpi" },
  { id: "marketing", label: "Маркетинг", definition: "Витрати на канали та вартість ліда.", source: "Маркетинг: budgets, leads", group: "dynamics" },
  { id: "load", label: "Завантаження виробництва", definition: "Зайнятість бригад і обладнання.", source: "Операційний календар", group: "dynamics" },
  { id: "risks", label: "Критичні ризики", definition: "Прострочення, від'ємна маржа, блокери.", source: "Core + фінанси", group: "actions" },

  { id: "integrations", label: "Інтеграції", definition: "Стан підключень keyCRM / Binotel.", source: "Integration Core", group: "kpi" },
  { id: "webhook_errors", label: "Webhook errors", definition: "Помилки вхідних вебхуків за період.", source: "Integration Core: журнал", group: "actions" },
  { id: "data_freshness", label: "Свіжість даних", definition: "Час останньої успішної синхронізації.", source: "Integration Core", group: "kpi" },
  { id: "data_quality", label: "Якість даних", definition: "Кількість відкритих проблем аудиту даних.", source: "Аудит даних", group: "actions" },
];

export const WIDGETS_BY_ID: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));

/** Набір за замовчуванням для ролі: максимум 6 KPI зверху. */
export const ROLE_LAYOUT: Record<DashRole, string[]> = {
  manager: ["new_requests", "missed_calls", "sla", "measurements", "sent_estimates", "personal_sales", "funnel", "tasks"],
  estimator: ["pending_measurements", "drafts", "blocking_errors", "no_price", "sent_estimates", "plan_fact"],
  foreman: ["active_objects", "deadlines", "brigades", "plan_fact", "risks"],
  finance: ["payments", "expenses", "receivables", "margin", "taxes", "cash_flow", "data_quality"],
  director: ["revenue", "profit", "margin", "active_objects", "funnel", "marketing", "load", "risks"],
  admin: ["integrations", "webhook_errors", "data_freshness", "data_quality", "risks"],
};

export function roleFromRoles(roles: readonly string[]): DashRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("director") || roles.includes("owner")) return "director";
  if (roles.includes("finance")) return "finance";
  if (roles.includes("foreman") || roles.includes("production")) return "foreman";
  if (roles.includes("estimator")) return "estimator";
  return "manager";
}

export type PeriodKey =
  | "today" | "yesterday" | "d7" | "last_week" | "d30" | "last_month" | "quarter" | "year" | "custom";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Сьогодні" },
  { key: "yesterday", label: "Вчора" },
  { key: "d7", label: "7 днів" },
  { key: "last_week", label: "Минулий тиждень" },
  { key: "d30", label: "30 днів" },
  { key: "last_month", label: "Минулий місяць" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Рік" },
  { key: "custom", label: "Свій діапазон" },
];

/** Межі періоду [from, to). */
export function periodRange(key: PeriodKey, now = new Date(), custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = 86_400_000;
  const today = startOfDay(now);
  switch (key) {
    case "today": return { from: today, to: new Date(today.getTime() + day) };
    case "yesterday": return { from: new Date(today.getTime() - day), to: today };
    case "d7": return { from: new Date(today.getTime() - 6 * day), to: new Date(today.getTime() + day) };
    case "last_week": {
      const dow = (today.getDay() + 6) % 7;
      const thisMon = new Date(today.getTime() - dow * day);
      return { from: new Date(thisMon.getTime() - 7 * day), to: thisMon };
    }
    case "d30": return { from: new Date(today.getTime() - 29 * day), to: new Date(today.getTime() + day) };
    case "last_month": return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 1) };
    }
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
    case "custom": {
      const from = custom?.from ? new Date(custom.from) : new Date(today.getTime() - 29 * day);
      const to = custom?.to ? new Date(new Date(custom.to).getTime() + day) : new Date(today.getTime() + day);
      return { from, to };
    }
  }
}
