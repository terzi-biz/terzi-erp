# CEO / Owner Control Center — план реалізації

## 1. EXISTING REUSABLE INFRASTRUCTURE

- Головна `/` уже має авторизоване зведення `getAnalyticsOverview`, порівняння з попереднім періодом, KPI, воронку, задачі, телефонію, менеджерів, замірників, якість даних і `FinmapSyncStatus`.
- `analytics_overview` уже агрегує ліди, заміри, кошториси, замовлення, рекламу, дзвінки та базові проблеми одним запитом; `getAnalyticsDrilldown` + `DrilldownDialog` уже є спільним механізмом деталізації.
- Канонічні дії вже існують: `updateLeadMarketing`, `moveLeadStage`, `upsertTask`, `setMeasurementStatus`, календарні дії, відкриття замовлень/кошторисів, програвач Binotel `CallsPlayerList`/`getCallRecording`.
- Фінансове джерело вже централізоване в `computeManagementKpi` → `getFinanceOverview`: Finmap-факт, рахунки, cash flow, дебіторка, кредиторка та доступ лише для дозволених ролей.
- Наявні довідники: активні pipeline/stage, `marketing_channels`/source mapping, каталог напрямків, працівники, замовлення, статуси та `analytics_targets`.
- Наявні `Sheet` і `Drawer` UI-примітиви, дизайн-токени TERZI та серверний RBAC `requirePermission`/`canViewInternalPrices`/`writeAudit`.

## 2. CONFIRMED GAPS

- `Qualified Lead` зараз рахується двома несумісними способами: `lead_quality='цільовий'` у CEO-аналітиці та `lead_quality='qualified' OR won` у CRM KPI. Історія переходів є в `crm_lead_activities`, але покриває лише частину лідів.
- Поточне зведення приймає тільки період; Pipeline, Source, Manager, Direction, Order і Status не є спільним серверним контекстом.
- Воронка складає незалежні підсумки за `created_at`, тому не гарантує єдину когорту та рівність із деталізацією.
- Поточний drill-down показує записи, але не підтримує типізовані дії, повний набір проблем і мобільний action-sheet режим.
- KPI маркетингу частково рахуються повторно в React; план/факт із `analytics_targets` не показується; цільових рядків у таблиці зараз немає.
- Операційні дані існують, але немає готового спільного CEO-зведення для задач, SLA передзвону, календаря, завантаження бригад, ризиків і freshness усіх інтеграцій.
- `/reports/ceo` дублює частину головної панелі. Новий центр керування будується на `/`; окремий звіт не розширюється паралельно.

## 3. PHASE A — DATA + ACTIONS

1. Ввести один типізований `DashboardFilter` і URL-стан для Period, Pipeline, Source, Manager, Direction, Order та Status; пресети: сьогодні, вчора, 7/30 днів, поточний/минулий місяць, довільний період.
2. Мінімально розширити наявний dashboard server-function одним агрегованим DTO: current/previous, funnel, sales/team, calls, marketing, measurements/estimates, operations/calendar, finance-visible summary, alerts, targets і freshness. Виконувати паралельні доменні читання один раз на набір фільтрів; не робити запит на кожну картку.
3. Канонізувати `Qualified Lead` як серверний предикат: поточний етап пізніше першого «Новий лід» **або** наявний історичний перехід із першого етапу на пізніший. Пряма втрата з першого етапу не кваліфікується. Той самий предикат використати в CEO, CRM KPI, менеджерах, джерелах, конверсіях і drill-down. Старі записи без достатньої історії не домислювати; позначати як недостатні дані/Needs Review, коли поточний стан не доводить прогрес.
4. Перебудувати воронку як єдину серверну когорту Lead → Qualified → Measurement Scheduled → Completed → Estimate → Won/Order з одним набором фільтрів і lead/entity IDs; повернути previous/overall conversion, drop-off та точний drill-down token.
5. Розширити спільний drill-down descriptor (`metric + filters + entity/action capabilities`) і серверний список записів для KPI, етапів, менеджерів, джерел, дзвінків, замірів, кошторисів, замовлень, задач, календаря, фінансів та Data Quality.
6. Підключити inline actions лише через існуючі функції та довідники: Source, Manager, Stage, Task, Call/callback, Measurement і безпечне Needs Review resolution. Додати серверну перевірку granular permission перед кожною зміною, наявний аудит, точкову інвалідацію агрегату та drill-down після save.
7. Зібрати пріоритетний alert DTO з реальних ознак: critical/warning/opportunity, count, exact record filter, доступна дія. Безпечний bulk — лише для однозначних не-фінансових змін; фінанси й неоднозначні зв’язки залишити індивідуальними.
8. Підключити `analytics_targets`; без рядка цілі повертати `target:null` і показувати «Ціль не налаштована». Не створювати значення автоматично.
9. Фінансові KPI брати тільки з `computeManagementKpi/getFinanceOverview`; legacy payments/expenses не використовувати як прибуток. ROAS/ROMI показувати лише коли витрати та пов’язаний дохід/прибуток узгоджені для того самого зрізу, інакше — «Недостатньо даних».
10. Сформувати детерміновані insights із уже порахованого DTO: максимум 1–3 на секцію та до 5 у «Ключових висновках»; без LLM і припущень про причини.

