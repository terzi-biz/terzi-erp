# Аудит продуктивності TERZI ERP

Дата: незалежний read-only аудит. Джерела доказів: `/tmp/audit/build.log` (production build, `bun run build`), `du` по `dist/client`, статичний аналіз `src/` та `supabase/migrations/*.sql`. Команда збірки нічого не змінювала в проєкті.

---

## 1. Розмір клієнтського бандла

Загальний розмір `dist/client`: **4.9 MB** (`du -sh dist/client`), увесь вміст лежить у `dist/client/assets` (4.9 MB).

Build log (`/tmp/audit/build.log`, клієнтська збірка Vite): `2340 modules transformed`, час клієнтської збірки `built in 13.20s`, SSR-збірки `built in 5.54s`, попередній прогін `built in 11.13s` (варіативність ±2с між прогонами).

Найбільші JS-чанки (з build.log, розмір після мінізації і gzip):

| Файл | Розмір | gzip |
|---|---|---|
| `index-p4BCKWgC.js` | 748.24 kB | 218.27 kB |
| `EstimateView-CWaXxyaS.js` | 624.00 kB | 183.27 kB |
| `settings-B6NwVpXI.js` | 359.42 kB | 120.83 kB |
| `index.es-DPoXIJay.js` | 159.26 kB | 53.14 kB |
| `integrations-CzFjsBpH.js` | 63.33 kB | 16.25 kB |
| `operations-BPUeUwEe.js` | 57.84 kB | 15.16 kB |
| `access-C-IwPMef.js` | 38.61 kB | 9.49 kB |
| `directions-editor-DgMoFdux.js` | 35.12 kB | 9.52 kB |
| `styles-CHudfQzr.css` | 121.41 kB (119K на диску) | 20.52 kB |

Vite сам попереджає в build.log (рядки 90-96):
```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking...
```
Це стосується `index-p4BCKWgC.js` (748 kB) і `EstimateView-CWaXxyaS.js` (624 kB) — обидва перевищують стандартний поріг Vite у 500 kB.

Статичні активи поза JS/CSS, які теж вантажаться в браузер:
- `terzi-footer-C6gN7zDa.png` — **1.1 MB** (найбільший файл у всьому dist/client, більший за будь-який JS-чанк).
- `NotoSans_700Bold-my-r4HAi.ttf` — 617 kB
- `NotoSans_400Regular-D96CXwz4.ttf` — 615 kB
- `terzi-header-14RcqP9v.jpg` — 177 kB

Сумарно два шрифти Noto Sans важать **1.23 MB**, а лого/футер PNG — **1.1 MB**: разом це майже половина всього dist/client (4.9 MB).

`vite.config.ts` не містить `build.rollupOptions.output.manualChunks` (перевірено `grep -n "manualChunks" vite.config.ts` — 0 збігів), тобто чанкування повністю віддане дефолтній евристиці Rollup/Vite, звідси гігантський `index-p4BCKWgC.js`.

## 2. Важкі бібліотеки: jspdf / html2canvas / xlsx / canvg — статичний чи динамічний імпорт

`grep -rn "from 'jspdf'|jspdf" src` дає точки імпорту:
- `src/lib/pdf.ts:1` — `import jsPDF from "jspdf";` (статичний, top-level)
- `src/lib/pdfFonts.ts:7` — `import type jsPDF from "jspdf";` (type-only, не впливає на бандл)
- `src/lib/pngExport.ts:11-12` — `import html2canvas from "html2canvas"; import jsPDF from "jspdf";` (статичні)
- `src/lib/price-import.ts:5` — `import * as XLSX from "xlsx";` (статичний)

У жодному з цих файлів немає `import(...)` (динамічного імпорту) — перевірено вручну по вмісту файлів. Отже **jspdf, html2canvas, xlsx підключені статично** в модулях `pdf.ts`, `pngExport.ts`, `price-import.ts`.

Фактичний ефект на бандл видно по SSR-збірці (розміри самих бібліотек, `dist/server/_libs/*.mjs`, ідентичні модулі йдуть і в клієнтський граф якщо їх статично імпортують компоненти сторінок):
- `jspdf.mjs` — 476.35 kB
- `xlsx.mjs` — 697.74 kB
- `html2canvas.mjs` — 349.31 kB
- `canvg.mjs` — 160.85 kB (транзитивна залежність jspdf/svg-у PDF, `svg-pathdata.mjs` 25.98 kB, `stackblur-canvas.mjs` 9.67 kB, `rgbcolor.mjs` 8.53 kB)

