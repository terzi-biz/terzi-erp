# Аудит готовності Integration Core (TERZI ERP)

Дата аудиту: незалежна перевірка коду репозиторію, доступ лише на читання.
Обсяг: `src/lib/integrations/*.server.ts`, `src/lib/integrations/keycrm/*`,
`src/lib/integrations/binotel/*`, `src/lib/integrations.functions.ts`,
`src/lib/integrations-constants.ts`, `src/routes/integrations.tsx`,
`src/components/integrations/*`, `src/routes/api/public/integrations/*`,
міграції `supabase/migrations/202607*`, `202608*` з таблицями `integration_*`.

Методологія: жодного виклику keyCRM/Binotel API не виконувалось, жодних
записів у БД не робилось. Усі твердження підкріплені посиланням на файл:рядок
або конкретний рядок SQL-міграції. Там, де перевірити неможливо статичним
аналізом (наприклад, реальна поведінка зовнішнього API чи фактичний обсяг
даних у виробничій БД), позначено «НЕ ПЕРЕВІРЕНО» з причиною.

## 1. Архітектурний ланцюг

Очікуваний ланцюг: зовнішній сервіс → endpoint → журнал → валідація →
нормалізація → дедуплікація → бізнес-логіка → БД.

| Ланка | Стан | Доказ |
|---|---|---|
| Endpoint прийому вебхука | Є | `src/routes/api/public/integrations/webhook.$slug.tsx:7-96` — файловий маршрут `/api/public/integrations/webhook/$slug`, метод `POST` |
| Пошук інтеграції/вебхука за slug | Є | `webhook.$slug.tsx:19-28` — запит до `integration_webhooks` за `slug`+`direction=inbound`, перевірка `enabled` та `integration.enabled` |
| Валідація підпису до парсингу тіла | Є | `webhook.$slug.tsx:12` — `rawBody = await request.text()` читається і перевіряється (рядки 35-52) до `JSON.parse` (рядок 56) |
| Журналювання (webhook log) | Частково | Немає окремої таблиці "webhook log"; факт виклику фіксується оновленням `integration_webhooks.last_call_at` (`webhook.$slug.tsx:80`) і записом у `integration_event_logs` через `logAttempt` (рядки 81-89). Немає журналу самих HTTP-запитів (заголовки, IP, повне тіло) — зберігається лише замаскований preview (`core.server.ts:14-26`, `MAX_PREVIEW=4000`) |
| Нормалізація події | Є | `webhook.$slug.tsx:61-67` викликає `adapter.normalizeEvent`; реалізовано для keyCRM (`keycrm/adapter.server.ts:45-58`) і Binotel (`binotel/adapter.server.ts:118-132`); є дефолтний фолбек, якщо в адаптера немає `normalizeEvent` |
| Дедуплікація на вході (idempotency) | Є | `core.server.ts:103-138` (`enqueueEvent`) — унікальний `idempotency_key`, при колізії (гонка) — повторний SELECT і повернення `duplicate:true`. На рівні БД: `integration_events.idempotency_key UNIQUE` (`20260730022638…:152`) |
| Постановка в чергу (event queue) | Є | Таблиця `integration_events` (`20260730022638…:143-174`), статуси `pending/processing/done/failed/dead` |
| Обробка / бізнес-логіка | Є | `core.server.ts:146-219` (`processEvent`) викликає `adapter.handleInbound`/`adapter.send` |
| Запис у БД (ERP-таблиці) | Є (частково для keyCRM) | `keycrm/sync.server.ts:207-480` — writers для `pipelines`, `pipeline_statuses`, `buyers`→`crm_contacts`, `lead_cards`→`crm_leads`; для `orders`, `payments`, `companies`, `sources`, `managers`, `custom_fields`, `comments` — лише `applyReference` (рядки 405-418), що пише **тільки в `integration_sync_links.payload`**, без запису у власну ERP-таблицю замовлень |
| Повторні спроби (retry) | Є | `core.server.ts:140-143,180-194` — експоненційний бекоф за `RETRY_BACKOFF_MIN=[1,5,30,120,360]` хв (`integrations-constants.ts:59`), `next_retry_at`, `attempt`, `max_attempts` |
| Dead-letter | Є | `core.server.ts:182` — статус `dead` після вичерпання `max_attempts` (за замовчуванням 5, `20260730022638…:155`) |
| Тік черги (worker) | Є | `runQueue` (`core.server.ts:222-240`), викликається `POST /api/public/integrations/worker` (`worker.tsx:20-21`), обмежено 25 подіями за виклик |
| Реконсиляція (reconciliation) | Немає | Немає окремого процесу звірки повного стану ERP↔keyCRM після збою; є лише конфлікти при розбіжності хешів під час звичайного polling/import (`sync.server.ts:429-447`, таблиця `integration_conflicts`). Планового "diff-звірення" всього масиву записів не знайдено |

