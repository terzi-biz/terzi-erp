/**
 * Затверджені схеми оплати та KPI TERZI (джерело: KPI_TERZI.xlsx).
 * Значення тут — стартові шаблони для створення схеми оплати співробітника.
 * Після застосування шаблону ставки й пороги редагуються у схемі оплати —
 * розрахунок завжди бере збережену схему, а не цей файл.
 */

import type { KpiRule } from "./payroll-engine";

export type PayrollGroup = "administrative" | "commercial" | "production";

export type KpiTemplate = {
  key: string;
  position: string;
  group: PayrollGroup;
  base_salary: number;
  advance_percent: number;
  /** Цільовий місячний бонус за повного виконання KPI. */
  target_bonus: number;
  /** Обов'язковий функціонал — умова виплати ставки. */
  must_have: string[];
  kpi_scheme: KpiRule[];
  draft?: boolean;
};

export const KPI_TEMPLATES: KpiTemplate[] = [
  {
    key: "executive_director",
    position: "Виконавчий директор",
    group: "commercial",
    base_salary: 60000,
    advance_percent: 50,
    target_bonus: 57000,
    must_have: [
      "Контроль CRM і роботи відділу продажів",
      "Кошториси та КП підготовлені за стандартом",
      "Регламенти, наради, управлінська звітність",
    ],
    kpi_scheme: [
      {
        code: "GROSS_MARGIN_COMPANY",
        title: "KPI 1. Валова маржа компанії (вага 50%)",
        kpi_type: "SCALE_ABS",
        weight: 50,
        note: "Факт — валова маржа компанії за місяць, грн.",
        tiers: [
          { from: 0, bonus: 0, label: "до 500 тис" },
          { from: 500000, bonus: 10000, label: "500–600 тис" },
          { from: 600000, bonus: 15000, label: "600 тис – 1 млн" },
          { from: 1000000, bonus: 20000, label: "понад 1 млн" },
        ],
      },
      {
        code: "SALES_PLAN",
        title: "KPI 2. Виконання плану продажів (вага 30%)",
        kpi_type: "SCALE_PLAN",
        weight: 30,
        target: 2500000,
        note: "Факт — сума продажів за місяць; ціль — план продажів.",
        tiers: [
          { from: 0, bonus: 0, label: "менше 90%" },
          { from: 90, bonus: 10000, label: "90–99%" },
          { from: 100, bonus: 15000, label: "100%" },
          { from: 101, bonus: 20000, label: "понад 100%" },
        ],
      },
      {
        code: "SALES_CONVERSION",
        title: "KPI 3. Конверсія продажів (вага 15%)",
        kpi_type: "SCALE_PLAN",
        weight: 15,
        target: 100,
        note: "Лід → замір → кошторис → договір. Факт — % досягнення цільової конверсії.",
        tiers: [
          { from: 0, bonus: 0, label: "менше 80% цілі" },
          { from: 80, bonus: 3000, label: "80–99%" },
          { from: 100, bonus: 5000, label: "100–109%" },
          { from: 110, bonus: 7000, label: "понад 110%" },
        ],
      },
      {
        code: "TRANSFORMATION",
        title: "KPI 4. Впровадження системи (тільки період трансформації)",
        kpi_type: "CHECKLIST",
        rate: 10000,
        items: 5,
        note: "CRM, регламенти, звіти, структура відділу продажів, стандарти кошторисів.",
      },
    ],
  },
  {
    key: "assistant_director",
    position: "Помічник виконавчого директора",
    group: "administrative",
    base_salary: 30000,
    advance_percent: 50,
    target_bonus: 13000,
    must_have: [
      "Реєстр задач і доручень",
      "CRM зі свіжими статусами",
      "Документи за шаблонами (договори, КП, кошториси, акти, рахунки)",
      "Щоденні та тижневі зведення",
    ],
    kpi_scheme: [
      {
        code: "TASKS_ON_TIME",
        title: "KPI 1. Контроль доручень і строків",
        kpi_type: "SCALE_PLAN",
        target: 95,
        rate: 5000,
        note: "Факт — % доручень, закритих у строк (норматив 95%, без загублених задач).",
        tiers: [
          { from: 0, bonus: 0, label: "менше 95% нормативу" },
          { from: 100, bonus: 5000, label: "норматив виконано" },
        ],
      },
      {
        code: "CRM_DOCS",
        title: "KPI 2. CRM і документи",
        kpi_type: "CHECKLIST",
        rate: 5000,
        items: 2,
        note: "95%+ об'єктів з актуальним статусом; 100% договорів, КП і кошторисів завантажені.",
      },
      {
        code: "REPORTING_DISCIPLINE",
        title: "KPI 3. Звітність та операційна дисципліна",
        kpi_type: "CHECKLIST",
        rate: 3000,
        items: 3,
        note: "Щоденний звіт вчасно; тижневе зведення вчасно; не більше одного зауваження за місяць.",
      },
    ],
  },
  {
    key: "financier",
    position: "Фінансист",
    group: "administrative",
    base_salary: 35000,
    advance_percent: 50,
    target_bonus: 14000,
    must_have: [
      "100% транзакцій коректно внесені в ERP/Finmap",
      "Відсутність критичних помилок",
      "Своєчасна звірка даних ЗП",
      "Супровід планування доходів і витрат",
    ],
    kpi_scheme: [
      {
        code: "AR_CONTROL",
        title: "KPI 1. Контроль дебіторської заборгованості (20%)",
        kpi_type: "CHECKLIST",
        weight: 20,
        rate: 5000,
        items: 3,
        note: "Weekly AR-звіт без пропусків; підсвічені відхилення й ризики; аналіз динаміки закриття.",
      },
      {
        code: "WEEKLY_REPORT",
        title: "KPI 2. Weekly report і комунікація (40%)",
        kpi_type: "CHECKLIST",
        weight: 40,
        rate: 4000,
        items: 3,
        note: "Звіт щотижня; структуровані коментарі; за шаблоном.",
      },
      {
        code: "MONTHLY_CLOSE",
        title: "KPI 3. Місячна звітність (40%)",
        kpi_type: "CHECKLIST",
        weight: 40,
        rate: 5000,
        items: 3,
        note: "Закриття місяця у строк; коректний дашборд; факт/план з висновками.",
      },
      {
        code: "FINMAP_ROLLOUT",
        title: "KPI 4. Впровадження системи (знімається після проєкту)",
        kpi_type: "CHECKLIST",
        rate: 5000,
        items: 2,
        note: "Налаштування та впровадження Finmap; регламенти команди і контроль виконання.",
      },
    ],
  },
  {
    key: "sales_manager",
    position: "Менеджер з продажів",
    group: "commercial",
    base_salary: 50000,
    advance_percent: 50,
    target_bonus: 37500,
    must_have: [
      "Бонус тільки від валової маржі виконаних і оплачених об'єктів",
      "Аванси та непідтверджена дебіторка в розрахунок не беруться",
    ],
    kpi_scheme: [
      {
        code: "GROSS_MARGIN_PERSONAL",
        title: "Бонус від валової маржі особистих об'єктів",
        kpi_type: "MARGIN_PERCENT_BY_PLAN",
        target: 1200000,
        note: "База — валова маржа оплачених і виконаних об'єктів: виручка − матеріали − прямий ФОП − субпідряд − амортизація.",
        tiers: [
          { from: 0, percent: 2, label: "до 80% плану" },
          { from: 80, percent: 3, label: "80–99% плану" },
          { from: 100, percent: 4, label: "100–119% плану" },
          { from: 120, percent: 5, label: "120% і більше" },
        ],
      },
      {
        code: "LEAD_TO_CONTRACT",
        title: "KPI. Конверсія лід → договір (вага 25%)",
        kpi_type: "SCALE_ABS",
        weight: 25,
        note: "Факт — конверсія у %. Норматив — не менше 18%.",
        tiers: [
          { from: 0, bonus: 0, label: "менше 15% — не виконано" },
          { from: 15, bonus: 4687.5, label: "15–18% — допустимо" },
          { from: 18, bonus: 9375, label: "18% і вище — виконано" },
        ],
      },
      {
        code: "NEW_CLIENTS",
        title: "KPI. Залучення нових клієнтів (вага 25%)",
        kpi_type: "SCALE_ABS",
        weight: 25,
        note: "Новий клієнт: не купував за останні 12 міс., підписав договір і вніс передоплату.",
        tiers: [
          { from: 0, bonus: 0, label: "0–2 клієнти" },
          { from: 3, bonus: 4687.5, label: "3 клієнти — 50%" },
          { from: 5, bonus: 9375, label: "5 клієнтів — 100%" },
          { from: 6, bonus: 11250, label: "6 і більше — 120%" },
        ],
      },
    ],
  },
  {
    key: "brigadier",
    position: "Бригадир",
    group: "production",
    base_salary: 25000,
    advance_percent: 50,
    target_bonus: 0,
    must_have: [
      "Звіт по кожному об'єкту за затвердженою формою",
      "Бонус — тільки після повного фінансового закриття об'єкта та підписання акта",
    ],
    kpi_scheme: [
      {
        code: "OBJECT_NET_PROFIT",
        title: "Бонус 30% від чистого прибутку закритих об'єктів",
        kpi_type: "OBJECT_PROFIT_PERCENT",
        percent: 30,
        note: "Затверджено таблицею «Структура» (30%). Чистий прибуток = договір − матеріали − доставка − ФОП бригади − техніка − логістика − інші прямі − адмінвитрати.",
      },
      {
        code: "CREW_PREMIUM_M2",
        title: "Премія бригаді +10 грн/м² (якість, строки, технологія)",
        kpi_type: "PER_M2",
        rate: 10,
        note: "Нараховується лише якщо одночасно: без зауважень і рекламацій, у строк, без перевитрат і пошкодження обладнання.",
      },
      {
        code: "ROOFING_M2",
        title: "Покрівельні роботи (рубероїд, ПВХ) — 20 грн/м², мінімум 2 000 грн за об'єкт",
        kpi_type: "PER_M2_MIN_FIXED",
        rate: 20,
        min_amount: 2000,
        note: "Об'єкти менше 100 м² — фіксована оплата 2 000 грн.",
      },
      {
        code: "INSULATION_M2",
        title: "Утеплення пінопластом — 15 грн/м²",
        kpi_type: "PER_M2",
        rate: 15,
      },
      {
        code: "MASONRY_LM",
        title: "Кладка — 50 грн/пог. м",
        kpi_type: "PER_LM",
        rate: 50,
      },
      {
        code: "DEMOLITION_PROFIT",
        title: "Демонтажні роботи — 36% від чистого прибутку об'єкта",
        kpi_type: "OBJECT_PROFIT_PERCENT",
        percent: 36,
      },
      {
        code: "AMORTIZATION",
        title: "Компенсація амортизації",
        kpi_type: "REIMBURSEMENT",
        rate: 5000,
      },
    ],
  },
  {
    key: "driver",
    position: "Водій",
    group: "production",
    base_salary: 35000,
    advance_percent: 50,
    target_bonus: 0,
    must_have: ["Доставки за графіком", "Технічний стан і документи на техніку"],
    kpi_scheme: [],
  },
  {
    key: "surveyor",
    position: "Замірник",
    group: "commercial",
    base_salary: 35000,
    advance_percent: 50,
    target_bonus: 20000,
    draft: false,
    must_have: [
      "Замір проведено у призначений день",
      "Картка заміру заповнена повністю (площа, геометрія, фото, умови доступу)",
      "Дані передані на кошторис у той самий день",
    ],
    kpi_scheme: [
      {
        code: "MEASUREMENTS_DONE",
        title: "KPI 1. Виконані заміри — 10 000 грн за 20+ замірів",
        kpi_type: "FIXED_KPI",
        target: 20,
        rate: 10000,
        note: "Факт — кількість завершених замірів за місяць (статус «виконано»). Бонус 10 000 грн нараховується при 20 і більше замірах.",
      },
      {
        code: "MEASUREMENT_HANDOFF_QUALITY",
        title: "KPI 2. Якість і правильність передачі повноти замовлення у виробництво — 10 000 грн",
        kpi_type: "CHECKLIST",
        rate: 10000,
        items: 1,
        note: "Чек-ліст: повнота даних заміру, коректність передачі в робочий пакет, відсутність критичних помилок/пропусків при передачі об'єкта у виробництво.",
      },
    ],
  },
];

