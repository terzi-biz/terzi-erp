# Аудит бекенду TERZI ERP

Метод: статичний аналіз коду (read-only), без запуску сервера й без звернень до БД. Стек: TanStack Start v1 `createServerFn`, `*.server.ts`, публічні маршрути `src/routes/api/public/*`, Supabase Postgres. Повний перелік функцій — у `docs/audit/API_AND_FUNCTION_MATRIX.md`.

## 1. Загальна картина авторизації

`src/start.ts:21-23` реєструє `attachSupabaseAuth` як єдиний глобальний `functionMiddleware` — він лише **додає** Bearer-токен на клієнті (`src/integrations/supabase/auth-attacher.ts:8-13`), а не перевіряє його на сервері. Реальна авторизація виконується локально в кожній серверній функції через `.middleware([requireSupabaseAuth])` (`src/integrations/supabase/auth-middleware.ts:9-77`).

Перевірка: жодна функція з переглянутих 12 модулів (`*.functions.ts`) не викликається без `.middleware([requireSupabaseAuth])`, крім `getGreeting` (`src/lib/api/example.functions.ts:14`) — навчальний приклад без доступу до БД/PII, і трьох маршрутів `src/routes/api/public/integrations/*`, які за задумом публічні (webhook/oauth/worker) і захищені окремими механізмами (підпис, one-time state, спільний секрет). SSR-loader'ів у `src/routes`, які викликали б захищені server functions без токена, не знайдено (проєкт працює як SPA — `grep -rn "loader"` по `src/routes` не дав результатів), тому ризик "SSR 401" відсутній.

Ключовий структурний висновок: рольова модель подвійна і неузгоджена — існує сучасна система `access.server.ts` (`user_access`, `role_permissions`, `user_permission_overrides`) і паралельна легасі-система `user_roles` (`has_role` RPC, перевірки `role === "admin" || role === "director"` у кількох файлах). Це джерело кількох знайдених проблем.

## 2. Перелік проблем

### 2.1 [CRITICAL] Немає rate limit на перевірку пароля власника — можливий brute-force
Файл:рядок: `src/lib/access-ops.server.ts:631-644`, виклик з `src/lib/access.functions.ts:234-237`.
Доказ:
```ts
export async function verifyOwnerPasswordOp(userId: string, password: string) {
  await requireOwner(userId);
  ...
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Пароль не підтверджено");
```
Вплив на бізнес: критична дія (підтвердження пароля власника перед незворотними операціями) може бути підібрана перебором — власник компанії втрачає єдиний "останній рубіж" захисту.
Вплив технічний: немає лічильника невдалих спроб, немає лока/затримки, немає запису в `audit_logs` про невдалі спроби.
Рекомендація: додати rate-limit (наприклад, лічильник у `user_access`/окремій таблиці, exponential backoff, максимум N спроб/годину) і аудит-запис на кожну спробу (успішну і невдалу).
Складність: S.

### 2.2 [HIGH] `pushIntegrationRecord` — ідемпотентність зламана через `Date.now()` у ключі
Файл:рядок: `src/lib/integrations/sync-ops.server.ts:88-109`.
Доказ:
```ts
idempotencyKey: `push:${integration.id}:${input.entity}:${input.internalId}:${Date.now()}`,
```
Вплив на бізнес: подвійний клік або повторний виклик з UI створює дублікати вихідних подій до зовнішньої CRM (наприклад, дубльований лід/замовлення у keyCRM).
Вплив технічний: `enqueueEvent` (`src/lib/integrations/core.server.ts:103-138`) дедуплікує саме за `idempotencyKey`, але тут ключ навмисно робиться унікальним щоразу — механізм ідемпотентності повністю знецінюється для цього шляху.
Рекомендація: прибрати `Date.now()` з ключа, залишити `push:{integrationId}:{entity}:{internalId}` (або додати часове вікно округлення, якщо повторний push через якийсь час має бути дозволений).
Складність: XS.