## 2. Таблиця наявності ключових механізмів

| Механізм | Є/Немає | Де саме |
|---|---|---|
| external_id | Є | `integration_sync_links.external_id` (`20260730032341…:55`, `UNIQUE(integration_id, entity, external_id)` рядок 66); також `crm_leads.external_id`, `crm_contacts.external_id`, `clients.external_id` (`20260730032341…:154-163`) |
| provider | Є | `integrations.provider_key` (`20260730022638…:34`), `integration_events.provider_key` (рядок 146) |
| source | Частково | Є `crm_leads.external_source`, `crm_contacts.external_source`, `clients.external_source` (`20260730032341…:154-163`); немає окремого поля "source" в самій `integration_events`/`integration_sync_links` — джерело визначається через `integration_id`→`provider_key` |
| idempotency key | Є | `integration_events.idempotency_key UNIQUE` (`20260730022638…:152`); формується в `core.server.ts:103-109` |
| event_id | Є | `integration_events.id` (PK), `integration_event_logs.event_id` (FK, `20260730022638…:179`) |
| webhook log | Часткове | Немає таблиці сирих HTTP-запитів вебхука; є `integration_webhooks.last_call_at` (одна мітка часу останнього виклику, `20260730022638…:130`) та `integration_event_logs` (замасковані preview, не повний raw request) |
| sync log | Є | `integration_sync_state.stats/last_status/last_error` (`20260730032341…:29-48`); `integration_import_runs` для імпорту (`20260801001013…:1-32`) |
| retry queue | Є | `integration_events.next_retry_at`, `attempt`, `status IN (pending,failed)` обробляються `runQueue` (`core.server.ts:222-240`) |
| failed/dead events | Є | `integration_event_status` enum включає `failed`,`dead` (`20260730022638…:6`); логіка переходу — `core.server.ts:182` |
| reconciliation | Немає | Див. п.1 — не знайдено коду повної звірки записів ERP↔keyCRM поза звичайним polling |
| status mapping | Немає адаптера-мапінгу статусів | keyCRM статуси воронок імпортуються як довідник `crm_stages` (`sync.server.ts:227-261`), але явного мапінгу "статус keyCRM → статус ERP" (перелік відповідностей) не знайдено; статус ліда в ERP визначається лише через прив'язку до `stage_id`, без окремої таблиці статус-мапінгу |
| user mapping | Часткове | Є `integration_line_map` для Binotel (лінія→`user_id`, `20260730032341…:118-134`); для keyCRM менеджерів (`managers`) є лише довідникове збереження через `applyReference` (сирий payload у `integration_sync_links`), реального мапінгу "keyCRM manager → ERP user" з записом відповідності не знайдено — новий лід/угода завжди отримує `owner_id` через `ownerFor()` (`sync.server.ts:174-180`), тобто `default_owner_id` з конфігу або `created_by` інтеграції, а не менеджера з keyCRM |
| custom field mapping | Є (UI) / Немає для keyCRM custom fields | Таблиця `integration_field_mappings` (`20260730022638…:198-220`) — загальний механізм для entity/source_field/target_field; проте `custom_fields` keyCRM імпортуються лише як довідник через `applyReference` (`keycrm-constants.ts:38`, `sync.server.ts:405-418`) — значення додаткових полів у самі ліди/картки не переносяться |
| raw payload | Є | `integration_events.payload jsonb` (`20260730022638…:150`), `integration_sync_links.payload jsonb` (`20260730032341…:63`) |
| payload hash | Є | `integration_events.dedup_hash` (`20260730022638…:153`), `integration_sync_links.external_hash`/`internal_hash` (`20260730032341…:58-59`), обчислення — `sync.server.ts:15-25` (`hashOf`/`stable`) |
| updated_at | Є | Присутнє майже в усіх `integration_*` таблицях з тригером `update_updated_at_column()` |
| external_updated_at | Є | `integration_sync_links.external_updated_at` (`20260730032341…:62`), заповнюється з `ext.updated_at` (`sync.server.ts:474`) |
| last_synced_at | Є | `integration_sync_links.last_synced_at` (`20260730032341…:61`); також `integration_sync_state.last_sync_at` (рядок 33) |

