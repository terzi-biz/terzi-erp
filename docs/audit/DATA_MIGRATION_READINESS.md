# Аудит готовності перенесення даних з keyCRM (2000+ клієнтів/лідів, замовлення, задачі)

Джерела: `src/lib/integrations/keycrm/import.server.ts`,
`src/lib/integrations/keycrm/sync.server.ts`, `src/lib/integrations/keycrm/client.server.ts`,
`src/lib/integrations/keycrm-constants.ts`, міграції `integration_import_runs`,
`integration_sync_links`. Читання коду і SQL, без жодних викликів keyCRM API.

## 1. Механіка імпорту

- **Chunking:** так, посторінково, одна сторінка сутності за виклик
  (`import.server.ts:94-189`, `importChunk`). Розмір сторінки — `pageSize`
  (за замовчуванням 50, `import.server.ts:115`).
- **Resumability:** так. Прогрес зберігається в `integration_import_runs`
  (`page`, `received`, `applied`, `skipped`, `failed`, `status`) з `UNIQUE
  (integration_id, entity)` (`20260801001013…:1-20`). Повторний виклик
  `importChunk` продовжує з `run.page + 1` (`import.server.ts:116`), не з нуля,
  якщо `run.status !== 'done'`.
- **Rate limiting:** так, на рівні HTTP-клієнта — `client.server.ts:21-64`
  (`acquireSlot`) обмежує 60 запитів/хв (`KEYCRM_RPM=60`,
  `keycrm-constants.ts:55`) через спільний лічильник у таблиці
  `integration_rate_limits` (окремий бакет `keycrm`), плюс обробка `429`
  (`client.server.ts:124-127`, `markRetryAfter`) і забезпечення
  ретраю з бекофом `500ms * 2^attempt` для 5xx/мережевих помилок
  (`client.server.ts:118-121, 139-146`), максимум 3 спроби на HTTP-запит.
- **Dedupe key:** `external_id` в межах `(integration_id, entity)`, через
  таблицю `integration_sync_links` з **DB-рівневим унікальним обмеженням**
  `UNIQUE (integration_id, entity, external_id)` (`20260730032341…:66`).
  Записи ERP додатково мають `external_source`+`external_id` на самих
  таблицях (`crm_leads`, `crm_contacts`, `clients`, `20260730032341…:154-163`)
  з індексами (не unique constraint) для пошуку.
- **Що відбувається при частковому збої:** помилка на конкретному елементі
  сторінки не зупиняє імпорт сторінки — вона ловиться в `try/catch`
  усередині циклу (`import.server.ts:156-169`), інкрементує `failed`,
  пишеться попередження в `integration_event_logs` через `logAttempt`
  (рядки 163-168), і цикл продовжується. Якщо падає сам HTTP-запит за
  сторінку (`client.get`/`client.paginate`), увесь `importChunk` кидає
  виняток, запис `integration_import_runs` переводиться в `status:"error"`
  з `last_error` (рядки 129-134); повторний виклик з тим самим `page`
  (`nextPage = run.page + 1`, тобто застряглий запис має `run.page`
  **не інкрементованим**, бо `upsertRun` для помилки викликається без
  оновлення `page`) — фактично при помилці конкретної сторінки повторний
  запуск спробує ту саму сторінку знову (безпечно завдяки dedupe за
  `external_id`).
