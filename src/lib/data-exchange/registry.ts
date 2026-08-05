/**
 * Реєстр сутностей для універсального імпорту/експорту ERP.
 * Безпечний для клієнта: лише опис полів, без доступу до БД.
 */

export type FieldType = "text" | "number" | "date" | "datetime" | "boolean" | "json";

export type ExchangeField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Дозволені значення (enum у БД). */
  values?: string[];
};

/** Підстановка зовнішнього ключа за людською назвою (напр. «Клієнт» → clients.name). */
export type ExchangeLookup = {
  /** Колонка-ключ у цільовій таблиці (order_id, client_id...). */
  column: string;
  /** Заголовок у файлі. */
  key: string;
  label: string;
  table: string;
  /** Колонки, за якими шукаємо збіг (перша — основна для експорту). */
  matchColumns: string[];
};

export type ExchangeEntity = {
  key: string;
  label: string;
  group: string;
  table: string;
  /** Модуль для перевірки прав. */
  module: string;
  /** Колонки, за якими виконується upsert (перша непорожня). */
  matchColumns: string[];
  fields: ExchangeField[];
  lookups?: ExchangeLookup[];
  /** Колонка власника, заповнюється поточним користувачем. */
  ownerColumn?: string;
  /** Лише вивантаження. */
  exportOnly?: boolean;
  orderBy?: string;
  hint?: string;
};

const t = (key: string, label: string, extra: Partial<ExchangeField> = {}): ExchangeField => ({ key, label, type: "text", ...extra });
const n = (key: string, label: string): ExchangeField => ({ key, label, type: "number" });
const d = (key: string, label: string): ExchangeField => ({ key, label, type: "date" });
const dt = (key: string, label: string): ExchangeField => ({ key, label, type: "datetime" });
const b = (key: string, label: string): ExchangeField => ({ key, label, type: "boolean" });

const clientLookup: ExchangeLookup = {
  column: "client_id",
  key: "client_name",
  label: "Клієнт (назва)",
  table: "clients",
  matchColumns: ["name", "phone", "external_id"],
};
const orderLookup: ExchangeLookup = {
  column: "order_id",
  key: "order_number",
  label: "Замовлення (номер)",
  table: "orders",
  matchColumns: ["number", "name"],
};