## 3. Готовність за майбутніми провайдерами

| Провайдер | Стан | Доказ |
|---|---|---|
| keyCRM | Адаптер реалізовано | `keycrm/adapter.server.ts` повний адаптер: testConnection, verifyWebhook, normalizeEvent, handleInbound, send; provider `is_implemented=true` (`20260730032341…:167`) |
| Binotel | Заглушка (schema-driven, очікує документацію) | `binotel/adapter.server.ts:1-7` — коментар прямо каже "режим підготовки"; `manifest.status = 'awaiting_documentation'` (`20260730032341…:188`); `base_url=null`, `credential_fields=[]` (рядки 189-190); `testConnection` завжди повертає `ok:false` поки маніфест не заповнено (`binotel/adapter.server.ts:80-96`) |
| WordPress | Тільки провайдер-запис (маніфест не заповнений) | Seed рядок у `integration_providers` (`20260730022638…:246`), `is_implemented=false`; жодного файлу-адаптера в `src/lib/integrations/` не знайдено, немає в `adapter.server.ts:82-86` REGISTRY |
| Lovable-лендінги | Нічого | Немає рядка провайдера, немає адаптера, немає згадок у коді чи міграціях |
| Калькулятор (на сайті) | Нічого | Аналогічно — не знайдено жодних артефактів |
| Telegram | Тільки провайдер-запис | Seed рядок (`20260730022638…:247`), `is_implemented=false`; адаптера немає в REGISTRY |
| GA4 | Нічого | Не знайдено провайдера, адаптера чи згадок |
| GTM | Нічого | Аналогічно |
| Google Ads | Тільки провайдер-запис | Seed рядок `google_ads` (`20260730022638…:245`), `oauth2`, `is_implemented=false`, адаптера немає |
| Meta Pixel | Нічого окремого | Є лише загальний рядок `meta` ("Meta Ads", реклама/ліди, `20260730022638…:244`) без розділення на Pixel/CAPI; адаптера немає |
| Meta CAPI | Нічого | Не виділено окремим провайдером, адаптера немає |
| Email | Нічого | Не знайдено провайдера ні адаптера |
| Файлові сховища | Нічого | Не знайдено провайдера ні адаптера |

Загальний висновок: ядро (`echo`, `keycrm`, `binotel`) зареєстроване в
`REGISTRY` (`adapter.server.ts:82-86`); усі інші провайдери в переліку — це
або рядок у `integration_providers` без реалізації (`WordPress`, `Telegram`,
`Google Ads`, `Meta`), або взагалі відсутні в системі (GA4, GTM, Meta CAPI,
email, файлові сховища, калькулятор, Lovable-лендінги). Ядро спроєктоване
розширюваним (`registerAdapter`, `adapter.server.ts:92-94`), але додавання
нового провайдера вимагає нового файлу-адаптера — жодних "no-code" заглушок,
які б щось реально робили, не існує.

## 4. Безпека інтеграційного периметра

### 4.1 Перевірка підпису вебхука (`signature.server.ts`)

- `verifyHmacSha256` (рядки 22-31) обчислює очікуваний HMAC-SHA256 і порівнює
  його з наданим через `timingSafeEqual` (рядки 7-12) — порівняння **стале за
  часом** (посимвольний XOR-акумулятор, а не `===`/`indexOf`), що коректно
  захищає від timing-атак для цього конкретного порівняння.
- Однак `verifyHmacSha256` (рядок 27) спершу робить `if (!provided) return false`
  і лише потім рахує хеш — це не є проблемою timing-атаки на сам HMAC, тому
  що коротке замикання відбувається до обчислення підпису.