### 2.3 [HIGH] Необмежені (без `.limit()`/`.range()`) вибірки на таблицях, що ростимуть понад 2000 рядків
Файл:рядок і доказ:
- `src/lib/clients.functions.ts:18-21`: `context.supabase.from("clients").select("*").order("created_at", ...)` — без ліміту.
- `src/lib/estimates.functions.ts:168-170` (`listEstimates`): `.from("estimates").select("*").order("created_at", ...)` — без ліміту.
- `src/lib/objects.functions.ts:75-77` (`listObjects`): `.from("objects").select("*").order("created_at", ...)` — без ліміту.
- `src/lib/integrations.functions.ts` → `queueStatsOp` (`src/lib/integrations/ops.server.ts:402-409`): `db.from("integration_events").select("status")` — читає **всі** рядки таблиці подій лише для підрахунку статусів.
Вплив на бізнес: за росту бази (клієнти, кошториси, об'єкти в тисячах) сторінки почнуть вантажитись повільніше й врешті падати по таймауту/пам'яті; для `queueStatsOp` — деградація зі зростанням історії інтеграцій, яка не чиститься.
Вплив технічний: повне сканування таблиці на кожен запит, ріст навантаження на Postgres і на serverless-функцію (розмір відповіді), відсутність курсорної/офсетної пагінації в API взагалі для цих ендпоінтів.
Рекомендація: додати `.range()`/`.limit()` з пагінацією на клієнті (курсор за `created_at`+`id`), для `queueStatsOp` — замінити на `count(*) group by status` через RPC/агрегатний запит або матеріалізовану статистику.
Складність: M (потрібні зміни і на клієнті для пагінації).

### 2.4 [HIGH] N+1 запити в синхронізації keyCRM
Файл:рядок: `src/lib/integrations/keycrm/sync.server.ts:596-612` (цикл `for (const item of items)` з `await applyExternal(...)` на кожен елемент) та вкладені `src/lib/integrations/keycrm/sync.server.ts:627-637` (`extractOrderChildren`/`extractLeadComments`, кожен зі своїм `for` + `await applyReference` на елемент), а також `src/lib/integrations/keycrm/sync.server.ts:556-562` (пагінація статусів воронок: окремий HTTP-запит на кожен pipeline).
Доказ:
```ts
for (const item of items) {
  try {
    const res = await applyExternal(ctx, entity, item, opts.mode);
    ...
    if (entity === "orders") await extractOrderChildren(ctx, item);
    if (entity === "lead_cards") await extractLeadComments(ctx, item);
```
Вплив на бізнес: повна синхронізація з keyCRM (сотні/тисячі записів) виконується послідовно, по 3-5+ окремих SQL/HTTP запитів на кожен запис — синхронізація може не встигнути в межах serverless-таймауту, дані застарівають.
Вплив технічний: лінійне зростання часу виконання й кількості round-trip до БД/зовнішнього API пропорційно кількості записів; немає батчингу (`upsert` масивом), немає паралелізації з обмеженням конкурентності.
Рекомендація: перейти на батчові `upsert` там, де це можливо (по кілька десятків записів), обмежену паралельність (`Promise.all` з семафором) для незалежних елементів.
Складність: L.

### 2.5 [HIGH] `deleteCatalogItem` і `seedCatalogDefaults` не перевіряють роль (на відміну від `upsertCatalogItem`/`resyncCatalogPrices`)
Файл:рядок: `src/lib/catalog.functions.ts:64-71` (`deleteCatalogItem`), `src/lib/catalog.functions.ts:73-87` (`seedCatalogDefaults`).
Доказ:
```ts
export const deleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("catalog_items").delete().eq("id", data.id);
```
Порівняно з сусідньою `upsertCatalogItem` (`src/lib/catalog.functions.ts:51-53`), яка явно робить `if (!(await userIsInternal(...))) throw new Error(...)`.
Вплив на бізнес: будь-який автентифікований співробітник (не лише адміністратор/технолог) може видалити позицію прайсу або повторно засіяти дефолтні ціни, що впливає на кошторисування у всій компанії.
Вплив технічний: захист покладається виключно на RLS-політику таблиці `catalog_items`, яку не було видно в межах цього аудиту (не проглянуто SQL-міграції) — якщо RLS дозволяє DELETE усім автентифікованим, це критична діра. Позначено як HIGH, а не CRITICAL, оскільки фактичний рівень ризику залежить від RLS-політики, яка не перевірена (SQL-схема поза межами аудиту бекенд-коду).
Рекомендація: додати явну перевірку `userIsInternal`/`requirePermission` в обидві функції, як зроблено в `upsertCatalogItem`.
Складність: XS.

### 2.6 [HIGH] `approveEstimate` і `updateFactLine` не мають рольової перевірки на привілейовані дії
Файл:рядок: `src/lib/estimates.functions.ts:405-454` (`approveEstimate`), `src/lib/estimates.functions.ts:604-638` (`updateFactLine`).
Доказ:
```ts
export const approveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(...)
  .handler(async ({ data, context }) => {
    const snap = await snapshotEstimate(context.supabase, data.id);
    ...
    // немає жодної перевірки ролі/isAdmin/requirePermission
```
Для порівняння, `reportProfitBy` в тому ж файлі (`src/lib/estimates.functions.ts:524-525`) явно робить `if (!isAdmin) throw new Error("Доступ лише для адміністраторів")`.
Вплив на бізнес: затвердження кошторису (створення офіційної версії, зміна статусу на "approved"/"inWork") і внесення виробничих фактів (`updateFactLine`) — фінансово й операційно значущі дії, які мають виконувати визначені ролі (кошторисник/технолог/прораб), а не будь-який автентифікований користувач із доступом до рядка.
Вплив технічний: захист повністю покладається на RLS UPDATE-політику таблиці `estimate_versions`, яку не видно в цьому аудиті; в коді немає явного, аудитованого рольового ґейту.
Рекомендація: додати `requirePermission(userId, "estimates", "approve")` / `"estimates", "production_fact"` аналогічно до `financialGate`/`reportProfitBy`.
Складність: S.

### 2.7 [MEDIUM] Дублювання логіки перевірки ролей поза `access.server.ts` (`registration.functions.ts`)
Файл:рядок: `src/lib/registration.functions.ts:20-27, 45-51`.
Доказ:
```ts
const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
const canReview = (roles ?? []).some((row) => row.role === "admin" || row.role === "director");
if (!canReview) throw new Error("Доступ лише для адміністраторів");
```
Вплив на бізнес: дві незалежні системи ролей (`user_roles` легасі і `user_access`/`role_permissions` сучасна) можуть розійтися: людину видалили з `access_roles`/`user_access`, але залишили запис у `user_roles`, або навпаки — вона й далі може схвалювати реєстрації.
Вплив технічний: код обходить єдину точку правди (`access.server.ts`), ускладнює аудит і супроводжується ризиком неконсистентності прав.
Рекомендація: перевести `registration.functions.ts` на `requireAccessManager`/`requirePermission` з `access.server.ts`, вивести легасі `user_roles`-перевірку.
Складність: S.

### 2.8 [MEDIUM] `reviewRegistrationApproval` не є ідемпотентною і не веде аудит
Файл:рядок: `src/lib/registration.functions.ts:37-92`.
Доказ:
```ts
const { data: approval } = await supabaseAdmin.from("registration_approvals").select("id,user_id,status").eq("id", data.id).maybeSingle();
...
const { data: updated, error } = await supabaseAdmin.from("registration_approvals").update({ status: data.status, ... }).eq("id", data.id)...
```
Немає перевірки `approval.status === "pending"` перед повторним схваленням і немає запису у `writeAudit`/`audit_logs` (є лише в `access-ops.server.ts` для аналогічної операції `reviewAccessRequestOp`).
Вплив на бізнес: можливе повторне призначення ролі "manager" двом різним адміністраторам одночасно (race condition), відсутність журналу для розслідування хто/коли надав доступ.
Вплив технічний: відсутність optimistic locking (немає version/updated_at перевірки при UPDATE), відсутність audit trail для критичної операції видачі ролі.
Рекомендація: додати перевірку поточного статусу перед update (WHERE status='pending'), і `writeAudit` з `isCritical: true` за аналогією з `access-ops.server.ts`.
Складність: S.

### 2.9 [MEDIUM] `z.record(z.unknown())`-блоби записуються в БД без обмежень розміру/глибини
Файл:рядок: `src/lib/integrations.functions.ts:41,53,177,312,321`.
Доказ:
```ts
z.object({ providerKey: z.string().min(1), name: z.string().min(2).max(80), config: z.record(z.string(), z.unknown()).optional() }).parse(d)
```
Вплив на бізнес: інтеграційний модуль приймає довільний JSON-blob (config провайдера, маніфест, тестовий payload) без обмежень — некоректний ввід від адміністратора інтеграцій (або зловмисної автоматизації) може роздути `integrations.config`/`integration_provider_manifest` до непередбачуваних розмірів.
Вплив технічний: немає перевірки максимальної глибини вкладеності чи розміру серіалізованого payload; `maskDeep` (`src/lib/integrations/core.server.ts:14-26`) обрізає рядки до 4000 символів лише в логах подій, а не в самій вставці в `integrations`/`integration_provider_manifest`.
Рекомендація: додати `.refine()` перевірку розміру серіалізованого JSON (наприклад, ≤32KB) і базове обмеження глибини перед записом.
Складність: S.

### 2.10 [MEDIUM] Немає rate limit на вебхуках і воркер-ендпоінті
Файл:рядок: `src/routes/api/public/integrations/webhook.$slug.tsx:10-93`, `src/routes/api/public/integrations/worker.tsx:10-32`.
Доказ (webhook): перевірка підпису є (`verifyHmacSha256`, `src/routes/api/public/integrations/webhook.$slug.tsx:41`), але немає обмеження частоти запитів чи розміру тіла запиту перед `request.text()` (`webhook.$slug.tsx:12`).
Вплив на бізнес: зовнішній актор, що знає (або перебирає) `slug` вебхука, може засипати чергу `integration_events` запитами навіть з невірним підписом — кожен запит все одно виконує кілька БД-запитів (`loadIntegration`, `buildContext`, `logAttempt`) до моменту відхилення 401.
Вплив технічний: потенційний DoS на рівні БД (зростання `integration_event_logs` навіть при відхилених запитах) і serverless compute cost.
Рекомендація: додати rate-limit per-slug (наприклад, через Supabase Edge Middleware/Cloudflare) і обмеження `Content-Length` перед читанням тіла.
Складність: M.

### 2.11 [MEDIUM] OAuth callback: `redirect_uri` не звіряється з allow-list на етапі старту
Файл:рядок: `src/lib/integrations/ops.server.ts:419-451` (`startOAuthOp`), `src/routes/api/public/integrations/oauth.callback.tsx:30-38`.
Доказ:
```ts
export async function startOAuthOp(userId: string, input: { integrationId: string; redirectUri: string }) {
  const actor = await requireAccessManager(userId);
  ...
  await db.from("integration_oauth_states").insert({
    state, integration_id: integration.id, redirect_uri: input.redirectUri, ...
```
`redirectUri` приймається від клієнта (лише `z.string().url()` перевірка формату — без обмеження домену/allow-list) і потім використовується і при обміні коду на токен (callback, рядок 33), і при формуванні auth URL (рядок 447).
Вплив на бізнес: якщо провайдер OAuth не звіряє суворо `redirect_uri` на своєму боці, зловмисник з правами доступу до `startIntegrationOAuth` (потрібен `requireAccessManager`, тобто вже привілейований користувач) міг би підставити довільний redirect_uri; ризик обмежений тим, що дію може викликати лише вже довірений менеджер доступу.
Вплив технічний: відсутність server-side allow-list для `redirectUri` порушує принцип "не довіряй клієнту навіть авторизованому" для OAuth-потоків.
Рекомендація: звіряти `redirectUri` зі списком дозволених origin (з ENV/конфігу застосунку), а не приймати будь-який URL.
Складність: S.

### 2.12 [MEDIUM] `admin()`/service-role клієнт використовується для операцій, які могли б працювати через RLS
Файл:рядок: приклад — `src/lib/access-ops.server.ts:36-88` (`listUsersOp`), увесь `access-ops.server.ts` та весь `integrations/ops.server.ts`/`sync-ops.server.ts` побудовані на `admin()`.
Доказ: кожна функція модулів "Доступи" та "Інтеграції" викликає `const db = await admin();` й далі працює з таблицями `user_access`, `profiles`, `integrations`, обходячи RLS повністю; авторизація виконується виключно кодом (`requireAccessManager`/`requirePermission`/`canView`), без другого рубежу захисту у вигляді RLS-політик цих таблиць.
Вплив на бізнес: якщо в майбутньому хтось додасть нову експортовану функцію в ці файли й забуде викликати `requireAccessManager`/`requirePermission` на початку — дані (включно з `user_permission_overrides`, `integration_secrets` метаданими, `audit_logs`) стануть доступні будь-якому автентифікованому користувачу, оскільки RLS не підстрахує.
Вплив технічний: single point of failure — вся модель безпеки цих модулів тримається на дисципліні розробника викликати правильну guard-функцію на кожному новому ендпоінті; статичного лінтера/тесту, що це перевіряє, не виявлено.
Рекомендація: додати автоматизований тест/лінт-правило "кожна функція в access-ops.server.ts/integrations/*.server.ts повинна викликати requireAccessManager/requireOwner/requirePermission/canView до першого `admin()`-запиту"; розглянути RLS-політики й на цих таблицях як defense-in-depth.
Складність: M.

### 2.13 [MEDIUM] Відсутність аудиту на видалення/зміну бізнес-сутностей (clients, crm_*, objects)
Файл:рядок: `src/lib/clients.functions.ts:26-45` (`upsertClient`, `deleteClient`), `src/lib/crm.functions.ts:52-71,145-152,253-260,336-343` (contacts/leads/requests/tasks delete), `src/lib/objects.functions.ts:148-178` (`saveObject`, `deleteObject`).
Доказ:
```ts
export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) { ... }
    return { ok: true };
  });
```
На відміну від `estimates.functions.ts`, де кожна зміна проходить через `logAudit`/`estimate_audit_log`, модулі клієнтів/CRM/об'єктів не пишуть жодного audit-запису при видаленні чи редагуванні.
Вплив на бізнес: неможливо розслідувати, хто і коли видалив клієнта, лід чи об'єкт — критично для CRM/ERP системи з фінансовими наслідками.
Вплив технічний: немає централізованого журналу змін для цих сутностей, on-delete неможливо відновити контекст (хто видалив, з якої причини).
Рекомендація: додати виклик `writeAudit`/аналог `logAudit` при `upsert*`/`delete*` для clients/crm_*/objects, як мінімум для delete-операцій.
Складність: M.

### 2.14 [LOW] Помилки, що проковтуються мовчки (catch без ретрансляції)
Файл:рядок приклади:
- `src/lib/gcal.functions.ts:121-129` (`deleteEstimateEvent`): помилка видалення зовнішньої події з Google Calendar йде лише в `console.warn`, функція завжди повертає `{ ok: true }`.
- `src/lib/crm.functions.ts:48` (`findContactDuplicates`): `catch { return []; }` — помилка БД маскується під "дублікатів немає".
- `src/lib/access-ops.server.ts:52-57,129-137,459-461,579-583` — кілька `try { await db.auth.admin.X() } catch { /* ignore */ }` навколо адмін-API виклику.
Доказ:
```ts
} catch (e) {
  console.warn("[gcal] delete:", (e as Error).message);
}
await supabase.from("estimates").update({ gcal_event_id: null, ... }).eq("id", est.id);
return { ok: true };
```
Вплив на бізнес: користувач бачить "успіх", хоча зовнішня подія в Google Calendar могла залишитись, а внутрішнє посилання вже видалено — розсинхронізація без сигналу.
Вплив технічний: втрата діагностичної інформації, ускладнене розслідування збоїв інтеграцій; для `findContactDuplicates` — фальшиво-негативний результат перевірки дублікатів при збої БД, що може призвести до створення дублікатів контактів.
Рекомендація: повертати структуровану помилку/попередження клієнту (наприклад, `{ ok: true, warning: "..." }`), логувати через `logAttempt`/`writeAudit`, а не лише в консоль.
Складність: S.

### 2.15 [LOW] Немає optimistic locking / version-колонки — можливий lost update
Файл:рядок: всюди, де є `update(...).eq("id", id)` без порівняння `updated_at`/version — наприклад, `src/lib/estimates.functions.ts:223-226` (`saveEstimate`), `src/lib/objects.functions.ts:194-197` (`updateObjectStatus`), `src/lib/calendar.functions.ts:72-78` (`moveCalendarEvent`).
Доказ:
```ts
const { data: out, error } = data.id
  ? await context.supabase.from("estimates").update(row).eq("id", data.id).select().single()
  : await context.supabase.from("estimates").insert(row).select().single();
```
Вплив на бізнес: два менеджери, що одночасно редагують один кошторис/об'єкт/подію календаря, — останній запис "виграє" без попередження, втрачаючи зміни першого (класичний lost update); особливо критично для фінансових полів кошторису.
Вплив технічний: відсутність `version`/`updated_at`-based optimistic lock в UPDATE-запитах; `financialGate` (estimates) перевіряє лише узгодженість чисел у самому запиті, не конкурентність.
Рекомендація: додати колонку `version`/використовувати `updated_at` у WHERE-умові UPDATE з поверненням конфлікту клієнту (409), особливо для `estimates`, `objects`, `calendar_events`.
Складність: M.

### 2.16 [LOW] Часові позначки без явної обробки часових поясів
Файл:рядок: `src/lib/gcal.functions.ts:15-18` (`fmtDateLocal` коментар вказує на "зону Київ", але функція просто повертає `d.toISOString()` — UTC, без прив'язки до таймзони), `src/lib/objects.functions.ts:209-210` (`tomorrow10` формується через локальний час серверного процесу `new Date(now.getFullYear(), ...)`, який залежить від таймзони runtime, а не бізнес-таймзони компанії).
Доказ:
```ts
function fmtDateLocal(d: Date) {
  // RFC3339 з зоною Київ (+02 / +03) — Google прийме як ISO; spec API дозволяє dateTime+timeZone
  return d.toISOString();
}
```
Вплив на бізнес: авто-події "завтра о 10:00" можуть фактично створюватися о іншій годині залежно від таймзони serverless-середовища виконання (UTC за замовчуванням у більшості хмарних runtime), що вводить менеджерів в оману щодо реального часу дзвінка/зустрічі.
Вплив технічний: немає єдиної точки конфігурації бізнес-таймзони (`Europe/Kyiv`), розрахунки на `new Date().getHours()`-подібних викликах залежать від TZ середовища виконання.
Рекомендація: явно фіксувати таймзону (наприклад, через `Intl.DateTimeFormat` з `timeZone: "Europe/Kyiv"` або бібліотеку типу `date-fns-tz`) при формуванні "завтра о 10:00" та подібних авто-подій.
Складність: S.

## 3. Позитивні спостереження (для балансу)

- Вебхуки перевіряють HMAC-підпис до парсингу тіла й мають timing-safe порівняння (`src/lib/integrations/signature.server.ts:7-31`), плюс ідемпотентність через `dedup_hash`/`idempotency_key` (`src/lib/integrations/core.server.ts:103-138`) — коректна практика.
- Воркер-ендпоінт (`worker.tsx`) захищений порівнянням секрету за сталий час і не пропускає запит без нього (`src/routes/api/public/integrations/worker.tsx:12-18`).
- `saveEstimate` реалізує змістовний фінансовий ґейт (`financialGate`, `src/lib/estimates.functions.ts:61-99`) з перевіркою узгодженості сум і забороною негативної маржі для не-адмінів.
- Аудит-система `access.server.ts`/`access-ops.server.ts` послідовно позначає критичні дії (`isCritical: true`) і фіксує IP/User-Agent (`requestMeta`, `src/lib/access.server.ts:110-121`).
- OAuth-state одноразовий і з TTL (`src/lib/integrations/ops.server.ts:429-439`, перевірка `used_at`/`expires_at` в `oauth.callback.tsx:17-21`).

## 4. Зведена таблиця критичності

| № | Проблема | Критичність | Складність |
|---|---|---|---|
| 2.1 | Немає rate limit на пароль власника | CRITICAL | S |
| 2.2 | Зламана ідемпотентність pushIntegrationRecord | HIGH | XS |
| 2.3 | Необмежені SELECT на великих таблицях | HIGH | M |
| 2.4 | N+1 у синхронізації keyCRM | HIGH | L |
| 2.5 | deleteCatalogItem/seedCatalogDefaults без ролі | HIGH | XS |
| 2.6 | approveEstimate/updateFactLine без ролі | HIGH | S |
| 2.7 | Дублювання логіки ролей (registration) | MEDIUM | S |
| 2.8 | reviewRegistrationApproval без ідемпотентності/аудиту | MEDIUM | S |
| 2.9 | z.record(unknown) блоби без обмежень | MEDIUM | S |
| 2.10 | Немає rate limit на webhook/worker | MEDIUM | M |
| 2.11 | redirect_uri без allow-list в OAuth | MEDIUM | S |
| 2.12 | admin()-клієнт як єдиний рубіж захисту | MEDIUM | M |
| 2.13 | Немає аудиту delete/update для clients/crm/objects | MEDIUM | M |
| 2.14 | Проковтнуті помилки (catch swallow) | LOW | S |
| 2.15 | Немає optimistic locking | LOW | M |
| 2.16 | Таймзони не фіксуються явно | LOW | S |

## 5. Обмеження цього аудиту

- SQL-міграції та RLS-політики Postgres не аналізувалися (поза межами вказаного скоупу файлів) — деякі висновки (2.5, 2.6, 2.12) залежать від фактичного стану RLS і позначені відповідно.
- Не прочитано повністю тіла `resolveConflictOp`, `listLineMapOp`/`saveLineMapOp`/`deleteLineMapOp`, `getProviderManifestOp`/`saveProviderManifestOp`, `adapterSelfTestOp`, `listImportRunsOp`/`startImportOp`/`importChunkOp` (файл `sync-ops.server.ts` за межами прочитаних рядків 1-120, та `keycrm/import.server.ts`) — позначено "НЕ ПЕРЕВІРЕНО" в матриці.
- `staff.server.ts` (використовується в `objects.functions.ts`, `estimates.functions.ts`, `operations.functions.ts`, `calendar.functions.ts`) не прочитано — позначено "НЕ ПЕРЕВІРЕНО".