export const EXCHANGE_ENTITIES: ExchangeEntity[] = [
  {
    key: "clients",
    label: "Клієнти",
    group: "CRM",
    table: "clients",
    module: "clients",
    matchColumns: ["external_id", "phone", "name"],
    ownerColumn: "owner_id",
    orderBy: "created_at",
    hint: "Ключ пошуку дублікатів: зовнішній ID → телефон → назва.",
    fields: [
      t("name", "Назва / ПІБ", { required: true }),
      t("phone", "Телефон"),
      t("email", "Email"),
      t("address", "Адреса"),
      t("status", "Статус"),
      t("notes", "Нотатки"),
      t("external_source", "Джерело (keycrm, binotel...)"),
      t("external_id", "Зовнішній ID"),
    ],
  },
  {
    key: "crm_contacts",
    label: "Контакти",
    group: "CRM",
    table: "crm_contacts",
    module: "clients",
    matchColumns: ["external_id", "phone", "full_name"],
    ownerColumn: "owner_id",
    lookups: [clientLookup],
    fields: [
      t("full_name", "ПІБ", { required: true }),
      t("phone", "Телефон"),
      t("email", "Email"),
      t("position", "Посада"),
      t("company", "Компанія"),
      t("notes", "Нотатки"),
      b("is_active", "Активний"),
      t("external_source", "Джерело"),
      t("external_id", "Зовнішній ID"),
    ],
  },
  {
    key: "crm_pipelines",
    label: "Воронки",
    group: "CRM",
    table: "crm_pipelines",
    module: "leads",
    matchColumns: ["key"],
    fields: [
      t("key", "Ключ", { required: true }),
      t("name", "Назва", { required: true }),
      t("description", "Опис"),
      b("is_default", "За замовчуванням"),
      b("is_active", "Активна"),
      n("sort_order", "Порядок"),
    ],
  },
  {
    key: "crm_stages",
    label: "Етапи воронок",
    group: "CRM",
    table: "crm_stages",
    module: "leads",
    matchColumns: ["key"],
    lookups: [{ column: "pipeline_id", key: "pipeline_key", label: "Воронка (ключ)", table: "crm_pipelines", matchColumns: ["key", "name"] }],
    fields: [
      t("key", "Ключ", { required: true }),
      t("name", "Назва", { required: true }),
      t("color", "Колір"),
      n("probability", "Ймовірність, %"),
      b("is_won", "Успішний"),
      b("is_lost", "Програний"),
      n("sort_order", "Порядок"),
    ],
  },
  {
    key: "crm_leads",
    label: "Ліди (картки воронок)",
    group: "CRM",
    table: "crm_leads",
    module: "leads",
    matchColumns: ["external_id", "title"],
    ownerColumn: "owner_id",
    lookups: [
      clientLookup,
      { column: "pipeline_id", key: "pipeline_key", label: "Воронка (ключ)", table: "crm_pipelines", matchColumns: ["key", "name"] },
      { column: "stage_id", key: "stage_key", label: "Етап (ключ)", table: "crm_stages", matchColumns: ["key", "name"] },
      { column: "contact_id", key: "contact_name", label: "Контакт (ПІБ)", table: "crm_contacts", matchColumns: ["full_name", "phone"] },
    ],
    fields: [
      t("title", "Назва картки", { required: true }),
      t("source", "Джерело"),
      t("campaign", "Кампанія"),
      t("direction", "Напрямок"),
      n("budget", "Бюджет"),
      n("area", "Площа, м²"),
      t("address", "Адреса"),
      t("district", "Район"),
      n("probability", "Ймовірність, %"),
      t("status", "Статус", { values: ["open", "won", "lost", "postponed"] }),
      t("lost_reason", "Причина програшу"),
      dt("next_action_at", "Наступна дія"),
      dt("closed_at", "Закрито"),
      t("notes", "Нотатки"),
      t("external_source", "Джерело системи"),
      t("external_id", "Зовнішній ID"),
    ],
  },
  {
    key: "crm_requests",
    label: "Звернення",
    group: "CRM",
    table: "crm_requests",
    module: "leads",
    matchColumns: ["external_id"],
    ownerColumn: "owner_id",
    fields: [
      t("channel", "Канал"),
      t("subject", "Тема"),
      t("message", "Повідомлення"),
      t("source", "Джерело"),
      t("campaign", "Кампанія"),
      t("contact_name", "Контакт"),
      t("contact_phone", "Телефон"),
      t("contact_email", "Email"),
      t("status", "Статус", { values: ["new", "in_progress", "converted", "spam", "closed"] }),
      t("external_id", "Зовнішній ID"),
    ],
  },
  {
    key: "crm_calls",
    label: "Дзвінки (Binotel)",
    group: "CRM",
    table: "crm_calls",
    module: "leads",
    matchColumns: ["external_id"],
    ownerColumn: "owner_id",
    lookups: [clientLookup],
    hint: "Формат дати: 2026-03-30 14:25 або DD.MM.YYYY HH:mm.",
    fields: [
      t("direction", "Напрямок", { values: ["inbound", "outbound"] }),
      t("from_number", "Від кого"),
      t("to_number", "Кому"),
      dt("started_at", "Початок"),
      n("duration_sec", "Тривалість, сек"),
      n("wait_seconds", "Очікування, сек"),
      t("status", "Статус"),
      t("disposition_raw", "Результат"),
      b("is_missed", "Пропущений"),
      t("recording_url", "Запис (URL)"),
      t("internal_number", "Внутрішній номер"),
      t("pbx_number", "Номер АТС"),
      t("provider", "Провайдер"),
      t("external_source", "Джерело системи"),
      t("external_id", "Зовнішній ID"),
    ],
  },
  {
    key: "crm_tasks",
    label: "Задачі",
    group: "CRM",
    table: "crm_tasks",
    module: "tasks",
    matchColumns: ["external_key", "title"],
    ownerColumn: "owner_id",
    lookups: [clientLookup, orderLookup],
    fields: [
      t("title", "Назва", { required: true }),
      t("kind", "Тип"),
      t("description", "Опис"),
      dt("due_at", "Дедлайн"),
      t("priority", "Пріоритет", { values: ["low", "normal", "high", "critical"] }),
      t("status", "Статус", { values: ["open", "done", "cancelled"] }),
      t("external_key", "Зовнішній ключ"),
    ],
  },
  {
    key: "orders",
    label: "Замовлення",
    group: "Замовлення",
    table: "orders",
    module: "orders",
    matchColumns: ["number", "name"],
    ownerColumn: "owner_id",
    lookups: [clientLookup],
    fields: [
      t("number", "Номер"),
      t("name", "Назва", { required: true }),
      t("address", "Адреса"),
      t("district", "Район"),
      t("order_type", "Тип"),
      n("floor", "Поверх"),
      b("has_lift", "Ліфт"),
      n("distance_km", "Відстань, км"),
      t("access_notes", "Умови доступу"),
      t("source", "Джерело"),
      t("crm_link", "Посилання CRM"),
      t("commercial_status", "Комерційний статус"),
      t("production_status", "Виробничий статус"),
      t("financial_status", "Фінансовий статус"),
      t("risk_level", "Ризик", { values: ["green", "yellow", "red"] }),
      dt("planned_start", "План. початок"),
      dt("planned_end", "План. завершення"),
      t("notes", "Нотатки"),
    ],
  },
  {
    key: "estimates",
    label: "Кошториси",
    group: "Замовлення",
    table: "estimates",
    module: "estimates",
    matchColumns: ["number"],
    ownerColumn: "owner_id",
    exportOnly: true,
    orderBy: "created_at",
    hint: "Кошториси лише вивантажуються — розрахунки створюються калькуляторами.",
    fields: [
      t("number", "Номер"),
      t("module", "Модуль"),
      t("status", "Статус"),
      t("client_name", "Клієнт"),
      t("client_phone", "Телефон"),
      t("address", "Адреса"),
      t("manager", "Менеджер"),
      n("area", "Площа"),
      n("total_client", "Сума клієнта"),
      n("total_cost", "Собівартість"),
      n("gross_profit", "Валовий прибуток"),
      n("margin_percent", "Маржа, %"),
      dt("created_at", "Створено"),
    ],
  },
  {
    key: "invoices",
    label: "Рахунки",
    group: "Фінанси",
    table: "invoices",
    module: "finance",
    matchColumns: ["number"],
    lookups: [clientLookup, orderLookup],
    fields: [
      t("number", "Номер"),
      t("kind", "Тип", { values: ["advance", "stage", "final", "other"] }),
      t("status", "Статус", { values: ["draft", "issued", "partial", "paid", "overdue", "cancelled"] }),
      d("issue_date", "Дата виставлення"),
      d("due_date", "Термін оплати"),
      n("total", "Сума"),
      t("note", "Примітка"),
    ],
  },
  {
    key: "payments",
    label: "Платежі (банківські виписки)",
    group: "Фінанси",
    table: "payments",
    module: "payments",
    matchColumns: [],
    lookups: [
      orderLookup,
      { column: "invoice_id", key: "invoice_number", label: "Рахунок (номер)", table: "invoices", matchColumns: ["number"] },
      { column: "account_id", key: "account_name", label: "Каса/рахунок", table: "finance_accounts", matchColumns: ["name"] },
    ],
    hint: "Підходить для виписки банку: дата, сума, напрямок (in/out), призначення.",
    fields: [
      t("direction", "Напрямок", { required: true, values: ["in", "out"] }),
      n("amount", "Сума"),
      d("paid_at", "Дата"),
      t("method", "Спосіб"),
      t("note", "Призначення"),
    ],
  },
  {
    key: "expenses",
    label: "Витрати",
    group: "Фінанси",
    table: "expenses",
    module: "expenses",
    matchColumns: [],
    lookups: [orderLookup, { column: "account_id", key: "account_name", label: "Каса/рахунок", table: "finance_accounts", matchColumns: ["name"] }],
    fields: [
      t("name", "Назва", { required: true }),
      t("category", "Категорія"),
      n("amount", "Сума"),
      d("spent_at", "Дата"),
      t("supplier", "Постачальник"),
      t("note", "Примітка"),
    ],
  },
  {
    key: "finance_accounts",
    label: "Каси та рахунки",
    group: "Фінанси",
    table: "finance_accounts",
    module: "finance",
    matchColumns: ["name"],
    fields: [
      t("name", "Назва", { required: true }),
      t("kind", "Тип"),
      t("currency", "Валюта"),
      n("opening_balance", "Початковий залишок"),
      b("archived", "Архів"),
    ],
  },
  {
    key: "warehouses",
    label: "Склади",
    group: "Склад",
    table: "warehouses",
    module: "warehouse",
    matchColumns: ["name"],
    fields: [
      t("name", "Назва", { required: true }),
      t("kind", "Тип"),
      t("address", "Адреса"),
      b("is_default", "Основний"),
      b("archived", "Архів"),
    ],
  },
  {
    key: "stock_items",
    label: "Номенклатура складу",
    group: "Склад",
    table: "stock_items",
    module: "warehouse",
    matchColumns: ["sku", "name"],
    fields: [
      t("name", "Назва", { required: true }),
      t("sku", "Артикул"),
      t("unit", "Од. виміру"),
      t("category", "Категорія"),
      t("module", "Модуль"),
      n("min_qty", "Мін. запас"),
      n("avg_cost", "Середня собівартість"),
      b("archived", "Архів"),
    ],
  },
  {
    key: "stock_balances",
    label: "Залишки складу",
    group: "Склад",
    table: "stock_balances",
    module: "warehouse",
    matchColumns: [],
    exportOnly: true,
    orderBy: "updated_at",
    hint: "Залишки змінюються лише документами руху та інвентаризацією.",
    lookups: [
      { column: "warehouse_id", key: "warehouse_name", label: "Склад", table: "warehouses", matchColumns: ["name"] },
      { column: "item_id", key: "item_name", label: "Номенклатура", table: "stock_items", matchColumns: ["name", "sku"] },
    ],
    fields: [n("qty", "Кількість"), n("reserved_qty", "Резерв")],
  },
  {
    key: "catalog_items",
    label: "Каталог (матеріали, роботи)",
    group: "Довідники",
    table: "catalog_items",
    module: "materials",
    matchColumns: ["code", "name"],
    fields: [
      t("module", "Модуль", { required: true }),
      t("kind", "Вид", { required: true, values: ["material", "work", "equipment", "logistics"] }),
      t("code", "Код"),
      t("name", "Назва", { required: true }),
      t("unit", "Од. виміру", { required: true }),
      n("buy_price", "Собівартість"),
      n("sell_price", "Ціна продажу"),
      n("sell_price_t50", "Ціна ≤50 м²"),
      n("sell_price_t100", "Ціна 50–100 м²"),
      n("sell_price_t250", "Ціна 100–250 м²"),
      n("sell_price_t500", "Ціна >250 м²"),
      b("is_active", "Активна"),
      n("sort_order", "Порядок"),
    ],
  },
];

export function getEntity(key: string): ExchangeEntity | undefined {
  return EXCHANGE_ENTITIES.find((e) => e.key === key);
}

/** Усі заголовки файлу для сутності (поля + підстановки). */
export function entityHeaders(entity: ExchangeEntity): { key: string; label: string }[] {
  return [
    ...(entity.lookups ?? []).map((l) => ({ key: l.key, label: l.label })),
    ...entity.fields.map((f) => ({ key: f.key, label: f.label })),
  ];
}