- **Replay-вікно: відсутнє.** У жодному з методів перевірки підпису
  (`signature.server.ts`, `keycrm/adapter.server.ts:32-43`,
  `binotel/adapter.server.ts:99-116`) немає перевірки timestamp/nonce
  проти повторного відтворення раніше перехопленого валідного запиту.
  Захист від дублікатів існує лише на рівні бізнес-логіки через
  `idempotency_key`/`dedup_hash` (`core.server.ts:103-138`), що запобігає
  повторній *обробці*, але не забороняє системі *прийняти* (200 OK) і
  залогувати повторно надісланий валідний підпис необмежену кількість разів.
- **Коли `signatureMode === "none"`:** у `webhook.$slug.tsx:38-39` —
  `else if ((hook as any).signature_mode === "none") { verified = true; }`.
  Це означає, що для вебхука з `signature_mode="none"` підпис не
  перевіряється взагалі, і будь-хто, хто знає `slug`, може надіслати довільний
  payload, який буде прийнятий і поставлений у чергу на обробку. Це узгоджено
  з дизайном (keyCRM не підписує вебхуки і покладається на `endpoint_token`
  замість HMAC — коментар у `keycrm/adapter.server.ts:31`), але для keyCRM
  захист все ж є через `verifyWebhook` в самому адаптері (перевірка
  `x-endpoint-token`/`?token=`, `keycrm/adapter.server.ts:32-43`), яка
  викликається **до** гілки `signature_mode==="none"` (`webhook.$slug.tsx:36-39`,
  `adapter?.verifyWebhook` перевіряється першим). Тобто для keyCRM і Binotel
  реальний захист є, а `signature_mode:"none"` без адаптерної перевірки
  залишає ендпоінт повністю відкритим — це залежить від конфігурації
  конкретного `integration_webhooks` рядка, а не лише від коду.
- Секрет для перевірки — або `secret_ref` (посилання на env-змінну через
  `readSecret`, `core.server.ts:29-33`), або `endpoint_token` у самій таблиці
  БД у відкритому вигляді (`integration_webhooks.endpoint_token`,
  `20260730032341…:6`) — це поле **зберігається в БД як звичайний текст**, не
  через `secret_ref`/env. НЕ ПЕРЕВІРЕНО, чи є додатковий шар шифрування цієї
  колонки на рівні Supabase (потребує доступу до продакшн-конфігурації БД,
  що виходить за межі статичного аудиту read-only коду).

### 4.2 `/api/public/integrations/worker.tsx` — хто може викликати

- Захист є: `worker.tsx:11-18` вимагає заголовок `x-terzi-worker-secret`,
  який звіряється (посимвольно, стало за часом) з `process.env.INTEGRATIONS_WORKER_SECRET`.
- Якщо секрет не налаштовано (`!expected`), ендпоінт повертає `503` і **не
  виконує чергу** (рядок 13) — тобто немає fail-open поведінки, це коректно.
- Маршрут — публічний (`/api/public/...`), доступний без автентифікації
  Supabase, але захищений спільним секретом у заголовку. Це прийнятний
  патерн для виклику з pg_cron/зовнішнього планувальника (коментар у файлі,
  рядок 5), за умови що `INTEGRATIONS_WORKER_SECRET` не потрапляє в git і
  клієнтський бандл. НЕ ПЕРЕВІРЕНО фактичне значення/наявність секрета в
  середовищі виконання (це виходить за межі статичного аудиту, і його
  недопустимо перевіряти виводом значення).
- Немає rate-limiting чи IP-обмеження на сам ендпоінт — лише перевірка
  секрету; за відсутності HTTPS/TLS-термінації секрет теоретично можна
  перехопити, але це поза межами коду застосунку.

### 4.3 OAuth: перевірка `state` і обмеження redirect

- `state` перевіряється на існування, використаність (`used_at`) і термін дії
  (`expires_at`) — `oauth.callback.tsx:17-20`, одразу позначається як
  використаний (рядок 21), запобігаючи повторному застосуванню.
- `state` зберігається в окремій таблиці `integration_oauth_states` з PK на
  самому значенні `state` (`20260730022638…:87`), TTL через `expires_at`.
- **Redirect target обмежено жорстко в коді:** після успіху — завжди
  `Response.redirect`-подібна відповідь на константу `"/integrations?oauth=ok"`
  (`oauth.callback.tsx:80`), без урахування будь-якого користувацького вводу
  (`redirect_uri` з `state`-запису використовується лише як параметр у POST-запиті
  обміну токена до зовнішнього провайдера, рядок 33, а не як ціль браузерного
  редиректу). Отже, класична вразливість "open redirect" через `state`/query
  тут відсутня.