`canvg` в `src` напряму ніде не імпортується (`grep -rn canvg src` — 0 збігів) — він тягнеться транзитивно через `jspdf` (SVG-рендер у PDF) незалежно від того, чи потрібен він конкретній сторінці.

Це підтверджує клієнтський чанк `EstimateView-CWaXxyaS.js` (624 kB / 183 kB gzip) — саме цей компонент експорту кошторису імпортує `pdf.ts`/`pngExport.ts` і тому тягне jspdf+html2canvas+canvg у свій чанк. Chunk-код виноситься окремо від `index-*.js` (тобто певний рівень route-based splitting є — це не в головному бандлі), але сам чанк все одно завантажується повністю при відкритті перегляду кошторису, оскільки всередині `pdf.ts`/`pngExport.ts` немає `import()`, тож tree-shaking/lazy-split на рівні "поки не натиснув Експорт у PDF" не відбувається.

`price-import.ts` з `xlsx` (697.74 kB, найважча бібліотека в проєкті) імпортується статично і використовується в `src/components/PriceImportDialog.tsx` та `src/routes/settings.tsx` — це пояснює вагу `settings-B6NwVpXI.js` (359.42 kB / 120.83 kB gzip). `settings.tsx` завжди тягне повний парсер Excel навіть якщо користувач ніколи не імпортує прайс.

**Висновок**: жоден із чотирьох важких пакетів не є code-split за принципом "завантажити тільки коли викликана дія" (клік на "Експорт PDF" / "Імпорт Excel"). Вони прив'язані до route-чанків (`EstimateView`, `settings`), що краще, ніж потрапляння в головний `index.js`, але недостатньо: відкриття сторінки Налаштувань чи перегляду кошторису вже качає 350-620 kB коду, який може ніколи не використатись.

## 3. Code splitting за маршрутами

`grep -c lazy src/routes/*.tsx` = 0 — жоден маршрут не використовує `React.lazy` вручну; розбиття на чанки відбувається виключно за рахунок file-based роутингу TanStack Router (кожен файл маршруту — окремий Rollup-entry/чанк за замовчуванням).

Розподіл важких залежностей по route-чанках (за даними build.log):
- `EstimateView` (модуль перегляду кошторису, використовується з `history.tsx`, `screed.tsx`, `roofing.tsx` тощо) — 624 kB, тягне jspdf+html2canvas+canvg.
- `settings` — 359 kB, тягне xlsx (`price-import.ts`) + canvas-компоненти.
- `operations` — 57.84 kB (календар/канбан операцій, без важких бібліотек за прямими імпортами).
- `integrations` — 63.33 kB.
- `directions-editor` — 35.12 kB.

`index-p4BCKWgC.js` (748 kB, найбільший файл) — це фактично спільний vendor/root чанк (react, react-dom вже окремо в SSR-лібах, але для клієнта Vite звів роутер, react-query, zustand, lucide-react, tailwind-merge, radix-ui й основний рантайм в один файл через відсутність `manualChunks`). Він вантажиться на кожній сторінці незалежно від маршруту.

## 4. Дані без пагінації/ліміту

Пошук по `src/lib/*.functions.ts` (`select("*")` / `select(...)` без `.limit()`/`.range()`):

| Функція | Файл:рядок | Таблиця | Ліміт? | Прогноз рядків при 2000/5000/10000 клієнтів |
|---|---|---|---|---|
| `listClients` | `src/lib/clients.functions.ts:16-24` | `clients` | немає | 2000 / 5000 / 10000 рядків повністю на кожен рендер сторінки Клієнти |
| `listObjects` | `src/lib/objects.functions.ts:76` (`.from("objects").select("*").order("created_at", ...)`) | `objects` | немає | пропорційно кількості об'єктів (типово 1-3 об'єкти/клієнт) → 2000-30000 рядків |
| `listEstimates` | `src/lib/estimates.functions.ts:169` (`.from("estimates").select("*").order("created_at", ...)`) | `estimates` | немає | при 5000 замовлень (orders) практично весь `estimates` (кожне замовлення ~1 кошторис) — 5000+ рядків завантажується в `history.tsx` і `index.tsx` одним запитом |
| `listCalendarEvents` | `src/lib/calendar.functions.ts:6-21` | `calendar_events` | немає ліміту, лише діапазон дат `gte/lt` | без обмеження по кількості записів в діапазоні — при 50000 задачах, якщо частина мапиться в події календаря, тижневий/місячний вигляд може повертати тисячі рядків без `.limit()` |
| `listLeads` | `src/lib/crm.functions.ts:94-100` | `crm_leads` | `.limit(500)` — є | при 1000 активних лідів канбан бачить лише перші 500 за `updated_at desc`, решта лідів **зникають з UI** (тиха втрата даних, не збій) |
| `listContacts` | `src/lib/crm.functions.ts:31-36` | `crm_contacts` | `.limit(500)` — є | обрізання при >500 контактів |