- **Чи створює повторний запуск дублікати:** ні — для сутностей, що
  записуються в ERP (`pipelines`, `pipeline_statuses`, `buyers`, `lead_cards`),
  `applyExternal` (`sync.server.ts:420-480`) спершу шукає існуючий `link`
  за `(integration_id, entity, external_id)`, а якщо лінка нема — шукає
  запис в ERP-таблиці за `external_source+external_id` (наприклад
  `sync.server.ts:276-283` для покупців, `386-393` для лідів) перед
  вставкою; додатково пропускає запис, якщо `external_hash` не змінився
  (рядок 427, `unchanged`). Це коректно захищає від дублювання при
  повторному запуску **того самого** `integration_id`. Ризик дублювання
  залишається лише якщо створити **нову** інтеграцію (новий `integration_id`)
  на той самий кабінет keyCRM — тоді `integration_sync_links` буде окремим
  простором ключів, і при відсутності збігу по `external_source+external_id`
  на самій ERP-таблиці (це перевіряється) дублікатів все одно не буде,
  оскільки перевірка `external_source+external_id` не прив'язана до
  конкретного `integration_id`.
- **Унікальність `integration_sync_links` на рівні БД:** підтверджено —
  `UNIQUE (integration_id, entity, external_id)` (`20260730032341…:66`),
  забезпечується через `upsert(..., { onConflict: "integration_id,entity,external_id" })`
  (`sync.server.ts:126-141`).

## 2. Покриття мапінгу сутностей keyCRM

| Сутність keyCRM | ERP-таблиця | Функція-writer | Статус |
|---|---|---|---|
| pipelines (воронки) | `crm_pipelines` | `applyPipeline` (`sync.server.ts:207-225`) | Реалізовано |
| pipeline_statuses (статуси воронок) | `crm_stages` | `applyStage` (`sync.server.ts:227-261`) | Реалізовано |
| order_statuses | — (лише `integration_sync_links.payload`) | `applyReference` (`sync.server.ts:405-418`) | Тільки довідник, немає власної ERP-таблиці статусів замовлень |
| sources (джерела) | — (довідник) | `applyReference` | Тільки довідник; значення `source` копіюється в текстове поле `crm_leads.source` при імпорті лідів (`sync.server.ts:376`), але без FK-мапінгу |
| managers (відповідальні) | — (довідник) | `applyReference` | Немає мапінгу "keyCRM manager → ERP user"; `owner_id` лідів/контактів береться з `default_owner_id`/`created_by` інтеграції (`ownerFor`, `sync.server.ts:174-180`), **не** з менеджера keyCRM |
| custom_fields | — (довідник) | `applyReference` | Значення додаткових полів не переносяться у сутності |
| companies | — (довідник) | `applyReference` | Немає власної ERP-таблиці компаній; `crm_contacts.company` заповнюється текстом при імпорті покупця (`sync.server.ts:294`) |
| buyers (клієнти/покупці) | `crm_contacts` | `applyBuyer` (`sync.server.ts:263-305`) | Реалізовано, з дедуплікацією за `external_id`, потім за `phone_norm` |
| lead_cards (картки/ліди) | `crm_leads` | `applyLeadCard` (`sync.server.ts:307-402`) | Реалізовано |
| orders (замовлення) | — (лише `integration_sync_links.payload`) | `applyReference` | **Немає окремої ERP-таблиці замовлень у цьому шляху** — імпорт лише реєструє `external_id` та зберігає сирий payload у `integration_sync_links.payload` (умова `entity === "orders"`, `sync.server.ts:475`); прив'язки замовлення до конкретного ліда/клієнта в бізнес-таблицях не створюється |
| payments (оплати) | — (довідник) | `applyReference`, витягуються з `order.payments` (`extractOrderChildren`, `sync.server.ts:627-632`) | Тільки довідник |
| comments (коментарі карток) | — (довідник) | `applyReference`, витягуються з `card.comments` (`extractLeadComments`, `sync.server.ts:634-636`) | Тільки довідник, не пишуться як записи активності в ERP |
| tasks (задачі) | — | — | **Немає жодного writer'а.** `KEYCRM_ENTITIES` (`keycrm-constants.ts:32-46`) не містить сутності `tasks`; `IMPORT_ORDER` (`import.server.ts:14-24`) також не містить `tasks`. keyCRM Open API задач у цьому коді взагалі не читається |

## 3. Явні відповіді

