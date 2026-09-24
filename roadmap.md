# CEO Control Center implementation

- [x] Shared dashboard filters and server aggregate
- [x] Canonical qualified-lead and reconciled funnel
- [x] Reusable CEO dashboard components and action drawer
- [x] Four-zone responsive dashboard
- [x] Focused tests, typecheck, build, mobile verification
- [x] Match the supplied mobile dashboard composition and visual density
- [x] Verify the redesigned control center on mobile and desktop with live data

# Integration reconciliation and canonical reports

- [x] Canonical channel attribution registry
- [x] Unified integration telemetry and reconciliation DTO
- [ ] Real Meta Ads and Google Ads adapter wiring (blocked: provider credentials/connectors)
- [x] Dashboard synchronization and reconciliation panel
- [x] Reports center and eight canonical report routes
- [ ] Connector-backed Telegram, TikTok, Google Ads setup (blocked: connector access)
- [x] Focused tests, typecheck, build (live browser check blocked: database pooler unavailable)

# External connections (Google, TikTok, OLX, messengers)
- [x] Registry, token store, OAuth exchange and auto-refresh
- [x] Real API tests; "Connected" only after a successful provider response
- [x] Telegram / Viber / WhatsApp webhooks with signature verification + shared inbound intake
- [x] "Зовнішні джерела" tab in Integrations (connect / test / disconnect)
- [x] Built-in read-only AI assistant for reports, integrations and KPI with evidence links and permission-aware finance

# System recovery and authentication
- [x] Resume the hosted backend after pause
- [x] Enable email/password and Google sign-in
- [x] Keep profiles, roles and access approval flow
- [x] Return OAuth through the public login page before opening protected destinations

# Пакет А — збереження, довідники, контрагенти
- [x] А0. Ідентичність production-коду (docs/audit/PRODUCTION_IDENTITY.md)
- [x] А1. Перевірка збереження та версіонування кошторисів (snapshot / fork без перезапису історії)
- [x] А2. Налаштування як єдина точка входу (вкладки довідників у /settings)
- [x] А3. Реквізити ФОП (версіонування) і причини закриття (архівування)
- [x] А4. Контрагент: компанія, кілька ролей, пошук за телефоном / іменем / компанією
- [ ] Пакет Б. Інтеграції та атрибуція + звʼязки CRM / заміри / замовлення (очікує узгодження)

# Finance Core v3 (план затверджено 22.09.2026)
- [x] Ф1. Версіоновані правила (finance_rules), реєстр активів, резерви, reason-коди — схема
- [x] Ф2. Канонічна таксономія cost_class + backfill 87 категорій
- [x] Ф3. Водоспад P&L (object → company → operating → distributable), Cash Flow окремо
- [x] Ф4. Рушій винагород ролей To-Be (attributed Eligible GP)
- [ ] Ф5. Амортизація з реєстру активів і CAPEX
- [x] Ф6. ФНЗ: ціль 2 місяці burn, гейт дивідендів
- [ ] Ф7. Шість контролів звірки
- [ ] Ф8. Сторінки: Finance Settings, Object Economy, Company P&L, Cash Flow, Payroll/KPI, Assets, Reconciliation, Simulator
- [ ] Ф9. Shadow mode / backtest червень–серпень / pilot / switch

# Наступний запит користувача (черга)
- [ ] Єдиний ланцюг: лід → картка клієнта → замір → календар → замовлення (двосторонні оновлення)
- [ ] Калькулятори: скачування закупівельного листа і відправка постачальнику

# Security prerequisite — RLS on finance/payroll tables
- [x] Enable RLS + finance-only read policies on 13 sensitive tables

# Control Plane
- [x] Wave 1 — Kernel: config_entries, scope chain, lifecycle, zod kinds, flags, registries contracts
- [x] Wave 2 — Registries/fields/dictionaries (module overlays, custom fields, dictionaries, Settings Control Center)
- [x] Wave 2 — детерміноване обчислення formula-полів + вибір співробітника у кастомних полях

## Payroll bridge contract v2 (open)
- [x] planWorkItems from estimate/measurement only with verified brigade mapping
- [x] workItems only from confirmed acts/volumes (completed measurement ≠ done work) — omit otherwise
- [x] planOtherDirectCosts excludes brigade fund; don't double-count labor in approved total_cost
- [x] actual revenue/materials/subcontract/other/equipment/logistics only if confirmed
- [ ] Fact return endpoint — blocked: waiting for receiver spec from user

## Orders ↔ brigades ↔ estimate ↔ payroll (done, limits)
- [x] brigades directory, order_brigades, rates, mappings, work volumes, payouts
- [ ] Operations calendar grid still uses the built-in brigade list (new brigades not shown there)
- [ ] Confirmed fact revenue / non-labor costs per order not wired (fact margin = no data)
- [x] Fact return from Payroll Site via GET /api/erp/summary (read-only display)

- [ ] Wave 3 Control Plane — Layouts/Views, Workflows, Event/Action/Rule engine, Permission overlay, Settings UI (Draft→Preview→Publish→Rollback). Backlog order/crew/payroll не змішувати.
- [x] Site summary GET /api/erp/summary (orderId + month) — серверно в картці замовлення і дашборді, 403/404 чесно.

