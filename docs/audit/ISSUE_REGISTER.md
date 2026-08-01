# ISSUE_REGISTER.md — реєстр знахідок

Дата: 01.08.2026. Машиночитний варіант: `ISSUE_REGISTER.json`.
Рівні: CRITICAL / HIGH / MEDIUM / LOW. Складність: XS < 1 год, S 1–4 год, M 1–2 дні, L 3–5 днів, XL > тижня.

| ID | Рівень | Проблема | Доказ | Складність | Звіт |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | CRITICAL | Собівартість і маржа доступні всім автентифікованим (`catalog_items` SELECT `using(true)`); фільтрація лише у фронтенді | pg_policies; `src/components/EstimateView.tsx` | M | SECURITY_AUDIT |
| SEC-02 | CRITICAL | Дві незалежні моделі ролей; модуль «Доступи» не впливає на RLS; 5 із 6 користувачів фактично мають лише `manager` | `user_roles` vs `user_access`, pg_policies | L | RLS_ROLE_MATRIX |
| DB-01 | CRITICAL | Усі 51 кошторис без `client_id` і `object_id` — ланцюг Клієнт→Об'єкт→Кошторис розірваний | SQL: count(client_id)=0 | L | DATABASE_AUDIT §2.1 |
| BE-01 | CRITICAL | Немає rate limit на перевірку пароля власника — можливий brute-force | BACKEND_AUDIT §2.1 | S | BACKEND_AUDIT |
| PERF-03 | CRITICAL | `listLeads` жорсткий `.limit(500)` без пагінації — понад 500 лідів не відображаються взагалі | `src/lib/crm.functions.ts:94-100` | M | PERFORMANCE_AUDIT |
| SEC-03 | HIGH | Операції з `admin()` (імпорт keyCRM, черга, маніфести) захищені лише `requireSupabaseAuth`, без перевірки ролі | `src/lib/integrations.functions.ts:187,310,339,349` | M | SECURITY_AUDIT |
| SEC-05 | HIGH | Немає soft delete у жодній із 64 таблиць; DELETE фізичний і незворотний | information_schema | M | DATABASE_AUDIT §2.3 |
| DB-02 | HIGH | Немає версіонування записів — конкурентне редагування мовчки перезаписує зміни | схема БД | M | DATABASE_AUDIT §2.4 |
| DB-03 | HIGH | Історія цін не ведеться (`price_history` порожня і не використовується); старий кошторис перераховується за новим прайсом | SQL + 0 посилань у коді | M | DATABASE_AUDIT §2.5 |
| DB-04 | HIGH | Модуль файлів не існує: 0 storage-бакетів, немає upload-коду при наявних UI-вкладках | `storage.buckets`; rg `storage.from` | L | DATABASE_AUDIT §2.6 |
| DB-05 | HIGH | 46 FK без індексів; RLS фільтрує по неіндексованих `owner_id` | pg_constraint/pg_index | S | DATABASE_AUDIT §4 |
| DB-06 | HIGH | Чотири паралельні jsonb-сховища одного розрахунку в `estimates` | схема | L | DATABASE_AUDIT §2.2 |
| BE-02 | HIGH | `pushIntegrationRecord` — ідемпотентність зламана через `Date.now()` у ключі | BACKEND_AUDIT §2.2 | XS | BACKEND_AUDIT |
| BE-03 | HIGH | Необмежені SELECT на зростаючих таблицях | BACKEND_AUDIT §2.3 | M | BACKEND_AUDIT |
| BE-04 | HIGH | N+1 запити в синхронізації keyCRM | BACKEND_AUDIT §2.4 | L | BACKEND_AUDIT |
| BE-05 | HIGH | `deleteCatalogItem`, `seedCatalogDefaults`, `approveEstimate`, `updateFactLine` без перевірки ролі на сервері | BACKEND_AUDIT §2.5–2.6 | S | BACKEND_AUDIT |
| MIG-01 | HIGH | Замовлення keyCRM нікуди імпортувати — немає цільової таблиці й writer'а | `sync.server.ts:405-418` | L | DATA_MIGRATION_READINESS |
| MIG-02 | HIGH | Задачі keyCRM не імпортуються взагалі | `keycrm-constants.ts:32-46` | M | DATA_MIGRATION_READINESS |
| OPS-01 | HIGH | Одне середовище на preview і прод; імпорт 3541 запису піде в бойову базу без відкату | `.env`, відсутність staging | M | SYSTEM_ARCHITECTURE §5 |
| QA-01 | HIGH | Нуль автотестів, нуль CI, 8686 помилок лінта | `bun run lint`, немає `.github` | M | TEST_REPORT |
| FE-01 | HIGH | 3 помилки типів TS2741: переходи на калькулятори без обов'язкового search-параметра | AppShell.tsx:157, clients.tsx:178, index.tsx:59 | XS | TEST_REPORT §2.1 |
| CALC-01 | HIGH | Коефіцієнт відходів 5% із джерела істини не застосовується в покрівлі | `roofing-calc.ts:296` vs `roofing-calculator.md:401` | S | CALCULATORS_AUDIT |
| CALC-02 | HIGH | `price_book_version` ніколи не заповнюється при збереженні кошторису | `estimates.functions.ts:55` + 4 маршрути | S | CALCULATORS_AUDIT |
| CRM-01 | HIGH | `assigned_to` завжди дорівнює автору — розподілу задач між співробітниками не існує | `crm.functions.ts` | M | CRM_AUDIT §3 |
| PERF-01/02/04/05 | HIGH | Вибірки клієнтів, кошторисів, календаря без ліміту; немає віртуалізації списків | PERFORMANCE_AUDIT §11 | L | PERFORMANCE_AUDIT |
| DB-07 | MEDIUM | `object_assignments` порожня — бригадири не бачать об'єктів | SQL | S | DATABASE_AUDIT §2.7 |
| SEC-08 | MEDIUM | Дві ідентичності користувача (`profiles.id` vs `user_id`) — пастка для майбутніх політик | SQL join | S | RLS_ROLE_MATRIX §4.4 |
| SEC-09 | MEDIUM | DEFINER-функції доступні `authenticated` — boolean-перебір існування об'єктів | pg_proc acl | S | SECURITY_AUDIT |
| SEC-10 | MEDIUM | `has_role` як SECURITY INVOKER залежить від політик таблиці, яку захищає | pg_proc | S | SECURITY_AUDIT |
| SEC-11 | MEDIUM | Відповіді зовнішніх API не валідуються схемою; масовий `any` у серверному шарі | eslint | M | SECURITY_AUDIT |
| SEC-12 | MEDIUM | Маскування чутливих даних у логах інтеграцій не верифіковане для всіх провайдерів | `core.server.ts` | S | SECURITY_AUDIT |
| INT-01 | MEDIUM | Немає replay-window для HMAC-вебхуків; `signature_mode='none'` дозволений | INTEGRATION_READINESS §4 | S | INTEGRATION_READINESS |
| INT-02 | MEDIUM | Немає повної реконсиляції ERP↔keyCRM | INTEGRATION_READINESS §5 | L | INTEGRATION_READINESS |
| MIG-03/04/05 | MEDIUM | Немає мапінгу менеджерів; custom fields не переносяться; немає преперевірки `default_owner_id` | DATA_MIGRATION_READINESS §5 | M | DATA_MIGRATION_READINESS |
| PERF-06..08 | MEDIUM | `staleTime`=0 і дублі query key; статичні jspdf/html2canvas/xlsx; бандл 748 kB без manualChunks | PERFORMANCE_AUDIT §11 | M | PERFORMANCE_AUDIT |
| PERF-11..14 | MEDIUM | Відсутні індекси `crm_leads.assigned_to`, `clients.created_at`, складений на `calendar_events`; великі `.in()` у `listObjects` | PERFORMANCE_AUDIT §11 | S | PERFORMANCE_AUDIT |
| TD-01 | MEDIUM | Два паралельні рушії розрахунку: декларативний (`directions`/`formulas`) не використовується | `src/lib/engines/*` | L | DEAD_CODE_AND_STUBS |
| TD-02 | MEDIUM | 6 невикористаних таблиць і компонент `ModuleStub.tsx` | rg + SQL | S | DEAD_CODE_AND_STUBS |
| DB-08 | MEDIUM | Немає CHECK-обмежень на невід'ємність сум/площ; величезні площі дають нереалістичні суми без попередження | схема + тест калькуляторів | S | CALCULATORS_AUDIT |
| SEC-14 | LOW | `anon` має GRANT SELECT — розкриття існування таблиць (даних не віддає) | 18 curl-запитів | XS | SECURITY_AUDIT |
| SEC-15 | LOW | RLS без політик на `integration_oauth_states`/`integration_tokens` — безпечно, але не задокументовано | pg_policies | XS | SECURITY_AUDIT |
| SEC-16 | LOW | Немає конфігурації security headers / CSP у репозиторії | rg | S | SECURITY_AUDIT |
| SEC-17 | LOW | Немає відновлення пароля (вхід лише Google/Apple) — обмеження, не вразливість | код | — | TEST_REPORT |
| PERF-09/10 | LOW | Footer PNG 1.1 MB і шрифти PDF 1.23 MB без субсету | dist | S | PERFORMANCE_AUDIT |
| MIG-07 | LOW | Повтор тієї ж сторінки після збою імпорту без окремого логування | `import.server.ts:129-134` | XS | DATA_MIGRATION_READINESS |

**Підсумок:** CRITICAL — 5, HIGH — 20, MEDIUM — 17, LOW — 6.
