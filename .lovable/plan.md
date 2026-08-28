# TERZI ERP — 5 Build-волн на базе выявленных дефектов

Правила директора (М200/фибра/дизель, immutable снимки, ПДВ только на материалы, D-15 655 грн/м², раздельные расчёт/закупка, запрет внутренних цифр в клиентском контуре, запрет удаления production-данных) — жёсткие инварианты для всех волн. Ничего не удаляем: только `deprecate` (пометка + предупреждение), `redirect` (роут ведёт на новый) или `archive` (таблица/файл остаётся, чтение только на чтение).

Существующее ядро, на которое опираемся: `src/lib/engines/formula-eval.ts` (безопасный парсер без eval), `src/lib/directions/runtime.ts`, `src/lib/directions/versions.ts`, `src/lib/estimate-snapshot.ts`, `src/lib/target-margin.ts`, `src/lib/price-integrity.ts`, `src/lib/catalog-tiers.ts`, `src/lib/area-tiers.ts`.

---

## Волна A — Calculation Core, калькуляторы, прайсы, сметы, документы, права

**Файлы**
- Новое: `src/lib/core/calc-core.ts` (единый контракт `CalcInput → CalcResult`: строки, `qty` vs `purchaseQty`, `vatApplicable`, `internalOnly`), `src/lib/core/vat.ts`, `src/lib/core/purchase-rounding.ts`, `src/lib/core/client-projection.ts` (единственная точка, которая срезает `buy/cost/profit/margin`).
- Адаптеры без переписывания формул: `src/lib/screed-calc.ts`, `src/lib/screed-grades.ts`, `src/lib/pvc-calc.ts`, `src/lib/roofing-calc.ts` + `src/lib/roofing/*`, `src/lib/insulation-calc.ts`, `src/lib/demolition-calc.ts`.
- Потребители: `src/components/EstimateView.tsx`, `src/lib/estimate-pdf.ts`, `src/lib/pdf.ts`, `src/lib/pngExport.ts`, `src/lib/estimates.functions.ts`, `src/lib/catalog.functions.ts`, `src/components/CatalogPage.tsx`, `src/lib/usePricing.ts`.

**Переиспользуем**: `buildEstimateSnapshot`/`isSnapshotComplete`, `applyTargetMargin` (`target-margin.ts`), `price-integrity.ts`, `catalog-tiers.ts`, `useEstimateDraft.ts`, `useInternalAccess.ts`, `TargetMarginPanel`, `PurchaseSheet`, `ProductionCard`.

**Дубли к отключению (deprecate, не удалять)**
- `src/lib/roofing/legacy.ts` — оставить только как загрузчик старых снимков по `engine_version`, пометить `@deprecated`, запретить импорт из UI через eslint-правило.
- Локальные копии НДС/маржи внутри роутов калькуляторов → делегировать в `core/vat.ts` и `target-margin.ts`.
- Разрозненные функции округления закупки в `roofing-rolls.ts`/`pvc-calc.ts` → единая `purchase-rounding.ts`, старые становятся тонкими обёртками.

**Миграции**
1. `estimates`: заполнять колонки `engine_version`, `price_book_version` при сохранении (данные не трогаем, только новые записи + NOT NULL через `DEFAULT` без backfill).
2. Триггер истории цен на `catalog_items` → `price_history` (историю не переписываем).
3. `catalog_items`: применить подготовленный `docs/migrations/pending/2026-08-25_pvc_d15_split.sql` как обычную миграцию (D-15 — отдельный код 655 грн/м², армированная 1,8 мм — своя позиция без подстановки цены D-15).
4. Права: view-функции клиентского контура (`SECURITY INVOKER`), GRANT только на не-внутренние поля.

**Тесты**: расширить `approved-business-rules.test.ts` (дизель 17 л на базовом сценарии + этажность отдельной строкой); новые `core-vat.test.ts` (ПДВ только на материалы, итог = нетто работ + брутто материалов), `client-projection.test.ts` (в клиентском выводе нет ключей buy/cost/profit/margin), `purchase-rounding.test.ts`, снапшот-тест иммутабельности после смены каталога.

**Зависимости**: нет внешних; блокирует B, D-часть отчётов, E-документы.

**Rollback**: feature-флаг `calc_core_v2` per-direction; адаптеры сохраняют старый путь; миграции с `-- down` в `docs/migrations/`; снимки старых смет читаются старым движком по `engine_version`.

**Приёмка**: контрольный М200 даёт 7 м³ / 60 мешков / 13,4 т (закупка отдельно) / 10 л / 8 упаковок / 17 л дизеля; матрица фибры 4-6-8-10-12; PDF и экран совпадают до копейки; в клиентском PDF/экране нет внутренних цифр; сохранённая смета не меняется после правки каталога.

---

## Волна B — Конструктор направлений и универсальный API

**Файлы**: `src/routes/directions-editor.tsx`, `src/lib/directions/runtime.ts`, `src/lib/directions/versions.ts`, `src/lib/directions-repo.ts`, `src/lib/engines/direction-engine.ts`, `formula-eval.ts`; новое — `src/lib/api/calculate.functions.ts` (generic `calculate(directionSlug, version, inputs)`), `src/routes/api/public/calculate.tsx` (только клиентская проекция + HMAC + rate-limit).

**Переиспользуем**: whitelist-парсер формул, `direction_versions`, `client-projection.ts` из волны A, `runtime.ts` как единственный исполнитель.