Крім того, `getObject` (`src/lib/objects.functions.ts:110-128`) на відкриття однієї картки об'єкта виконує **8 послідовних/паралельних запитів** без ліміту на `object_status_history` (лімітовано `.limit(200)`, рядок 126) і без ліміту на `object_files`, `object_comments`, `crew_bookings`, `estimates` (рядки 124-128) — при об'єкті з великою історією (типово для довгих проєктів TERZI) це необмежене зростання.

`listObjects` (рядок 76) додатково після основного запиту виконує N+1-подібне довантаження: `object_services.in("object_id", ids)` і `clients.in("id", clientIds)` (рядки 84-86) — при 10000 об'єктів `ids`-масив в `.in()` буде містити 10000 UUID в одному запиті, що є ризиком по розміру URL/payload у PostgREST.

## 5. Рендеринг великих списків без віртуалізації

Жоден із перевірених файлів не використовує `react-window`/`react-virtual`/`Virtual` (`grep -rn "Virtual|react-window|react-virtual" src` — 0 збігів у всьому проєкті).

- `src/routes/crm.leads.tsx:144` — Kanban-колонка: `{items.map((l) => (...))}` — усі ліди етапу рендеряться одразу в DOM без обмеження висоти/вікна; при `listLeads` ліміті 500 і кількох етапах це може бути сотні DOM-вузлів на колонку, кожен — картка з подіями drag-and-drop.
- `src/routes/clients.tsx:158` — `{(clients as Client[]).map((c) => {...})}` — плоский рендер усіх клієнтів у таблицю; при 10000 клієнтах — 10000 `<tr>` без пагінації чи вікна прокрутки.
- `src/routes/history.tsx:170` — `{(rows as EstimateRow[]).map((e) => {...})}` — таблиця кошторисів, кожен рядок містить `<select>` зі статусом (керований компонент, own state per row); при 5000 замовленнях — 5000 контрольованих `<select>` в одному дереві, кожен ререндер таблиці зачіпає весь список.
- `src/routes/objects.index.tsx:97` — `{rows.map((r: any) => (...))}` — аналогічно, плоска таблиця об'єктів без вікна відображення.
- `src/routes/operations.tsx:661` (`dayEvents.map`) та `:723`/`:797` (тижневий вигляд, `items.slice(0, 3)` і повний `items.map`) — денна колонка рендерить усі події дня без віртуалізації; `items.slice(0,3)` (рядок 723) — це єдине місце, де застосовано штучне обмеження (показ трьох подій + "ще N"), решта колонок повного рендеру не обмежують.

Жодна з таблиць не використовує пагінацію на UI-рівні (немає `page`/`pageSize` в `useQuery` для `clients`, `history`, `objects.index`) — обмеження, якщо є, задається лише на сервері (`crm_leads`/`crm_contacts` ліміт 500), а `clients`, `estimates`, `objects` не обмежені навіть там.

## 6. React Query: staleTime, дублікати, enabled

`new QueryClient()` створюється без `defaultOptions` (`src/router.tsx:6`) — тобто діють дефолти TanStack Query: `staleTime: 0`, `refetchOnWindowFocus: true`, `refetchOnMount: true`. Жоден маршрут з перевірених (`access.tsx`, `clients.tsx`, `crm.*.tsx`, `history.tsx`, `index.tsx`, `integrations.tsx`, `objects.$id.tsx`) не передає власний `staleTime` в `useQuery`, окрім:
- `src/routes/integrations.tsx:73` — `refetchInterval: 30000` для `int-stats` (polling кожні 30с, доречно).
- `enabled` гейти присутні там, де потрібні дані підв'язані до вибору: `crm.leads.tsx:86` (`enabled: !!openId`), `integrations.tsx:458` (`enabled: !!active?.id`), `integrations.tsx:537` (`enabled: !!openId`), `history.tsx:77` / `index.tsx:28` (`enabled: !!user`).

