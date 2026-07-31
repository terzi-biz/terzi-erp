/** Довідники keyCRM, безпечні для клієнта (UI + сервер). */

export type SyncMode = "off" | "erp_master" | "external_master" | "bidirectional";

export const SYNC_MODE_LABEL: Record<SyncMode, string> = {
  off: "Вимкнено",
  erp_master: "ERP TERZI — головна",
  external_master: "keyCRM — головна",
  bidirectional: "Двостороння",
};

export const SYNC_MODE_HINT: Record<SyncMode, string> = {
  off: "Дані не синхронізуються",
  erp_master: "Зміни передаються з ERP у keyCRM",
  external_master: "Зміни приходять із keyCRM в ERP",
  bidirectional: "Зміни в обидві сторони, конфлікти — у чергу",
};

export type KeyCrmEntityDef = {
  key: string;
  label: string;
  /** Стандартний шлях Open API. Редагується у маніфесті провайдера. */
  path: string;
  /** Чи вміє адаптер писати цю сутність назад у keyCRM. */
  outbound: boolean;
  /** Куди лягає в ERP; reference — зберігається як довідник у звʼязках. */
  target: "crm_leads" | "crm_contacts" | "clients" | "crm_pipelines" | "crm_stages" | "reference";
  note?: string;
};

/** Порядок важливий: довідники синхронізуються раніше за записи. */
export const KEYCRM_ENTITIES: KeyCrmEntityDef[] = [
  { key: "pipelines", label: "Воронки", path: "/pipelines", outbound: false, target: "crm_pipelines" },
  { key: "pipeline_statuses", label: "Статуси воронок", path: "/pipelines", outbound: false, target: "crm_stages", note: "Читаються по кожній воронці" },
  { key: "order_statuses", label: "Статуси замовлень", path: "/order/status", outbound: false, target: "reference" },
  { key: "sources", label: "Джерела", path: "/order/source", outbound: false, target: "reference" },
  { key: "managers", label: "Відповідальні", path: "/users", outbound: false, target: "reference" },
  { key: "custom_fields", label: "Додаткові поля", path: "/custom-fields", outbound: false, target: "reference" },

  { key: "companies", label: "Компанії", path: "/companies", outbound: false, target: "reference" },
  { key: "buyers", label: "Клієнти та покупці", path: "/buyer", outbound: true, target: "crm_contacts" },
  { key: "lead_cards", label: "Картки воронки (ліди)", path: "/pipelines/cards", outbound: true, target: "crm_leads" },
  { key: "orders", label: "Замовлення", path: "/order", outbound: false, target: "reference" },
  { key: "payments", label: "Оплати", path: "/order", outbound: false, target: "reference", note: "Читаються з поля payments замовлення" },
  { key: "comments", label: "Коментарі", path: "/pipelines/cards", outbound: false, target: "reference", note: "Читаються з карток воронки" },
];

export const KEYCRM_WEBHOOK_EVENTS = [
  { key: "order.change_order_status", label: "Зміна статусу замовлення" },
  { key: "order.change_payment_status", label: "Зміна статусу оплати" },
  { key: "lead.change_lead_status", label: "Зміна статусу ліда" },
];

export const KEYCRM_BASE_URL = "https://openapi.keycrm.app/v1";
export const KEYCRM_RPM = 60;
