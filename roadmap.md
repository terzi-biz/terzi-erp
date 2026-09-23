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
- [ ] Wave 2 — Registries/fields/dictionaries (awaiting approval)

## Payroll bridge contract v2 (open)
- [ ] planWorkItems from estimate/measurement only with verified brigade mapping
- [ ] workItems only from confirmed acts/volumes (completed measurement ≠ done work) — omit otherwise
- [ ] planOtherDirectCosts excludes brigade fund; don't double-count labor in approved total_cost
- [ ] actual revenue/materials/subcontract/other/equipment/logistics only if confirmed
- [ ] Fact return endpoint — blocked: waiting for receiver spec from user