### Чи можна зараз переносити клієнтів (buyers → crm_contacts)?

**Так, з застереженнями.** Writer реалізований (`applyBuyer`), дедуплікація
за `external_id`→за телефоном є, унікальність на рівні БД для лінків є.
Застереження: обов'язковий `default_owner_id` в конфігурації інтеграції —
без нього імпорт валить помилку на кожному записі покупця (`sync.server.ts:265-266`,
"Не визначено власника записів"), тобто перед стартом імпорту 2000+ клієнтів
потрібно попередньо задати власника в `integrations.config`.

### Чи можна зараз переносити лідів (lead_cards → crm_leads)?

**Так, з застереженнями.** Writer реалізований (`applyLeadCard`), потребує
попередньо імпортованих `pipelines`/`pipeline_statuses` (інакше падає з
помилкою "Не знайдено воронку", `sync.server.ts:240`) — це забезпечується
порядком `IMPORT_ORDER` (`import.server.ts:14-24`), де довідники йдуть перед
`lead_cards`. Так само потрібен `default_owner_id`. Мапінг менеджера
keyCRM на конкретного ERP-користувача **не** переноситься — усі імпортовані
ліди отримають одного й того ж власника (з конфігу), що для 2000+ лідів
із різними менеджерами є суттєвим обмеженням бізнес-логіки, а не блокером
технічної можливості імпорту.

### Чи можна зараз переносити замовлення?

**Ні.** `orders` у `IMPORT_ORDER` присутній (`import.server.ts:20`), тобто
дані *читаються* зі сторінок keyCRM і *реєструються* в `integration_sync_links`,
але немає жодної ERP-таблиці замовлень і жодного коду, який перетворює
замовлення keyCRM у бізнес-об'єкт ERP (немає ні `crm_orders`, ні прив'язки
до ліда/клієнта). Це підтверджується: `KEYCRM_ENTITIES` для `orders` має
`target: "reference"` (`keycrm-constants.ts:43`), а `applyExternal` для будь-якої
сутності поза `pipelines/pipeline_statuses/buyers/lead_cards` викликає лише
`applyReference`, що пише в `integration_sync_links.payload` і повертає
`internalId: null` (`sync.server.ts:405-418, 449-455`). Отже дані замовлень
осядуть тільки як сирий JSON у службовій таблиці, недоступний користувачам
ERP UI як бізнес-сутність.

### Чи можна зараз переносити задачі?

**Ні.** Задачі (tasks) відсутні в переліку сутностей keyCRM
(`KEYCRM_ENTITIES`, `keycrm-constants.ts:32-46`) і в порядку імпорту
(`IMPORT_ORDER`, `import.server.ts:14-24`). Немає жодного HTTP-виклику
до ендпоінту задач keyCRM і жодного writer'а в ERP-таблицю `crm_tasks`
у контексті імпорту keyCRM (єдиний писач `crm_tasks` у всій директорії
інтеграцій — це Binotel при пропущеному дзвінку, `binotel/adapter.server.ts:187-205`,
що не стосується keyCRM-задач).

## 4. Оцінка навантаження

Вихідні параметри з коду:
- Ліміт keyCRM: 60 запитів/хв (`KEYCRM_RPM`, `keycrm-constants.ts:55`).
- Розмір сторінки імпорту: 50 записів (`import.server.ts:115`, дефолт).
- `importChunk` виконує **1 сторінку = 1 виклик API за одне серверне
  виконання** (для paginated-сутностей, окрім `pipeline_statuses` і
  `SINGLE_SHOT`, які тягнуть усе одразу через `client.paginate` з `maxPages`,
  `import.server.ts:81,122`).