Дублікати запитів на однакові дані під різними query key виявлено:
- `["crm","leads"]` викликається окремо і в `crm.index.tsx:49`, і в `crm.leads.tsx:46` — при переході між дашбордом CRM і Kanban-воронкою кеш не перевикористовується між маршрутами (staleTime=0 означає рефетч при кожному mount), тобто дані `crm_leads` (обмежені 500 рядками) вантажаться повторно на кожній навігації.
- Аналогічно `["crm","tasks"]` (`crm.index.tsx:50`, `crm.tasks.tsx:37`), `["crm","requests"]` (`crm.index.tsx:51`, `crm.requests.tsx:42`), `["crm","calls"]` (`crm.index.tsx:52`, `crm.calls.tsx:34`) — усі чотири CRM-довідники рефетчаться і на дашборді, і на власній сторінці, без спільного кешу `staleTime`, отже кожен перехід "Dashboard → Leads → Dashboard" — це щонайменше 2 повторних мережевих виклики на однакові дані.
- `["access-roles"]` дублюється в `access.tsx:123`, `:491`, `:582` — три незалежні `useQuery` на один і той самий довідник ролей у різних під-компонентах сторінки Access; за замовчуванням TanStack Query дедуплікує паралельні запити з однаковим ключем в межах активного вікна, але при staleTime=0 кожен новий mount компонента (наприклад, розкриття вкладки) ініціює новий фетч.

Оскільки `staleTime` ніде не піднято вище 0 (окрім відсутності явного налаштування = 0 за замовчуванням), при поверненні фокусу вікна браузера (`refetchOnWindowFocus: true` за замовчуванням) усі відкриті query на сторінці рефетчаться одночасно — для сторінки CRM Dashboard це 5 паралельних запитів (`pipelines`, `leads`, `tasks`, `requests`, `calls`) при кожному переключенні вкладки браузера.

## 7. Календар: скільки подій вантажиться на вигляд

`src/lib/calendar.functions.ts:6-21` (`listCalendarEvents`) фільтрує лише за `starts_at` в діапазоні `[fromISO, toISO)` та опційними `employeeId/crewKey/objectId/statuses` — **без `.limit()`**. Розмір вигляду задає сам клієнт (`operations.tsx`) через `fromISO/toISO`; для денного вигляду це один день, для тижневого — 7 днів, але кількість подій на день не обмежена сервером. `src/lib/calendar.server.ts` містить лише Zod-схеми (`eventFilterSchema`, `calendarEventPayload`) — жодної серверної логіки ліміту чи пагінації, увесь контроль обсягу — тільки календарний діапазон дат.