## 4. PHASE B — CEO UX

1. Перекомпонувати існуючу `/` без другого Dashboard: sticky/compact global filters, потім чотири мобільні зони у заданому порядку; на desktop ті самі секції розкласти у щільну 2–4-колонкову сітку.
2. **CEO Now:** 6–8 пріоритетних KPI, компактний Plan/Fact, «Потребує уваги», задачі/події сьогодні та «Ключові висновки»; решту сховати нижче, не перевантажуючи перший екран.
3. **Sales + Team:** вертикальна reconciled-воронка, дзвінки/SLA, менеджери й 1–3 фактичні рекомендації; кожен рядок/етап відкриває той самий відфільтрований набір.
4. **Marketing + Conversion:** spend і наскрізні етапи за каналом, CPL/CPQL/Cost per Measurement/CAC, mini-funnels і застосування Source як глобального фільтра; ненадійні ROAS/ROMI приховувати як unavailable.
5. **Operations + Finance:** заміри/кошториси, календар Today/Tomorrow/Week, бригади та ризики лише з `crew_bookings`/calendar/production facts, Finance snapshot для дозволених ролей, Data Quality та integration freshness.
6. Замінити локальні `Kpi`/`Panel` і окремий `DrilldownDialog` узгодженими примітивами нижче; зберегти існуючі TERZI токени, Lucide, малі радіуси, тонку рамку/тінь і семантичні green/teal/amber/red стани за наданими mobile-browser референсами.
7. На мобільному ActionDrawer — bottom/full-height sheet; на desktop — side sheet. Таблиці перетворювати на компактні рядки/mini-cards без горизонтального обрізання; фіксовані control rows будувати через responsive grid.
8. Для кожного блоку окремо підтримати loading, empty, partial, permission denied, integration unavailable, calculation unavailable та error; unknown ніколи не показувати як 0.
9. Зберегти прямі переходи до canonical Lead/Client/Call/Measurement/Estimate/Order/Finance/Calendar/Integration pages; після inline save оновлювати лише залежні query keys.

## 5. DB / MIGRATIONS

**No migration required.** Поточні таблиці вже підтримують фільтри, targets, lead stage history, calendar, crew bookings, finance, audit і relations. Зміни агрегатів виконати через версіоновану `CREATE OR REPLACE FUNCTION` міграцію лише тому, що канонічні SQL-функції `analytics_overview` і `crm_kpi` мають бути узгоджені; нових таблиць/колонок/ролей/словників не створювати.

Якщо під час реалізації підтвердиться, що імпортований лід повернувся на перший етап і не має жодної історії, не додавати прапорець qualification: показати Needs Review. Надалі всі наявні шляхи зміни stage мають дописувати `crm_lead_activities` і не перезаписувати історію.

## 6. REUSABLE COMPONENTS

- **MetricCard** — value, previous delta, semantic direction, target/actual, unavailable state, drill-down.
- **FunnelCard** — stages, previous/overall conversion, drop-off, weakest reliable step, drill-down.
- **ActionDrawer** — shared record list, mobile/desktop presentation, permission-aware actions, save/error/bulk-safe states; замінює розрізнені dashboard dialogs.
- **ManagementInsight** — severity, fact, baseline, deterministic recommendation, drill-down.
- **SectionShell** — title, scoped controls, content, insights, View All, loading/partial/error states.