Оцінка кількості HTTP-запитів для 2000+ клієнтів і 2000+ лідів (без замовлень
і задач, оскільки вони не пишуться в ERP):
- `buyers`: 2000 / 50 = ~40 сторінкових запитів.
- `lead_cards`: 2000 / 50 = ~40 сторінкових запитів.
- Довідники (`pipelines`, `pipeline_statuses`, `order_statuses`, `sources`,
  `managers`, `custom_fields`, `companies`) — зазвичай малий обсяг, у межах
  кількох запитів кожен через `client.paginate` (`SINGLE_SHOT`, до 5 сторінок
  на сутність, `import.server.ts:122`).
- Разом орієнтовно 100-150 HTTP-запитів на повний прогін клієнтів+лідів
  (без замовлень). НЕ ПЕРЕВІРЕНО: реальна кількість записів і сторінок у
  продакшн-акаунті keyCRM — оцінка виключно з коду і заявлених "2000+".

Оцінка кількості DB-записів:
- На кожен елемент сторінки: 1 SELECT (`getLink`) + 1-2 SELECT для
  дедуплікації (`sync.server.ts:276-288`) + 1 INSERT/UPDATE у ERP-таблицю +
  1 SELECT для обчислення `internalHash` (рядок 461) + 1 UPSERT у
  `integration_sync_links` (рядки 465-476) + 1 INSERT у `audit_logs`
  (рядок 189, `auditSync`, обгорнутий у try/catch, що ковтає помилки). Разом
  орієнтовно **5-7 SQL-операцій на один запис сутності**, тобто для 4000
  клієнтів+лідів — приблизно 20 000-28 000 запитів до Supabase за повний
  імпорт. Це не є проблемою продуктивності Postgres, але означає, що
  повний імпорт **не може виконатися за один HTTP-запит/виклик serverless-функції**.

### Чи вкладається в ліміт часу серверної функції / воркера

Дизайн явно розрахований на це: коментар у файлі прямо каже "процес
відновлюваний і не впирається в ліміт часу серверної функції"
(`import.server.ts:1-6`). Кожен виклик `importChunk` обробляє одну сторінку
(до 50 записів), тобто одне серверне виконання — це секунди, а не хвилини.
Однак **оркестрація повторних викликів** (хто і як часто викликає
`importChunk` для кожної сутності до `done:true`) не знайдена в межах
переглянутих файлів як автоматичний цикл — `runDuePolls`
(`sync-ops.server.ts:248-275`) стосується лише регулярного *polling* уже
активних сутностей (за `poll_enabled`), а не первинного масового імпорту
через `IMPORT_ORDER`/`importChunk`. НЕ ПЕРЕВІРЕНО: чи є в
`src/lib/integrations.functions.ts` або в UI (`ImportPanel.tsx`)
автоматичний цикл повторних викликів `importChunk` до завершення, чи
оператор має вручну натискати кнопку "продовжити" по одній сторінці —
для остаточного висновку потрібен перегляд `src/lib/integrations.functions.ts`
повністю та UI-логіки `ImportPanel.tsx`, що не входило до глибини цього
прогону аудиту; якщо це ручний процес — для 2000+ записів це означає
десятки ручних кліків або необхідність зовнішнього планувальника
(worker.tsx cron), якого для *імпорту* окремо не знайдено (worker.tsx
викликає лише `runQueue` і `runDuePolls`, не `importChunk`).

## 5. Пронумерований список блокерів

1. **Немає ERP-таблиці та writer'а для замовлень (orders)**
   Критичність: Висока
   Розташування: `src/lib/integrations/keycrm/sync.server.ts:405-418,449-455`; `src/lib/integrations/keycrm-constants.ts:43`
   Доказ: `target: "reference"` для `orders`; `applyExternal` викликає лише `applyReference`, яка не створює запис у бізнес-таблиці, а лише зберігає payload у `integration_sync_links.payload`
   Рекомендація: спроєктувати таблицю замовлень ERP (або визначити цільову таблицю серед наявних) і реалізувати `applyOrder` за аналогією з `applyLeadCard`
   Складність: L