Отже при активному навантаженні (наприклад, бригади з великою кількістю задач/подій на об'єкт) тижневий вигляд `operations.tsx` (рендер `dayEvents.map`, рядок 661, без віртуалізації, див. п.5) отримує необмежену за кількістю вибірку `calendar_events` за 7 днів і рендерить усе в DOM.

## 8. Зображення та шрифти

- Лого/хедер/футер: `src/lib/pdf.ts:2-3` та `src/lib/pngExport.ts:13-14` імпортують `@/assets/terzi-header.jpg` та `@/assets/terzi-footer.png` як статичні асети Vite — на диску це `terzi-header-14RcqP9v.jpg` (177 kB) і `terzi-footer-C6gN7zDa.png` (**1.1 MB**, найважчий файл у всій збірці). PNG-футер у 1.1 MB для банерного зображення в PDF-документі не оптимізований (немає ознак стиснення/ресайзу — типовий скріншот/експорт без компресії).
- Шрифти Noto Sans для кирилиці в PDF: `src/lib/pdfFonts.ts:5-6` — `import notoRegularUrl from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url"` і Bold-варіант, підключені через `?url` (тобто самі TTF не інлайняться в JS, а вантажяться окремим HTTP-запитом лише коли викликається `attachCyrillicFonts`, рядок 22) — це і є `NotoSans_400Regular-D96CXwz4.ttf` (615 kB) та `NotoSans_700Bold-my-r4HAi.ttf` (617 kB) у `dist/client/assets`. Це єдиний коректно відкладений (лінивий за фактом використання) важкий ресурс у проєкті: шрифти якщо і завантажуються, то тільки в момент генерації PDF (`fetchAsBase64`, рядок 12), а не при вході на сторінку. Втім самі файли по 615-617 kB кожен (Regular+Bold = 1.23 MB) не субсетовані (весь Noto Sans, а не тільки кирилиця+латиниця, які реально потрібні для документів TERZI).

## 9. Індекси БД: що є і чого не вистачає

Наявні індекси (`grep CREATE INDEX supabase/migrations/*.sql`, 11 файлів, ключові):
`estimates(owner_id)`, `estimates(client_id)`, `estimates(object_id)`, `estimates(schedule_start_at)`, `estimates(module, status)`, `catalog_items(module, kind)`, `crew_bookings(date)`, `crew_bookings(brigade_key)`, `crew_bookings(object_id)`, `estimate_audit_log(estimate_id, created_at desc)`, `objects(client_id)`, `objects(manager_id)`, `estimate_versions(estimate_id)`, `calendar_events(starts_at)`, `calendar_events(employee_id)`, `calendar_events(crew_key)`, `calendar_events(object_id)`, `audit_logs(created_at desc)`, `audit_logs(actor_id)`, `audit_logs(module)`, `integration_events(status, next_retry_at)`, `integration_events(integration_id, created_at desc)`, `crm_contacts(phone_norm)`, `crm_contacts(client_id)`, `crm_leads(stage_id)`, `crm_leads(owner_id)`, `crm_leads(next_action_at)`, `crm_requests(status)`, `crm_calls(started_at desc)`, `crm_tasks(due_at)`, `crm_tasks(status)`, `crm_lead_activities(lead_id, created_at desc)`, `integration_sync_links(integration_id, entity, internal_id)`, `crm_leads(external_source, external_id)`, `crm_contacts(external_source, external_id)`, `clients(external_source, external_id)`.

Загалом покриття непогане для CRM/estimates/calendar. Виявлені прогалини щодо реальних запитів UI:

1. **`crm_leads.assigned_to` — індексу немає.** UI фільтрує канбан за менеджером ("відповідальний") через поле `assigned_to` (заповнюється в `upsertLead`, `src/lib/crm.functions.ts:110`: `assigned_to: context.userId`), проте `grep -n CREATE INDEX` по `crm_leads` дає лише `stage_id`, `owner_id`, `next_action_at`, `external_*`. Якщо в UI/RLS є фільтр "мої ліди" по `assigned_to`, кожен такий запит піде повним сканом `crm_leads` при 1000+ активних лідах.
2. **`clients` — немає жодного функціонального індексу**, окрім `external_source, external_id`. `listClients` (`clients.functions.ts:16-24`) сортує `order("created_at", {ascending:false})` без `.limit()` — без індексу на `created_at` це сортування 2000-10000 рядків без where-фільтра виконає seq scan + sort щоразу.
3. **`objects` — немає індексу на `created_at`**, хоча `listObjects` (`objects.functions.ts:76`) сортує саме за ним; є лише `client_id` і `manager_id`.
4. **`calendar_events` — немає складеного індексу `(starts_at, employee_id)` чи `(starts_at, crew_key)`.** Запит `listCalendarEvents` (`calendar.functions.ts:11-21`) завжди фільтрує `starts_at` діапазоном ТА (опційно) `employee_id`/`crew_key`/`object_id`; наявні лише одиночні індекси на кожній колонці окремо — Postgres для комбінації "діапазон дат + конкретний співробітник" не зможе ефективно використати bitmap-and на двох одиночних btree-індексах так само добре, як складений `(employee_id, starts_at)` або `(crew_key, starts_at)`.
5. **`estimates` — немає індексу на `status`** окремо (є лише складений `module, status`), а `history.tsx`/UI фільтрують і сортують за статусом і датою окремо в кількох місцях (`updateEstimateStatus`, рядок 286-289) — не критично, бо оновлення йде по `id`, але вибірки "усі кошториси певного статусу" (якщо є така фільтрація на клієнті — вона зараз клієнтська, не серверна, бо `listEstimates` не приймає status-параметр) взагалі не використовують індекс, бо фільтрація виконується в JS після завантаження всього набору.
6. `integration_sync_links` — індекс `(integration_id, entity, internal_id)` є і покриває основний lookup, окрема перевірка не виявила проблем тут.
7. `audit_logs(created_at desc)` є — відповідає використанню в security overview (`access.tsx` сторінка Access/Security), проблем не виявлено.

## 10. Прогнозована поведінка при масштабуванні

Сценарій: 2000 / 5000 / 10000 клієнтів, 1000 активних лідів, 5000 замовлень (estimates), 50000 задач (crm_tasks/calendar), 20 одночасних користувачів.

**2000 клієнтів — деградує.**
`listClients` (`clients.functions.ts:16-24`) завантажує всі 2000 рядків без ліміту при кожному відкритті `/clients` (staleTime=0 → рефетч при кожному mount/фокусі вікна). `clients.tsx:158` рендерить усі 2000 `<tr>` без віртуалізації. При 20 одночасних користувачах на сторінці Клієнти — 20 паралельних `select *` без ліміту й без індексу на `created_at` (п.9.2), сортування виконується на кожен запит без покриваючого індексу.

**5000 клієнтів — деградує суттєвіше.** Той самий запит повертає вже 5000 рядків JSON на кожен рефетч; рендер 5000 DOM-рядків у React без `key`-стабільного вікна прокрутки типово дає помітні лаги скролу і збільшення TTI сторінки на секунди.

**10000 клієнтів — ламається для практичного використання.** Payload `select("*")` без ліміту на 10000 рядків клієнтів (з полями `notes` до 2000 символів, `address` до 500) може досягати кількох мегабайтів JSON на кожен запит; рендер 10000 контрольованих рядків таблиці без віртуалізації (п.5) — очікуване зависання вкладки на кілька секунд при відкритті сторінки, погіршене відсутністю індексу на `created_at` (seq scan + sort на боці Postgres).

**1000 активних лідів — деградує, частково ламається функціонально.** `listLeads` (`crm.functions.ts:94-100`) має `.limit(500)` — при 1000 лідах **500 найстаріших за `updated_at` лідів просто не потраплять у Kanban** (`crm.leads.tsx:46`, `crm.leads.tsx:144` рендерить лише те, що прийшло). Це не падіння, а тиха втрата видимості даних — критичніше за просідання швидкості.

**5000 замовлень (estimates) — ламається по продуктивності сторінки Історія.** `listEstimates` (`estimates.functions.ts:169`) без ліміту віддає всі 5000 кошторисів одним запитом; `history.tsx:170` рендерить 5000 рядків, кожен з власним контрольованим `<select>` (керований стан статусу) — це 5000 React-компонентів з обробниками подій в одному дереві без пагінації/віртуалізації. Очікується суттєве уповільнення першого рендеру і будь-якого ре-рендеру таблиці (наприклад, при зміні статусу одного рядка React все одно узгоджує весь список).

**50000 задач — ламається для календаря/операцій.** `listCalendarEvents` (`calendar.functions.ts:6-21`) не має ліміту; для тижневого вигляду `operations.tsx` (рендер `dayEvents.map`, рядок 661, без віртуалізації) — якщо частина з 50000 задач мапиться в події з датами в поточному тижні, кількість подій на день/тиждень для активної компанії з таким обсягом задач може вимірюватися сотнями-тисячами, і DOM-рендер без вікна прокрутки та без ліміту серверного запиту стане вузьким місцем.

**20 одночасних користувачів — посилює всі вищенаведені проблеми лінійно.** Оскільки `staleTime` не встановлено (`src/router.tsx:6`, дефолт 0) і `refetchOnWindowFocus` увімкнено за замовчуванням, кожне перемикання фокуса вкладки в браузера будь-яким з 20 користувачів ре-ініціює усі активні запити на сторінці (для CRM Dashboard — 5 запитів одночасно, п.6) — навантаження на Supabase зростає пропорційно кількості одночасно відкритих вкладок, а не кількості реальних змін даних.

**Зведений вердикт:**

| Сценарій | Вердикт | Причина |
|---|---|---|
| 2000 клієнтів | деградує | `listClients` без ліміту + рендер без віртуалізації (`clients.tsx:158`) |
| 5000 клієнтів | деградує | те саме, більший payload і DOM |
| 10000 клієнтів | ламається | payload у кілька МБ на кожен рефетч, seq scan без індексу на created_at, 10000 DOM-рядків |
| 1000 активних лідів | деградує/ламається функціонально | `.limit(500)` в `listLeads` ховає половину лідів з Kanban |
| 5000 замовлень | ламається | `listEstimates` без ліміту, 5000 контрольованих рядків у `history.tsx` |
| 50000 задач | ламається | `listCalendarEvents` без ліміту, рендер подій без віртуалізації в `operations.tsx` |
| 20 одночасних користувачів | деградує | `staleTime=0` + `refetchOnWindowFocus` мультиплікує навантаження на Supabase |

---

## 11. Перелік проблем

1. **Відсутність ліміту при вибірці клієнтів**
   Критичність: висока
   Розташування: `src/lib/clients.functions.ts:16-24` (`listClients`)
   Доказ: `.from("clients").select("*").order("created_at", {ascending:false})` без `.limit()`/`.range()`
   Рекомендація: серверна пагінація (`.range()`) + курсор або `limit` з підвантаженням по скролу
   Складність: M

2. **Відсутність ліміту при вибірці кошторисів (`listEstimates`)**
   Критичність: висока
   Розташування: `src/lib/estimates.functions.ts:169`
   Доказ: `.from("estimates").select("*").order("created_at", {ascending:false})` без ліміту; рендер у `src/routes/history.tsx:170` без віртуалізації
   Рекомендація: пагінація на сервері + віртуалізований список/таблиця на клієнті
   Складність: M

3. **Жорсткий `.limit(500)` у `listLeads` без пагінації — приховані дані**
   Критичність: критична
   Розташування: `src/lib/crm.functions.ts:94-100`, споживається `src/routes/crm.leads.tsx:46,144`
   Доказ: `.limit(500)` без `.range()`/курсора; при >500 лідів частина не відображається в Kanban
   Рекомендація: пагінація per stage або підвищення ліміту з курсорною довантажкою по мірі скролу колонки
   Складність: M

4. **Календар без обмеження кількості подій на вигляд**
   Критичність: висока
   Розташування: `src/lib/calendar.functions.ts:6-21` (`listCalendarEvents`), рендер `src/routes/operations.tsx:661`
   Доказ: запит фільтрує лише `starts_at` діапазоном, без `.limit()`; рендер `dayEvents.map` без вікна
   Рекомендація: серверний ліміт на кількість подій в діапазоні + віртуалізація денної/тижневої колонки
   Складність: M

5. **Відсутність віртуалізації у великих таблицях/каналах**
   Критичність: висока
   Розташування: `src/routes/clients.tsx:158`, `src/routes/history.tsx:170`, `src/routes/objects.index.tsx:97`, `src/routes/crm.leads.tsx:144`
   Доказ: прямі `.map()` без `react-window`/`react-virtual` (перевірено: 0 збігів у проєкті)
   Рекомендація: впровадити `@tanstack/react-virtual` для таблиць/канбан-колонок
   Складність: L

6. **`staleTime` не налаштовано (дефолт 0) + дублікати query key для CRM-довідників**
   Критичність: середня
   Розташування: `src/router.tsx:6` (`new QueryClient()` без `defaultOptions`); дублі `["crm","leads"/"tasks"/"requests"/"calls"]` в `crm.index.tsx:49-52` та відповідних сторінках
   Доказ: `new QueryClient()` без параметрів; ідентичні query key в двох компонентах кожен раз рефетчаться при переході між сторінками
   Рекомендація: встановити глобальний `staleTime` (наприклад 30-60с) для довідникових даних, використати спільний `QueryClient`-кеш між дашбордом і деталізованими сторінками
   Складність: S

7. **jspdf/html2canvas/xlsx підключені статичним `import`, а не `import()`**
   Критичність: середня
   Розташування: `src/lib/pdf.ts:1`, `src/lib/pngExport.ts:11-12`, `src/lib/price-import.ts:5`
   Доказ: жодного `import()` у цих файлах; SSR-модулі `jspdf.mjs` 476 kB, `html2canvas.mjs` 349 kB, `xlsx.mjs` 697.74 kB підтягуються в чанки `EstimateView-CWaXxyaS.js` (624 kB) і `settings-B6NwVpXI.js` (359 kB)
   Рекомендація: перевести виклики генерації PDF/експорту PNG/імпорту Excel на динамічний `import()` у момент дії користувача (клік "Експорт"/"Імпорт")
   Складність: M

8. **Відсутність `manualChunks`, головний бандл 748 kB**
   Критичність: середня
   Розташування: `vite.config.ts` (немає `build.rollupOptions.output.manualChunks`)
   Доказ: `index-p4BCKWgC.js` 748.24 kB / 218.27 kB gzip, попередження Vite в build.log ("Some chunks are larger than 500 kB")
   Рекомендація: налаштувати `manualChunks` для виділення vendor-груп (react/react-dom, radix-ui, tanstack-router/query окремо)
   Складність: M

9. **Неоптимізоване зображення footer PNG (1.1 MB)**
   Критичність: низька
   Розташування: `dist/client/assets/terzi-footer-C6gN7zDa.png`, джерело `src/lib/pdf.ts:3`, `src/lib/pngExport.ts:14` (`@/assets/terzi-footer.png`)
   Доказ: `du -ah dist/client/assets` — 1.1M, найважчий файл усієї збірки
   Рекомендація: стиснути/конвертувати в WebP або оптимізований PNG, зменшити роздільність під реальний розмір у PDF
   Складність: XS

10. **Нестиснуті/несабсеченні шрифти Noto Sans для PDF (1.23 MB сумарно)**
    Критичність: низька
    Розташування: `src/lib/pdfFonts.ts:5-6`
    Доказ: `NotoSans_400Regular-D96CXwz4.ttf` 615K, `NotoSans_700Bold-my-r4HAi.ttf` 617K у `dist/client/assets`
    Рекомендація: субсетувати шрифт (кирилиця+латиниця+цифри) через `pyftsubset`/`glyphhanger`, зменшивши вагу файлів у рази
    Складність: S

11. **Відсутність індексу на `crm_leads.assigned_to`**
    Критичність: середня
    Розташування: `supabase/migrations` — індекси `crm_leads` покривають `stage_id`, `owner_id`, `next_action_at`, `external_*`, але не `assigned_to`; заповнюється в `src/lib/crm.functions.ts:110`
    Доказ: `grep CREATE INDEX` по `crm_leads` — немає `assigned_to`
    Рекомендація: `CREATE INDEX crm_leads_assigned_to_idx ON public.crm_leads(assigned_to);` якщо є фільтрація "мої ліди" по цьому полю
    Складність: XS

12. **Відсутність індексу на `clients.created_at` та `objects.created_at`**
    Критичність: середня
    Розташування: запити `src/lib/clients.functions.ts:16-24` та `src/lib/objects.functions.ts:76` сортують за `created_at`, індексів на цій колонці немає в жодній міграції
    Доказ: `grep CREATE INDEX supabase/migrations/*.sql` — немає збігів для `clients(created_at)` чи `objects(created_at)`
    Рекомендація: додати `CREATE INDEX ... ON clients(created_at DESC)` та аналогічний для `objects`, паралельно з переходом на серверну пагінацію (проблема 1)
    Складність: XS

13. **`calendar_events` без складеного індексу під реальний фільтр (дата+співробітник/бригада)**
    Критичність: середня
    Розташування: запит `src/lib/calendar.functions.ts:11-21`; існуючі індекси — окремо на `starts_at`, `employee_id`, `crew_key`, `object_id`
    Доказ: `grep CREATE INDEX` на `calendar_events` — 4 одиночні індекси, жодного складеного
    Рекомендація: `CREATE INDEX ON calendar_events(employee_id, starts_at)` та/або `(crew_key, starts_at)` під найчастіші комбінації фільтра
    Складність: S

14. **N+1-подібне довантаження в `listObjects` через великі `.in()`-масиви**
    Критичність: середня
    Розташування: `src/lib/objects.functions.ts:84-86`
    Доказ: `object_services.in("object_id", ids)` і `clients.in("id", clientIds)` — розмір масиву `ids` дорівнює кількості завантажених об'єктів (необмежене, бо основний запит рядок 76 без ліміту)
    Рекомендація: після впровадження пагінації для `listObjects` (пов'язано з проблемою 1) розмір `.in()` природно обмежиться розміром сторінки
    Складність: M