Компоненти керуються декларативною конфігурацією widget id/order/roles/default visibility, але Settings/drag-and-drop у цій роботі не реалізуються.

## 7. DATA SOURCES / CANONICAL FUNCTIONS

| Секція | Джерело правди / повторне використання |
|---|---|
| Sales funnel, managers, sources | `analytics_overview`, `crm_kpi`, `crm_leads`, `crm_stages`, `crm_lead_activities`; один qualified predicate |
| Calls | `crm_calls`, `listCallsFeed`, `listEntityCalls`, existing callback tasks, `getCallRecording` |
| Tasks / administration | `crm_tasks`, `listTasks`, `upsertTask`, staff directory |
| Measurements | `order_measurements`, `listMeasurements`, `setMeasurementStatus` |
| Estimates | `estimates`, existing status/audit/version functions; без нового розрахунку сум |
| Orders | canonical `orders` and existing order functions/status history |
| Marketing | `marketing_daily_metrics`, manual spend, channels/source map, touchpoints where reliable, shared `marketing/kpi` formulas |
| Plan / Fact | `analytics_targets`; production facts/targets only when configured |
| Operations / crews | `calendar_events`, `crew_bookings`, existing production/order schedule functions; unavailable when capacity is not defined |
| CEO Calendar | `listCalendarEvents` and canonical entity links |
| Finance | `computeManagementKpi` / `getFinanceOverview`, finance transactions/accounts/payment stages/payables |
| Data Quality / health | existing analytics counters, Data Audit checks/actions, integration state/logs, `FinmapSyncStatus` |
| RBAC / audit | `requirePermission`, `canViewInternalPrices`, RLS, `writeAudit` and existing entity audit mechanisms |

## 8. TEST / VERIFY PLAN

- Unit tests for period presets/timezone, shared filter serialization and every metric’s semantic delta direction.
- Focused qualification matrix: current initial, progressed, progressed then regressed, won after progress, lost directly from initial, incomplete imported history; assert identical CEO/CRM/manager/source results.
- Contract tests per filter combination: KPI count = ActionDrawer count; every funnel count = its drill-down; stage/source/manager/order/status filters remain identical in aggregate and records.
- Focused manager/source/call tests, including missed-without-callback, callback SLA, reliable Call→Measurement/Won links and unchanged Binotel recording playback.
- Inline Source/Manager/Stage/Task/Measurement tests: canonical options, allowed/denied RBAC, audit entry, save, targeted query invalidation, refreshed KPI; verify unsafe bulk actions absent.
- Finance tests confirm Dashboard equals canonical Finance for the same period and hides protected/internal fields without permission; unavailable metrics never become zero.
- Calendar/entity link, targets missing/configured, integration freshness, partial/error/empty-state tests.
- Playwright at 430×786 mobile browser plus tablet/desktop: four-zone order, no overlap/clipping, readable action sheet, exact navigation and post-save refresh.
- Run focused Vitest suites, full existing tests, `tsgo --noEmit`, production build; no deploy/publish.

## 9. RISKS / NEEDS REVIEW

1. Historical “progressed at least once” cannot be proven for imported/regressed leads without stage history; expose Needs Review rather than infer.
2. `analytics_targets` is currently empty, so Plan/Fact initially shows “Ціль не налаштована”.
3. Crew utilization/productivity requires real capacity and assignment data; show schedule/free windows only where supported.
4. ROAS/ROMI and Call→Won stay unavailable for slices without reliable attribution/relations.
5. Global Order/Status filters are domain-specific; widgets that cannot validly apply them must explicitly show that the filter is not applicable, not silently alter meaning.

## 10. ESTIMATED IMPLEMENTATION SCOPE

**Large.** Main cost drivers: one reconciled multi-domain aggregate/filter contract, canonical Qualified Lead consistency across existing analytics, reusable permission-aware inline actions, four-zone responsive composition, and count-to-drill-down verification across CRM, marketing, operations and protected finance. Scope remains bounded by reusing existing entities/functions and avoiding new tables or module rebuilds.