- Обмін коду на токен виконується сервером напряму до `token_url` з конфігу
  інтеграції (рядок 27-28) — `client_secret` читається лише через
  `ctx.secret("client_secret")` (env-посилання), не логується (див. §4.4).

### 4.4 Зберігання й читання секретів; чи потрапляють у браузер

- Секрети **не зберігаються в БД як значення**. Таблиця `integration_secrets`
  зберігає лише `secret_ref` (ім'я env-змінної) і `masked_hint` (частково
  замаскований підказка), сама модель прокоментована в SQL: "SECRET REFS
  (no values stored)" (`20260730022638…:63-64`).
- Реальне значення читається виключно на сервері через `process.env[ref]`
  (`core.server.ts:29-33`, `readSecret`).
- У списку інтеграцій для UI (`ops.server.ts`, `listIntegrationsOp`) секрети
  повертаються тільки як `{ id, secret_key, secret_ref, masked_hint,
  rotated_at, is_set }` — саме значення (`readSecret(...)`) використовується
  лише для обчислення булевого `is_set`, а не передається як рядок клієнту.
  `secret_ref` — це лише ім'я env-змінної (наприклад, `KEYCRM_API_KEY`), не
  секретне значення саме по собі.
- У всіх чотирьох компонентах `src/components/integrations/*.tsx`
  (`ImportPanel.tsx`, `SyncPanel.tsx`, `BinotelPanel.tsx`, `ConflictsPanel.tsx`)
  не знайдено жодного рендерингу значень `access_token`, `refresh_token`,
  `api_key`, `secret_ref`-значення чи повного `endpoint_token` — перевірено
  пошуком по вихідному коду компонентів (жодних збігів на реальні значення
  секретів, лише посилання на назви полів форм).
  НЕ ПЕРЕВІРЕНО: візуальний рендер сторінки `/integrations` у браузері
  (аудит суто статичний, без запуску UI), тому лишається залишковий ризик,
  якщо якийсь компонент поза переліком (наприклад форма редагування
  `integrations.tsx`) виводить `masked_hint` не замаскованим — `masked_hint`
  свідомо є лише частковою (перші 3 + останні 3 символи, `core.server.ts:35-39`,
  `maskHint`), тому навіть його показ у браузері не розкриває секрет цілком.
- Логи атак/подій (`logAttempt`, `core.server.ts:66-89`) маскують чутливі
  поля глибоко в об'єкті через `maskDeep` (рядки 14-26) за регуляркою
  `SENSITIVE` (рядок 11: `token|secret|password|pass|api[-_]?key|
  authorization|signature|refresh|client[-_]?secret`), що покриває основні
  назви полів, але це **захист за списком ключів**, а не за типом даних —
  якщо зовнішній сервіс поверне токен під нестандартною назвою поля
  (наприклад `"accessCode"`), він потрапить у `integration_event_logs`
  у відкритому вигляді. Це залишковий ризик, доказ відсутності контрзаходу —
  відсутність будь-якої додаткової перевірки за форматом значення (тільки за
  іменем ключа).

## 5. Підсумок і рекомендації (коротко)

1. Немає окремого повного "webhook access log" (raw headers/IP/body) —
   лише замаскований preview і мітка часу останнього виклику. Рекомендація:
   додати мінімальний append-only лог сирих вхідних запитів з TTL для
   forensics, окремо від `integration_event_logs`.
2. Немає replay-window (timestamp-перевірки) для HMAC-підписаних вебхуків —
   рекомендація додати перевірку `X-Timestamp`/`nonce` там, де провайдер це
   підтримує (Binotel, коли з'явиться документація).
3. `signature_mode="none"` за відсутності адаптерної `verifyWebhook`-логіки
   робить endpoint повністю відкритим — рекомендація заборонити створення
   вебхука з `signature_mode="none"` без явного `endpoint_token`.
4. Немає процесу повної реконсиляції (diff звірки) ERP↔keyCRM — лише
   поточний polling/import з конфлікт-чергою.
5. Мапінг keyCRM-менеджерів на ERP-користувачів і перенесення значень
   custom fields у самі записи — відсутні (є лише сирий довідник).
