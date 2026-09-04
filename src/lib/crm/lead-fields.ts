/**
 * Клієнт-безпечний опис додаткових полів картки ліда.
 * Значення зберігаються у crm_leads.tags -> { fields: {...} }.
 */
export type LeadFieldType = "text" | "number" | "bool" | "select" | "date";

export interface LeadFieldDef {
  key: string;
  label: string;
  type: LeadFieldType;
  options?: string[];
  group: "object" | "contract" | "utm";
}

export const LEAD_CUSTOM_FIELDS: LeadFieldDef[] = [
  { key: "measure_done", label: "Замір", type: "bool", group: "object" },
  { key: "service_type", label: "Тип послуги", type: "select", group: "object",
    options: ["Стяжка", "ПВХ мембрана", "Руберойд", "Утеплення", "Демонтаж", "Інше"] },
  { key: "object_type", label: "Тип об'єкта", type: "select", group: "object",
    options: ["Квартира", "Будинок", "Комерція", "Промисловість", "Дах", "Інше"] },
  { key: "object_area", label: "Площа об'єкта, м²", type: "number", group: "object" },
  { key: "perimeter", label: "Периметр, м", type: "number", group: "object" },
  { key: "layer_thickness", label: "Товщина шару, см", type: "number", group: "object" },
  { key: "mesh", label: "Армування сіткою", type: "bool", group: "object" },
  { key: "insulation", label: "Утеплення", type: "text", group: "object" },
  { key: "warm_floor", label: "Тепла підлога", type: "bool", group: "object" },
  { key: "object_address", label: "Адреса об'єкта", type: "text", group: "object" },
  { key: "client_full_name", label: "ПІБ клієнта", type: "text", group: "contract" },
  { key: "passport", label: "Паспорт / документ замовника", type: "text", group: "contract" },
  { key: "contract_sum", label: "Сума договору, ₴", type: "number", group: "contract" },
  { key: "advance_payment", label: "Авансовий платіж, ₴", type: "number", group: "contract" },
  { key: "contract_number", label: "Номер договору", type: "text", group: "contract" },
  { key: "work_deadline", label: "Строк виконання робіт", type: "text", group: "contract" },
  { key: "utm_source", label: "UTM Source", type: "text", group: "utm" },
  { key: "utm_medium", label: "UTM Medium", type: "text", group: "utm" },
  { key: "utm_campaign", label: "UTM Campaign", type: "text", group: "utm" },
  { key: "utm_content", label: "UTM Content", type: "text", group: "utm" },
  { key: "utm_term", label: "UTM Term", type: "text", group: "utm" },
  { key: "gclid", label: "GCLID", type: "text", group: "utm" },
  { key: "fbclid", label: "FBCLID", type: "text", group: "utm" },
  { key: "landing_page", label: "Landing Page", type: "text", group: "utm" },
  { key: "external_lead_id", label: "External Lead ID", type: "text", group: "utm" },
];

export const LEAD_FIELD_GROUPS: { key: LeadFieldDef["group"]; label: string }[] = [
  { key: "object", label: "Дані об'єкта" },
  { key: "contract", label: "Договір" },
  { key: "utm", label: "Маркетинг / UTM" },
];