export const KPI_TEMPLATE_BY_KEY: Record<string, KpiTemplate> =
  Object.fromEntries(KPI_TEMPLATES.map((t) => [t.key, t]));

export const KPI_TYPE_LABELS: Record<string, string> = {
  FIXED_SALARY: "Ставка",
  FIXED_KPI: "Фікс. бонус за ціль",
  PERCENT_KPI: "Пропорційно виконанню",
  SALES_MARGIN_PERCENT: "% від маржі продажів",
  OBJECT_PROFIT_PERCENT: "% від прибутку об'єкта",
  PER_M2: "За м²",
  PER_LM: "За пог. м",
  PER_OBJECT: "За об'єкт",
  PER_M2_MIN_FIXED: "За м² з мінімумом",
  SCALE_ABS: "Шкала за фактом",
  SCALE_PLAN: "Шкала за % плану",
  MARGIN_PERCENT_BY_PLAN: "% від маржі за шкалою плану",
  CHECKLIST: "Чек-ліст умов",
  QUALITY_BONUS: "Бонус за якість",
  MANUAL_BONUS: "Ручний бонус",
  DEDUCTION: "Утримання",
  REIMBURSEMENT: "Компенсація",
};

/**
 * Стартовий штат TERZI для швидкого заведення схем оплати.
 * Ставки й KPI беруться з шаблону посади; після створення редагуються у схемі оплати.
 */
export const DEFAULT_STAFF: { full_name: string; template: string }[] = [
  { full_name: "Олег", template: "executive_director" },
  { full_name: "Сергій", template: "assistant_director" },
  { full_name: "Альона", template: "financier" },
  { full_name: "Менеджер з продажів", template: "sales_manager" },
  { full_name: "Бригадир 1", template: "brigadier" },
  { full_name: "Бригадир 2", template: "brigadier" },
  { full_name: "Водій", template: "driver" },
  { full_name: "Родіон", template: "surveyor" },
];