## Черга задач (23.09.2026)
- [ ] Замір завершено → калькулятор → витрати → лист закупівлі постачальнику → оновлення об'єкта
- [ ] Вкладка «Фінансова модель»: P&L, Cash Flow, розподіл витрат на об'єкти, рольовий прибуток, KPI
- [ ] Вкладка «Джерела» в лідах і замірах: UTM, канал, кампанія, ad IDs, ланцюг лід→замір→замовлення
- [ ] Двостороння звірка FinMap ↔ ERP без подвійного рахунку
- [ ] Реальні акаунти Meta Ads/Instagram/Facebook/Telegram/Viber/Google Ads — blocked: потрібні доступи/токени користувача
- [ ] Опублікувати finance_core_settings, compensation_scheme_versions, payroll_shadow_calculations для finance
- [ ] Адмін-сторінки overlay модулів/навігації з реєстрів kernel
- [ ] Перевірка Control Center: модуль з RU-назвою, прихований на мобільному, поле в Order і Lead
- [ ] Специфікація Payroll (поля ERP, що відкидати, ідентифікація об'єкта)
- [ ] Повернення фактів у Payroll (виручка, матеріали, підряди, обладнання, логістика, обсяги + confirmed)
- [ ] Wave 3: адміністрування прав (ролі, дозволи, перекриття)
- [ ] PAYROLL_BRIDGE_SECRET + живий GET /api/erp/summary — blocked: секрет задає користувач
- [ ] Авто-відправка підтверджених workItems і авто-оновлення «Дані відомості» — blocked: секрет
- [ ] Реальні ставки бригад і маппінг позицій кошторису — blocked: потрібні реальні ставки від користувача
- [ ] Сторінка «Відомість»: замовлення, виплати, статус, посилання
- [ ] Зведення по бригадах у Фінанси → Зарплата і KPI
- [ ] Публікація налаштувань модулів/полів/довідників і перевірка у меню/картках/CRM
- [ ] Модуль «Формули» в Control Center; маркетинг-калькулятор читає факти з конфігурації
- [ ] Тестові planWorkItems → summary — blocked: секрет; тестові дані в production не створювати без дозволу
- [ ] Маркетинг-калькулятор на реальних даних ERP (AVG5, GM, Marketing Cap, відхилення від плану)
- [ ] Відомість Payroll KPI в ERP з підтвердженням фактів
- [ ] Один реальний об'єкт у /api/erp/orders — blocked: секрет
- [ ] Wave 3: Layouts & Views, Workflows, Automations/Rules (порядок полів наживо)
- [ ] Двостороння синхронізація ERP ↔ відомість
- [ ] Правило: підтвердження акта → workItems у відомість + оновлення маржі
- [x] planOtherDirectCosts лише при повному узгодженому складі кошторису (аудит)

## Queue (2026-09-24)
- [x] Workflow Builder (виробничі етапи, переходи, план з кошторису, факт у відомість, завдання)
- [ ] Automations/Rules WHEN/IF/THEN + журнал + preview/test-cases
- [ ] Перевірка: опублікований Settings-конфіг читають калькулятор і відомість
- [ ] Роль «Фінансист» + Керування налаштуваннями (grant в Access → Roles) і перевірка publish/rollback
- [ ] Реальні акаунти Meta/Instagram/Facebook/Telegram/Viber/Google Ads → дашборд конверсій (потрібні підключення)
- [ ] FinMap ↔ ERP: P&L, Cash Flow, розподіл витрат, рольовий прибуток
- [ ] Реальні ставки бригад (крім screed_base — потрібні від власника)
- [x] PAYROLL_BRIDGE_SECRET збережено
- [ ] Google Ads → дашборд конверсій (блок: у Google Ads не прийнято доступ керуючого акаунта)

## Queue (24.09)
- [x] Meta Ads → marketing dashboard (scheduled sync + 30-day backfill)
- [ ] Rules «коли/якщо/то» on order stage change with log (Control Center) — separate large task
- [ ] Real checks for TikTok, OLX, WhatsApp, Viber, Telegram — blocked: no tokens; GTM has only container id (no API test possible without Google Tag Manager access)
- [ ] Instagram/Facebook split of Meta; Telegram/Viber/OLX leads on dashboard — blocked on accounts
- [ ] Dashboard: actual leads per ad source (clicks → заявка) — needs lead attribution (0 of 2205 leads attributed now)
- [x] W2.1 dry-run conversion pipeline (no provider sends)
- [ ] W2.2 Google/Meta adapters in test mode — blocked: provider rows, conversion actions, META_PIXEL_ID, consent record
- [ ] W2.3 hooks: measurement completed (2 paths), estimate, saveOrder, Finmap payment_received, keyCRM stage changes

# Запит 24.09.2026
- [x] Закрити критичні зауваження безпеки (довідники лише для активних співробітників)
- [ ] Заявки й конверсії Google/Meta по кампаніях на дашборді маркетингу, клік → заявка
- [ ] Реальні перевірки GTM/TikTok/OLX/WhatsApp/Viber/Telegram (потрібні ключі)
- [ ] Правила «коли/якщо/то» у Control Center для етапів замовлення
- [ ] Публікація + перевірка карток /integrations (після схвалення)

# Редизайн дашбордів 24.09.2026
- [x] Єдина візуальна система для CEO, CRM, маркетингу та звітів
- [x] Перевірка desktop/mobile без змін розрахунків і даних
