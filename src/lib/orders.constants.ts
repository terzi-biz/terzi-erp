/** Довідники статусів і послуг замовлення (клієнт-безпечний модуль). */
export const COMMERCIAL_STATUSES = [
  "new","qualification","measurement_scheduled","measurement_done","calculation",
  "estimate_sent","negotiation","contract","awaiting_prepayment","sold","refused","postponed",
] as const;
export const PRODUCTION_STATUSES = [
  "not_planned","preparation","awaiting_materials","ready_to_plan","planned",
  "crew_assigned","in_progress","paused","works_done","acceptance","remarks","handed_over","warranty",
] as const;
export const FINANCIAL_STATUSES = [
  "no_invoice","awaiting_payment","partial_payment","prepayment_received",
  "has_debt","paid","financially_closed",
] as const;
export const ORDER_SERVICES = [
  "screed","roofing_pvc","roofing_ruberoid","insulation","demolition","plaster","polybeton","other",
] as const;
export const RISK_LEVELS = ["green","yellow","red"] as const;

export const COMMERCIAL_LABELS: Record<string,string> = {
  new: "Новий", qualification: "Кваліфікація", measurement_scheduled: "Замір призначено",
  measurement_done: "Замір виконано", calculation: "Розрахунок", estimate_sent: "Смета надіслана",
  negotiation: "Переговори", contract: "Договір", awaiting_prepayment: "Очікує передоплату",
  sold: "Продано", refused: "Відмова", postponed: "Відкладено",
};
export const PRODUCTION_LABELS: Record<string,string> = {
  not_planned: "Не запланований", preparation: "Підготовка", awaiting_materials: "Очікує матеріали",
  ready_to_plan: "Готовий до планування", planned: "Заплановано", crew_assigned: "Бригада призначена",
  in_progress: "В роботі", paused: "Призупинено", works_done: "Роботи виконані",
  acceptance: "Приймання", remarks: "Зауваження", handed_over: "Об'єкт зданий", warranty: "Гарантія",
};
export const FINANCIAL_LABELS: Record<string,string> = {
  no_invoice: "Рахунок не виставлено", awaiting_payment: "Очікує оплату", partial_payment: "Часткова оплата",
  prepayment_received: "Передоплата отримана", has_debt: "Є заборгованість", paid: "Оплачено",
  financially_closed: "Фінансово закритий",
};
export const SERVICE_LABELS: Record<string,string> = {
  screed: "Стяжка", roofing_pvc: "ПВХ-мембрана", roofing_ruberoid: "Рубероїд/Акваізол",
  insulation: "Утеплення", demolition: "Демонтаж", plaster: "Штукатурка",
  polybeton: "Полістиролбетон", other: "Інше",
};
export const RISK_LABELS: Record<string,string> = { green: "Зелений", yellow: "Жовтий", red: "Червоний" };