**Дубли**: `src/lib/engines/direction-engine.ts` — свести к обёртке над `runtime.ts`, пометить deprecated; пять калькуляторных роутов постепенно переключаются на runtime по флагу, старые остаются доступны.

**Миграции**: `direction_versions` — immutable published (триггер запрета UPDATE опубликованной версии); поля `is_addon`, `roles`, `sort_order`, `status` при отсутствии; GRANT + RLS (пишут admin/director, читают по роли).

**Тесты**: `direction-runtime.test.ts` расширить — версионирование, откат, addon без задвоения работ/логистики/накладных; тест публичного API на отсутствие внутренних полей.

**Зависимости**: A. **Rollback**: флаг направления возвращает legacy-калькулятор; published-версии неизменны.

**Приёмка**: направление, собранное без кода, повторяет результат legacy-калькулятора на контрольных сценариях; API возвращает только клиентские значения.

---

## Волна C — CRM, keyCRM, Binotel, Webhook Core

**Файлы**: `src/lib/integrations/core.server.ts`, `binotel/*`, `keycrm/*`, `src/lib/crm.functions.ts`, `src/lib/leads/intake.server.ts`, `src/routes/api/public/integrations/*`, `src/routes/crm.*`, `src/lib/data-audit/ops.server.ts`.

**Переиспользуем**: очередь событий с retry и idempotency, HMAC-подпись (`signature.server.ts`), нормализацию телефона (`crm_normalize_phone`), связывание лид → клиент → заказ из аудита данных, 10-минутный поллинг.

**Дубли**: разные пути записи звонка (`calls.server.ts` vs webhook) → один `upsertCall`; ручной импорт keyCRM и cron-синк → общий `sync-ops.server.ts`.

**Миграции**: индексы по `phone_norm` и внешним id; уникальные ключи идемпотентности на `integration_events`; маскирование PII в логах. Слияние дублей клиентов — только через подтверждение в «Аудите данных», без авто-мерджа.

**Тесты**: webhook-подпись, дедупликация, повторная доставка, `leadorder` идемпотентность (расширить `data-audit-apply.test.ts`).

**Зависимости**: независима от A. **Rollback**: отключение интеграции флагом, очередь копится, ничего не теряется.

**Приёмка**: новый звонок/лид из keyCRM и Binotel появляется в ERP ≤10 мин и привязан к клиенту; повтор webhook не создаёт дубль.

---

## Волна D — Маркетинг и атрибуция

**Файлы**: `src/lib/marketing/*`, `src/lib/marketing.functions.ts`, `src/routes/marketing.*`, `src/routes/api/public/marketing/sync.tsx`.

**Переиспользуем**: `attribution.server.ts`, `kpi.ts`, `MarketingShell`, `CrudPanel`, UTM/gclid/fbclid из `leads/intake.server.ts`.

**Дубли**: параллельные подсчёты KPI в роутах → только `kpi.ts`.

**Миграции**: индексы на `marketing_daily_metrics` и `marketing_touchpoints`; nullable-метрики вместо нулей (различаем «0» и «нет данных»).

**Тесты**: атрибуция last/first touch, CPL/CAC, состояние «немає даних за період».

**Зависимости**: C. **Rollback**: адаптеры каналов отключаются по одному. **Приёмка**: цифры сходятся с CRM за период; нигде не показывается фальшивый ноль.

---

## Волна E — Заказы, производство, склад, календарь, финансы

**Файлы**: `src/lib/orders.functions.ts`, `src/routes/orders.*`, `production.*`, `src/lib/warehouse.functions.ts`, `src/routes/warehouse.tsx`, `src/lib/finance.functions.ts`, `src/routes/finance.tsx`, `src/lib/calendar.functions.ts`, `src/routes/operations.tsx`, `src/components/roofing/PlanFactPanel.tsx`, `src/lib/duration-calc.ts`.

**Переиспользуем**: `post_stock_document` / `post_stock_count` (SECURITY DEFINER), `finance-calc.ts`, `calendar-taxonomy.ts`, план/факт покрівлі, `is_finance()` / `is_stock_manager()`.

**Дубли**: расчёты сумм заказа в UI → в `finance-calc.ts`; резервирование склада — только через триггер `sync_stock_reserved`.

**Миграции**: связка `estimates ↔ orders ↔ invoices` (внешние ключи NOT VALID, без правки данных); проверка сверки сумм акта/договора/сметы триггером-валидатором.

**Тесты**: сверка «смета = договор = акт», двойное бронирование бригады/техники, проводка склада, расчёт зарплаты KPI.

**Зависимости**: A (снимки и суммы), C (данные заказов). **Rollback**: FK как NOT VALID, валидаторы за флагом. **Приёмка**: заказ проходит цепочку замер → смета → договор → график → акт без расхождений; конфликты календаря показываются предупреждением.

---

## Порядок и что вне Phase 2

Порядок: A → B → C → D → E, отдельный коммит и отчёт на волну (изменения, миграции, тесты, блокеры). В Phase 2 не переносится ничего из списка директора: Calculation Core, immutable estimates, клиентская защита, конструктор направлений, generic API, CRM, keyCRM, Binotel, формы сайта, Google Ads и Meta Ads, заказы, базовые финансы и запускные тесты — всё внутри волн A–E. Публикация — только по отдельному подтверждению.