2. **Задачі keyCRM не імпортуються взагалі**
   Критичність: Висока
   Розташування: `src/lib/integrations/keycrm-constants.ts:32-46`, `src/lib/integrations/keycrm/import.server.ts:14-24`
   Доказ: сутність `tasks` відсутня в `KEYCRM_ENTITIES` і `IMPORT_ORDER`
   Рекомендація: додати сутність `tasks` у маніфест і константи, реалізувати `applyTask` → `crm_tasks`
   Складність: M

3. **Немає мапінгу менеджерів keyCRM на користувачів ERP**
   Критичність: Середня
   Розташування: `src/lib/integrations/keycrm/sync.server.ts:174-180` (`ownerFor`)
   Доказ: усі імпортовані ліди/контакти отримують одного `default_owner_id`/`created_by`, а не менеджера з поля `manager`/`assigned_to` keyCRM
   Рекомендація: реалізувати таблицю мапінгу (аналог `integration_line_map`) `keycrm_manager_id → user_id` і використовувати її в `applyBuyer`/`applyLeadCard`
   Складність: M

4. **Значення custom fields не переносяться в записи**
   Критичність: Середня
   Розташування: `src/lib/integrations/keycrm/sync.server.ts:405-418`
   Доказ: `custom_fields` обробляються тільки як `applyReference`-довідник; значення полів у конкретних `lead_cards`/`buyers` не мапляться на поля ERP
   Рекомендація: використати наявну таблицю `integration_field_mappings` для розбору custom fields з payload картки/покупця
   Складність: M

5. **Немає обов'язкової преперевірки `default_owner_id` перед запуском масового імпорту**
   Критичність: Середня
   Розташування: `src/lib/integrations/keycrm/sync.server.ts:265-266,309-310`
   Доказ: помилка "Не визначено власника записів" кидається на кожному елементі (потрапляє в `failed`-лічильник) замість того, щоб зупинити імпорт заздалегідь однією перевіркою
   Рекомендація: додати передумову-валідацію в `startImport`/UI перед стартом
   Складність: XS

6. **Не підтверджено наявність автоматичного циклу повторних викликів `importChunk` до завершення**
   Критичність: Середня (впливає на операційну придатність для 2000+ записів)
   Розташування: `src/lib/integrations.functions.ts` (не перевірено повністю), `src/components/integrations/ImportPanel.tsx` (не перевірено повністю), `src/routes/api/public/integrations/worker.tsx:20-30` (викликає лише `runQueue`/`runDuePolls`, не імпорт)
   Доказ: НЕ ПЕРЕВІРЕНО — коментар у коді стверджує "процес відновлюваний", але автоматичний планувальник саме для `importChunk` в переглянутих файлах не знайдено
   Рекомендація: перевірити фактичну оркестрацію; за потреби додати виклик `importChunk` у цикл `worker.tsx` або окремий cron-degistrator до статусу `done` по кожній сутності
   Складність: S (якщо потрібно лише додати виклик у worker) / M (якщо потрібен новий механізм)

7. **Реконсиляція після часткового збою сторінки не інкрементує номер сторінки**
   Критичність: Низька
   Розташування: `src/lib/integrations/keycrm/import.server.ts:129-134`
   Доказ: при помилці HTTP-запиту сторінки `upsertRun` викликається без оновлення `page`, тобто повторний запуск спробує ту саму сторінку — безпечно завдяки дедуплікації, але немає явного логування "retry той самої сторінки" окремо від звичайного прогресу
   Рекомендація: додати явний лічильник спроб на рівні сторінки для діагностики
   Складність: XS

## Загальний висновок

Перенесення **клієнтів і лідів** технічно можливе вже зараз за умови
попереднього налаштування `default_owner_id` та прийняття обмеження
"один власник на всі імпортовані записи". Перенесення **замовлень і
задач наразі неможливе** — відсутні цільові ERP-таблиці/writer'и; це
блокери 1 і 2 вище, обидва High.
