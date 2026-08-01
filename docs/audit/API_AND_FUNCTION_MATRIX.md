# Матриця серверних функцій та публічних API — TERZI ERP

Дата аудиту: сформовано статичним аналізом коду репозиторію (без запуску сервера, без звернень до БД).
Джерела: усі файли `src/lib/**/*.functions.ts` (12 модулів) + `src/routes/api/public/integrations/*`.
Позначення статусів: OK — притензій немає в межах перевірених пунктів; УВАГА — є недоліки середньої критичності; ПРОБЛЕМА — знайдено критичний/високий недолік (див. `BACKEND_AUDIT.md`).

Умовні скорочення в колонці «Авторизація»: RLS — використовується `context.supabase` (авторизований клієнт користувача, підпорядкований RLS-політикам); ADMIN — використовується `admin()`/`supabaseAdmin` (service-role, обходить RLS, роль перевіряється вручну в коді).

## 1. `src/lib/access.functions.ts` (делегує в `access-ops.server.ts`)

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| getMyAccess | access.functions.ts:32 | GET | requireSupabaseAuth; всередині без доп. ролі (myAccessOp читає лише власні дані) | немає (без вхідних даних) | user_access, user_permission_overrides, role_permissions (ADMIN) | немає | н/д | немає | немає | без ліміту (1 рядок) | OK |
| listAccessUsers | access.functions.ts:36 | GET | requireSupabaseAuth + requireAccessManager (ADMIN) | немає | user_access, profiles, access_roles, user_permission_overrides, auth.admin.listUsers (ADMIN) | немає (read) | н/д | немає | немає | `listUsers({perPage:200})` — жорсткий ліміт, понад 200 користувачів обріже список | УВАГА |
| updateUserAccess | access.functions.ts:40 | POST | requireSupabaseAuth + requireAccessManager | zod (uuid, enum, max-length) | user_access, auth.admin.updateUserById (ADMIN) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| listUserOverrides | access.functions.ts:61 | GET(POST-подібний) | requireSupabaseAuth + requireAccessManager | zod uuid | user_permission_overrides (ADMIN) | немає | н/д | немає | немає | без ліміту | OK |
| setUserOverride | access.functions.ts:66 | POST | requireAccessManager | zod | user_permission_overrides (ADMIN) | writeAudit isCritical | upsert onConflict (ідемпотентно) | немає | немає | н/д | OK |
| removeUserOverride | access.functions.ts:82 | POST | requireAccessManager | zod uuid | user_permission_overrides (ADMIN) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| listAccessRoles | access.functions.ts:87 | GET | requireAccessManager | немає | access_roles, role_permissions, user_access (ADMIN) | немає | н/д | немає | немає | без ліміту | OK |
| saveAccessRole | access.functions.ts:91 | POST | requireAccessManager, +перевірка "owner" ролі всередині | zod (regex key) | access_roles, role_permissions (ADMIN) | writeAudit isCritical | upsert onConflict | немає | немає | н/д | OK |
| listInvitations | access.functions.ts:107 | GET | requireAccessManager | немає | user_invitations (ADMIN) | немає | н/д | немає | немає | без ліміту | УВАГА (необмежена вибірка) |
| createInvitation | access.functions.ts:111 | POST | requireAccessManager, owner-check для role_key=owner | zod (email, max) | user_invitations (ADMIN) | writeAudit isCritical | немає (можливі дублікати запрошень) | немає | немає | н/д | OK |
| revokeInvitation | access.functions.ts:134 | POST | requireAccessManager | zod uuid | user_invitations (ADMIN) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| acceptInvitation | access.functions.ts:139 | POST | requireSupabaseAuth (лише свій userId, без ролі) | zod (token len) | user_invitations, profiles, user_access, registration_approvals, user_permission_overrides (ADMIN) | writeAudit isCritical | токен одноразовий (status check) | немає | немає | н/д | OK |
| listAccessRequests | access.functions.ts:144 | GET | requireAccessManager | немає | access_requests (ADMIN) | немає | н/д | немає | немає | `.limit(300)` є | OK |
| createAccessRequest | access.functions.ts:148 | POST | requireSupabaseAuth (без ролі — будь-який автентифікований) | zod | access_requests, profiles (ADMIN) | немає (немає writeAudit при створенні запиту) | немає | немає | немає | н/д | УВАГА (немає аудиту створення) |
| reviewAccessRequest | access.functions.ts:164 | POST | requireAccessManager, owner-check | zod | access_requests, user_access, profiles, registration_approvals, user_permission_overrides, auth.admin (ADMIN) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| listAuditLogs | access.functions.ts:183 | GET | requireAccessManager | zod (limit ≤500) | audit_logs (ADMIN) | н/д (це сам журнал) | н/д | немає | немає | `.limit(min(limit,500))` є | OK |
| getSecurityOverview | access.functions.ts:201 | GET | requireAccessManager | немає | auth.admin.listUsers(perPage 200), user_access, profiles, audit_logs (ADMIN) | немає | н/д | немає | немає | 200 users, `.limit(50)` failed logs | УВАГА (обрізає >200 користувачів мовчки) |
| terminateUserSessions | access.functions.ts:205 | POST | requireAccessManager, owner-check | zod uuid | auth.admin.updateUserById (ADMIN) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| transferWorkload | access.functions.ts:210 | POST | requireAccessManager | zod uuid×2 | clients, objects, estimates, object_assignments (ADMIN, масове update без where owner match перевірки прав на кожен рядок) | writeAudit isCritical | немає | немає | немає | н/д | OK |
| listNotificationRules | access.functions.ts:215 | GET | requireAccessManager | немає | notification_rules (ADMIN) | немає | н/д | немає | немає | без ліміту (довідник, малий обсяг) | OK |
| saveNotificationRule | access.functions.ts:219 | POST | requireAccessManager | zod uuid | notification_rules (ADMIN) | writeAudit (не isCritical) | немає | немає | немає | н/д | OK |
| verifyOwnerPassword | access.functions.ts:234 | POST | requireSupabaseAuth + requireOwner | zod (password len) | auth.admin.getUserById + новий anon-клієнт signInWithPassword (ADMIN) | немає | н/д | немає | немає (можливий brute-force пароля власника) | н/д | ПРОБЛЕМА (немає rate limit на спробу пароля) |

## 2. `src/lib/clients.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listClients | clients.functions.ts:15 | GET | requireSupabaseAuth (RLS) | немає | clients | немає | н/д | немає | немає | немає `.limit()` — повний `select("*")` | ПРОБЛЕМА (необмежена вибірка) |
| upsertClient | clients.functions.ts:26 | POST | requireSupabaseAuth (RLS) | zod повна схема | clients | немає | немає (insert/update без idempotency key) | немає | немає | н/д | УВАГА (без аудиту зміни клієнта) |
| deleteClient | clients.functions.ts:38 | POST | requireSupabaseAuth (RLS) | zod uuid | clients | немає | немає | немає | немає | н/д | УВАГА (без аудиту видалення) |

## 3. `src/lib/crm.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listPipelines | crm.functions.ts:7 | GET | requireSupabaseAuth | немає | crm_pipelines, crm_stages | немає | н/д | немає | немає | без ліміту (довідники) | OK |
| listContacts | crm.functions.ts:31 | GET | requireSupabaseAuth | немає | crm_contacts | немає | н/д | немає | немає | `.limit(500)` | OK |
| findContactDuplicates | crm.functions.ts:40 | GET | requireSupabaseAuth | zod | crm_contacts | немає | н/д | немає | немає | `.limit(10)` | OK |
| upsertContact | crm.functions.ts:52 | POST | requireSupabaseAuth | zod | crm_contacts | немає | немає | немає | немає | н/д | УВАГА (без аудиту) |
| deleteContact | crm.functions.ts:64 | POST | requireSupabaseAuth | zod uuid | crm_contacts | немає | немає | немає | немає | н/д | УВАГА |
| listLeads | crm.functions.ts:94 | GET | requireSupabaseAuth | немає | crm_leads | немає | н/д | немає | немає | `.limit(500)` — при >500 лідів старі приховуються без пагінації "load more" | УВАГА |
| upsertLead | crm.functions.ts:103 | POST | requireSupabaseAuth | zod | crm_leads, crm_lead_activities | часткове (activity-лог, не повний audit_logs) | немає | немає | немає | н/д | OK |
| moveLeadStage | crm.functions.ts:121 | POST | requireSupabaseAuth | zod uuid | crm_leads, crm_stages, crm_lead_activities | activity-лог | немає | немає | немає | н/д | OK |
| deleteLead | crm.functions.ts:145 | POST | requireSupabaseAuth | zod uuid | crm_leads | немає | немає | немає | немає | н/д | УВАГА |
| listLeadActivities | crm.functions.ts:154 | GET | requireSupabaseAuth | zod uuid | crm_lead_activities | н/д | н/д | немає | немає | `.limit(100)` | OK |
| addLeadNote | crm.functions.ts:165 | POST | requireSupabaseAuth | zod | crm_lead_activities | сам є логом | немає | немає | немає | н/д | OK |
| listTasks | crm.functions.ts:177 | GET | requireSupabaseAuth | немає | crm_tasks | немає | н/д | немає | немає | `.limit(300)` | OK |
| upsertTask | crm.functions.ts:186 | POST | requireSupabaseAuth | zod | crm_tasks | немає | немає | немає | немає | н/д | OK |
| listRequests | crm.functions.ts:210 | GET | requireSupabaseAuth | немає | crm_requests | немає | н/д | немає | немає | `.limit(300)` | OK |
| listCalls | crm.functions.ts:219 | GET | requireSupabaseAuth | немає | crm_calls | немає | н/д | немає | немає | `.limit(300)` | OK |
| upsertRequest | crm.functions.ts:241 | POST | requireSupabaseAuth | zod | crm_requests | немає | немає | немає | немає | н/д | OK |
| deleteRequest | crm.functions.ts:253 | POST | requireSupabaseAuth | zod uuid | crm_requests | немає | немає | немає | немає | н/д | УВАГА |
| convertRequestToLead | crm.functions.ts:262 | POST | requireSupabaseAuth | zod uuid | crm_requests, crm_contacts, crm_pipelines, crm_stages, crm_leads, crm_lead_activities | activity-лог | часткова (перевірка `req.lead_id`, але без транзакції — можлива гонка при подвійному кліку) | немає | немає | н/д | УВАГА |
| upsertCall | crm.functions.ts:314 | POST | requireSupabaseAuth | zod | crm_calls | немає | немає | немає | немає | н/д | OK |
| deleteTask | crm.functions.ts:336 | POST | requireSupabaseAuth | zod uuid | crm_tasks | немає | немає | немає | немає | н/д | УВАГА |

## 4. `src/lib/estimates.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listEstimates | estimates.functions.ts:165 | GET | requireSupabaseAuth (RLS); фінансові поля приховуються, якщо `userIsInternal()`=false | немає | estimates, profiles (staffNameMap) | немає | н/д | немає | немає | немає `.limit()` — `select("*")` без обмеження | ПРОБЛЕМА (необмежена вибірка) |
| listEstimatesByClient | estimates.functions.ts:177 | POST | requireSupabaseAuth | zod uuid | estimates | немає | н/д | немає | немає | без ліміту | УВАГА |
| getEstimate | estimates.functions.ts:191 | POST | requireSupabaseAuth | zod uuid | estimates | немає | н/д | немає | немає | н/д (1 рядок) | OK |
| saveEstimate | estimates.functions.ts:209 | POST | requireSupabaseAuth; фінансовий gate (`financialGate`) — не блокує ролі, лише узгодженість чисел | zod (nonnegative, preprocess) | estimates, estimate_audit_log | logAudit (окрема таблиця, не access.server audit_logs) | немає (без idempotency-key, подвійний клік = 2 insert) | немає | немає | н/д | УВАГА |
| updateEstimateFields | estimates.functions.ts:253 | POST | requireSupabaseAuth (RLS — покладається на політику "власник рядка може UPDATE") | zod | estimates, estimate_audit_log | logAudit | немає | немає | немає | н/д | OK |
| updateEstimateStatus | estimates.functions.ts:280 | POST | requireSupabaseAuth | zod enum | estimates, estimate_audit_log | logAudit | немає | немає | немає | н/д | OK |
| scheduleEstimate | estimates.functions.ts:299 | POST | requireSupabaseAuth | zod | estimates, estimate_audit_log | logAudit | немає | немає | немає | н/д | OK |
| deleteEstimate | estimates.functions.ts:335 | POST | requireSupabaseAuth | zod uuid | estimates, estimate_audit_log | logAudit (перед видаленням) | немає | немає | немає | н/д | OK |
| listEstimateAudit | estimates.functions.ts:350 | POST | requireSupabaseAuth | zod uuid | estimate_audit_log | н/д | н/д | немає | немає | без ліміту | УВАГА |
| listEstimateVersions | estimates.functions.ts:381 | POST | requireSupabaseAuth | zod uuid | estimate_versions | н/д | н/д | немає | немає | без ліміту (версій зазвичай мало) | OK |
| getEstimateVersion | estimates.functions.ts:394 | POST | requireSupabaseAuth | zod uuid | estimate_versions | н/д | н/д | немає | немає | н/д | OK |
| approveEstimate | estimates.functions.ts:405 | POST | requireSupabaseAuth (немає перевірки ролі — будь-який автентифікований користувач з доступом до рядка RLS може "затвердити" кошторис) | zod | estimate_versions, estimates, profiles | logAudit | немає | немає | немає | н/д | ПРОБЛЕМА (немає рольової перевірки на затвердження) |
| forkEstimateFromVersion | estimates.functions.ts:456 | POST | requireSupabaseAuth | zod uuid | estimate_versions, estimates | logAudit | ретраї на конфлікт номера (until 5 attempts) | так (5 спроб) | немає | н/д | OK |
| reportProfitBy | estimates.functions.ts:516 | POST | requireSupabaseAuth + ручна перевірка `userIsInternal` | zod | estimates, profiles | немає | н/д | немає | немає | без ліміту (агрегує всі estimates) | УВАГА |
| listProductionEstimates | estimates.functions.ts:555 | GET | requireSupabaseAuth | немає | estimates | немає | н/д | немає | немає | без ліміту | УВАГА |
| ensureProductionVersion | estimates.functions.ts:568 | POST | requireSupabaseAuth | zod uuid | estimate_versions, estimates, profiles | logAudit | так (перевірка existing перед створенням) | немає | немає | н/д | OK |
| updateFactLine | estimates.functions.ts:604 | POST | requireSupabaseAuth (немає перевірки ролі бригадира/прораба) | zod | estimate_versions | немає | немає | немає | немає | н/д | УВАГА |

## 5. `src/lib/catalog.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listCatalog | catalog.functions.ts:29 | GET | requireSupabaseAuth; buy_price приховується для non-internal | zod enum | catalog_items | немає | н/д | немає | немає | без ліміту (довідник, прийнятно) | OK |
| upsertCatalogItem | catalog.functions.ts:47 | POST | requireSupabaseAuth + ручний `userIsInternal` (roles rpc) | zod | catalog_items | немає (немає writeAudit при зміні цін!) | немає | немає | немає | н/д | ПРОБЛЕМА (зміна цін без аудиту) |
| deleteCatalogItem | catalog.functions.ts:64 | POST | requireSupabaseAuth (RLS) — **без** `userIsInternal` перевірки, на відміну від upsert/seed | zod uuid | catalog_items | немає | немає | немає | немає | н/д | ПРОБЛЕМА (немає рольової перевірки на видалення прайсу) |
| seedCatalogDefaults | catalog.functions.ts:73 | POST | requireSupabaseAuth (RLS) — без `userIsInternal` | zod enum | catalog_items | немає | idempotent (перевіряє existing) | немає | немає | н/д | ПРОБЛЕМА (немає рольової перевірки) |
| resyncCatalogPrices | catalog.functions.ts:95 | POST | requireSupabaseAuth + `userIsInternal` | zod | catalog_items | немає | частково (upsert по code) | немає | немає | н/д | УВАГА (немає аудиту масової зміни цін) |
| getTierMargins | catalog.functions.ts:417 | GET | requireSupabaseAuth (без ролі) | zod | catalog_tier_margins | н/д | н/д | немає | немає | н/д | OK |
| applyTierMargin | catalog.functions.ts:433 | POST | requireSupabaseAuth + `userIsInternal` | zod | catalog_items, catalog_tier_margins | audit() (access.server writeAudit) isCritical | немає | немає | немає | н/д (цикл по всіх позиціях — потенційний N+1, до сотень update) | УВАГА (N+1 update у циклі) |
| setTierCellPrice | catalog.functions.ts:483 | POST | requireSupabaseAuth + `userIsInternal` | zod | catalog_items | audit() | немає | немає | немає | н/д | OK |
| resetTierCell | catalog.functions.ts:507 | POST | requireSupabaseAuth + `userIsInternal` | zod | catalog_items, catalog_tier_margins | audit() | немає | немає | немає | н/д | OK |
| resetTierColumnToSystem | catalog.functions.ts:536 | POST | requireSupabaseAuth + `userIsInternal` | zod | catalog_items, catalog_tier_margins | audit() isCritical | немає | немає | немає | н/д (цикл update у for) | УВАГА (N+1) |

## 6. `src/lib/objects.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listObjects | objects.functions.ts:72 | GET | requireSupabaseAuth | немає | objects, object_services, clients, profiles | немає | н/д | немає | немає | немає `.limit()` — `select("*")` необмежено | ПРОБЛЕМА (необмежена вибірка) |
| getObject | objects.functions.ts:109 | POST | requireSupabaseAuth | zod uuid | objects + 9 пов'язаних таблиць | немає | н/д | немає | немає | `object_status_history.limit(200)`, інші без ліміту | OK |
| saveObject | objects.functions.ts:148 | POST | requireSupabaseAuth | zod | objects, object_services | немає | немає | немає | немає | н/д | УВАГА (без аудиту) |
| deleteObject | objects.functions.ts:169 | POST | requireSupabaseAuth (RLS перевірка через affected rows) | zod uuid | objects | немає | немає | немає | немає | н/д | УВАГА |
| updateObjectStatus | objects.functions.ts:180 | POST | requireSupabaseAuth | zod | objects, calendar_events (через syncAutoEvent) | немає | syncAutoEvent ідемпотентний (за source_type/source_id) | немає | немає | н/д | OK |
| saveObjectZone | objects.functions.ts:261 | POST | requireSupabaseAuth | zod | object_zones | немає | немає | немає | немає | н/д | OK |
| deleteObjectZone | objects.functions.ts:273 | POST | requireSupabaseAuth | zod uuid | object_zones | немає | немає | немає | немає | н/д | OK |
| addObjectComment | objects.functions.ts:283 | POST | requireSupabaseAuth | zod | object_comments, profiles | немає | немає | немає | немає | н/д | OK |
| setObjectAssignment | objects.functions.ts:301 | POST | requireSupabaseAuth (без перевірки ролі "хто може призначати виконавців") | zod enum | object_assignments | немає | delete+insert (замінний, ідемпотентний за own key) | немає | немає | н/д | OK |
| saveObjectMeasurement | objects.functions.ts:339 | POST | requireSupabaseAuth | zod | object_measurements, objects, calendar_events | немає | частково (syncAutoEvent) | немає | немає | н/д | OK |
| linkEstimateToObject | objects.functions.ts:391 | POST | requireSupabaseAuth | zod uuid | estimates | немає | немає | немає | немає | н/д | OK |

## 7. `src/lib/integrations.functions.ts` (делегує в `integrations/ops.server.ts` та `integrations/sync-ops.server.ts`)

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listIntegrationProviders | integrations.functions.ts:30 | GET | requireSupabaseAuth → `canView` (canManage OR `requirePermission(view)`) (ADMIN) | немає | integration_providers | немає | н/д | немає | немає | без ліміту (довідник) | OK |
| listIntegrations | integrations.functions.ts:34 | GET | canView (ADMIN) | немає | integrations, integration_providers, integration_webhooks, integration_secrets | немає | н/д | немає | немає | без ліміту | УВАГА |
| createIntegration | integrations.functions.ts:38 | POST | requireAccessManager (ADMIN) | zod `z.record(z.unknown())` для config — довільний blob у БД | integrations | writeAudit isCritical | немає (slug retry loop захищає лише унікальність) | немає | немає | н/д | УВАГА (z.record(unknown) без обмеження вкладеності/розміру) |
| updateIntegration | integrations.functions.ts:45 | POST | requireAccessManager | zod (config: record unknown) | integrations | writeAudit isCritical | немає | немає | немає | н/д | УВАГА (як вище) |
| deleteIntegration | integrations.functions.ts:59 | POST | requireAccessManager | zod uuid | integrations | writeAudit isCritical | немає | немає | немає | н/д | OK |
| testIntegrationConnection | integrations.functions.ts:64 | POST | requireAccessManager | zod uuid | integrations (через adapter, зовнішній HTTP) | writeAudit | н/д | немає | немає | н/д | OK |
| bindIntegrationSecret | integrations.functions.ts:69 | POST | requireAccessManager | zod regex | integration_secrets (лише посилання, значення з ENV) | writeAudit isCritical | upsert | немає | немає | н/д | OK |
| unbindIntegrationSecret | integrations.functions.ts:82 | POST | requireAccessManager | zod uuid | integration_secrets | writeAudit isCritical | немає | немає | немає | н/д | OK |
| saveIntegrationWebhook | integrations.functions.ts:87 | POST | requireAccessManager | zod (url, regex) | integration_webhooks | writeAudit isCritical | slug retry loop | немає | немає | н/д | OK |
| deleteIntegrationWebhook | integrations.functions.ts:106 | POST | requireAccessManager | zod uuid | integration_webhooks | writeAudit isCritical | немає | немає | немає | н/д | OK |
| listIntegrationMappings | integrations.functions.ts:111 | POST | canView | zod uuid | integration_field_mappings | немає | н/д | немає | немає | без ліміту | OK |
| saveIntegrationMapping | integrations.functions.ts:116 | POST | requireAccessManager | zod | integration_field_mappings | writeAudit (не critical) | немає | немає | немає | н/д | OK |
| deleteIntegrationMapping | integrations.functions.ts:135 | POST | requireAccessManager | zod uuid | integration_field_mappings | writeAudit | немає | немає | немає | н/д | OK |
| listIntegrationEvents | integrations.functions.ts:140 | POST | canView | zod (limit ≤200) | integration_events | немає | н/д | немає | немає | `.limit(≤200)` є | OK |
| listIntegrationEventLogs | integrations.functions.ts:155 | POST | canView | zod uuid | integration_event_logs | н/д | н/д | немає | немає | `.limit(50)` | OK |
| retryIntegrationEvent | integrations.functions.ts:160 | POST | `canManage OR requirePermission(retry)` | zod uuid | integration_events | writeAudit | так (idempotency_key на подіях) | ручний повторний виклик processEvent | немає | н/д | OK |
| cancelIntegrationEvent | integrations.functions.ts:165 | POST | requireAccessManager | zod uuid | integration_events | writeAudit | немає | немає | немає | н/д | OK |
| enqueueIntegrationTestEvent | integrations.functions.ts:170 | POST | requireAccessManager | zod `payload: record(unknown)` | integration_events | writeAudit | так (dedup hash в enqueueEvent) | немає | немає | н/д | OK |
| getIntegrationQueueStats | integrations.functions.ts:183 | GET | canView | немає | integration_events (`select("status")` — читає всі рядки для підрахунку!) | немає | н/д | немає | немає | немає `.limit()` — читає всю таблицю подій без обмеження | ПРОБЛЕМА (необмежена вибірка над таблицею подій, яка росте необмежено) |
| runIntegrationQueue | integrations.functions.ts:187 | POST | requireAccessManager | немає | integration_events (через runQueue, ліміт 10) | writeAudit | так (idempotency) | так (backoff) | немає (будь-який власник/адмін може запускати чергу довільно часто) | н/д | УВАГА |
| startIntegrationOAuth | integrations.functions.ts:191 | POST | requireAccessManager | zod url | integration_oauth_states | writeAudit isCritical | одноразовий state (10 хв TTL) | немає | немає | н/д | OK |
| listIntegrationSyncSettings | integrations.functions.ts:200 | POST | canView | zod uuid | integration_sync_settings, integration_sync_state | немає | н/д | немає | немає | без ліміту (по entities, малий обсяг) | OK |
| saveIntegrationSyncSetting | integrations.functions.ts:208 | POST | requireAccessManager | zod | integration_sync_settings | writeAudit | upsert | немає | немає | н/д | OK |
| runIntegrationSync | integrations.functions.ts:226 | POST | requireAccessManager | zod | integration_sync_links, crm_pipelines, crm_stages, crm_contacts, crm_leads, integration_conflicts (N+1 у циклі, див. BACKEND_AUDIT) | writeAudit | частково (за external_id) | немає | немає | зовнішня пагінація keyCRM (`maxPages` 5) | ПРОБЛЕМА (N+1 запити в циклі синхронізації) |
| pushIntegrationRecord | integrations.functions.ts:244 | POST | requireAccessManager | zod uuid | integration_events | writeAudit | idempotencyKey містить `Date.now()` → **не справжня ідемпотентність** (кожен виклик унікальний ключ) | немає | немає | н/д | ПРОБЛЕМА (ідемпотентність зламана Date.now()) |
| listIntegrationConflicts | integrations.functions.ts:252 | POST | canView | zod | integration_conflicts | н/д | н/д | немає | немає | `.limit(100)` | OK |
| resolveIntegrationConflict | integrations.functions.ts:260 | POST | requireAccessManager (ймовірно, див. sync-ops.server.ts) | zod uuid+enum | integration_conflicts | ймовірно writeAudit (не переглянуто повністю) | немає | немає | немає | н/д | НЕ ПЕРЕВІРЕНО (реалізація в sync-ops.server.ts поза межами прочитаних рядків) |
| listIntegrationLineMap / saveIntegrationLineMap / deleteIntegrationLineMap | integrations.functions.ts:268-300 | POST | делеговано в sync-ops.server.ts | zod | integration_line_map (передбачувано) | НЕ ПЕРЕВІРЕНО | НЕ ПЕРЕВІРЕНО | немає | немає | н/д | НЕ ПЕРЕВІРЕНО (тіло функцій не прочитано) |
| getIntegrationProviderManifest / saveIntegrationProviderManifest | integrations.functions.ts:302-316 | POST | делеговано | zod (manifest: record(unknown)) | НЕ ПЕРЕВІРЕНО | НЕ ПЕРЕВІРЕНО | немає | немає | немає | н/д | НЕ ПЕРЕВІРЕНО |
| runIntegrationAdapterTest | integrations.functions.ts:318 | POST | делеговано | zod | НЕ ПЕРЕВІРЕНО | НЕ ПЕРЕВІРЕНО | немає | немає | немає | н/д | НЕ ПЕРЕВІРЕНО |
| listKeyCrmImportRuns / startKeyCrmImport / runKeyCrmImportChunk | integrations.functions.ts:331-364 | POST | делеговано в sync-ops.server.ts (не прочитано повністю: import.server.ts) | zod | integration import runs (передбачувано) | НЕ ПЕРЕВІРЕНО | pageSize обмежено 10-50 | немає | немає | pageSize ≤50 | НЕ ПЕРЕВІРЕНО (тіло `startImportOp`/`importChunkOp` не прочитано) |

## 8. `src/lib/registration.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listRegistrationApprovals | registration.functions.ts:18 | GET | requireSupabaseAuth + ручна перевірка ролі admin/director через `user_roles` (RLS-клієнт) | немає | user_roles, registration_approvals | немає | н/д | немає | немає | без ліміту | УВАГА |
| reviewRegistrationApproval | registration.functions.ts:37 | POST | requireSupabaseAuth + ручна роль-перевірка, потім використовує `supabaseAdmin` (ADMIN) для запису | zod | user_roles, registration_approvals (ADMIN після RLS-перевірки ролі) | немає | немає (можна затвердити двічі — не перевіряє поточний статус approval) | немає | немає | н/д | ПРОБЛЕМА (дублює логіку ролей паралельно до access.server; немає аудиту призначення ролі) |

## 9. `src/lib/api/example.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| getGreeting | example.functions.ts:14 | POST | **немає middleware** (публічна, тестова функція) | zod | немає (лише config) | н/д | н/д | немає | немає | н/д | OK (навчальний приклад, не працює з БД/PII) |

## 10. `src/lib/operations.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| getOperationsSchedule | operations.functions.ts:11 | POST | requireSupabaseAuth | zod | estimates | немає | н/д | немає | немає | без ліміту (діапазон тижня, прийнятно) | OK |
| listManagers | operations.functions.ts:34 | GET | requireSupabaseAuth | немає | profiles/user_roles (staffNameMap, не переглянуто) | немає | н/д | немає | немає | НЕ ПЕРЕВІРЕНО | НЕ ПЕРЕВІРЕНО |

## 11. `src/lib/bookings.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listBookings | bookings.functions.ts:11 | POST | requireSupabaseAuth | zod (дати) | crew_bookings | немає | н/д | немає | немає | обмежено діапазоном дат (прийнятно) | OK |
| upsertBooking | bookings.functions.ts:37 | POST | requireSupabaseAuth | zod | crew_bookings | немає | немає | немає | немає | н/д | OK |
| deleteBooking | bookings.functions.ts:74 | POST | requireSupabaseAuth | zod uuid | crew_bookings | немає | немає | немає | немає | н/д | OK |

## 12. `src/lib/calendar.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| listCalendarEvents | calendar.functions.ts:6 | POST | requireSupabaseAuth | zod (rangeSchema) | calendar_events | немає | н/д | немає | немає | `.limit(2000)` є, але жорсткий cap може приховати частину подій без сигналу клієнту | УВАГА |
| upsertCalendarEvent | calendar.functions.ts:41 | POST | requireSupabaseAuth | zod | calendar_events | немає | немає | немає | немає | н/д | OK |
| moveCalendarEvent | calendar.functions.ts:61 | POST | requireSupabaseAuth | zod | calendar_events | немає | немає | немає | немає | н/д | OK |
| setCalendarEventStatus | calendar.functions.ts:81 | POST | requireSupabaseAuth | zod | calendar_events | немає | немає | немає | немає | н/д | OK |
| deleteCalendarEvent | calendar.functions.ts:92 | POST | requireSupabaseAuth | zod uuid | calendar_events | немає | немає | немає | немає | н/д | OK |
| listEmployees | calendar.functions.ts:101 | GET | requireSupabaseAuth | немає | НЕ ПЕРЕВІРЕНО (staff.server.ts) | немає | н/д | немає | немає | НЕ ПЕРЕВІРЕНО | НЕ ПЕРЕВІРЕНО |
| listCalendarObjects | calendar.functions.ts:108 | GET | requireSupabaseAuth | немає | objects | немає | н/д | немає | немає | `.limit(300)` | OK |
| syncSourceEvent | calendar.functions.ts:121 | POST | requireSupabaseAuth | zod (rangeSchema) | calendar_events | немає | так (upsert за source_type+source_id+event_type) | немає | немає | н/д | OK |

## 13. `src/lib/gcal.functions.ts`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| syncEstimateToCalendar | gcal.functions.ts:47 | POST | requireSupabaseAuth (без ролі) | zod | estimates + зовнішній Google Calendar API через Lovable-gateway | немає | часткова (PATCH за gcal_event_id з fallback на 404/410) | так (fallback create) | немає (кожен виклик б'є у зовнішній API без throttle) | н/д | УВАГА |
| deleteEstimateEvent | gcal.functions.ts:113 | POST | requireSupabaseAuth | zod uuid | estimates + зовнішній API | немає | так (skip якщо немає event_id) | немає (catch ковтає помилку — warn лише в консоль) | немає | н/д | УВАГА (помилка видалення зовнішньої події проковтується мовчки) |

## 14. Публічні маршрути `src/routes/api/public/integrations/*`

| Назва | Файл:рядок | Метод | Авторизація | Валідація | Таблиці | Аудит | Idempotency | Retry | Rate limit | Пагінація | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GET /oauth/callback | oauth.callback.tsx:7 | GET | немає Supabase-auth (публічний за дизайном); захист через одноразовий `state` у БД з TTL 10 хв | немає zod, ручні перевірки `code`/`state` presence | integration_oauth_states, integrations, integration_tokens (ADMIN) | logAttempt (info/error) | так (`used_at` позначка одноразовості) | немає | немає (не обмежено, скільки разів можна перебирати state) | н/д | ПРОБЛЕМА (open-redirect: `Location: "/integrations?oauth=ok"` — жорстко заданий шлях, ризику redirect немає, але `redirect_uri` з клієнта не звіряється з allow-list — див. BACKEND_AUDIT) |
| POST /webhook/$slug | webhook.$slug.tsx:10 | POST | немає Supabase-auth (публічний вебхук за дизайном); підпис HMAC перевіряється до парсингу JSON | немає zod-схеми тіла (довільний зовнішній payload) | integration_webhooks, integrations, integration_secrets (через ctx), integration_events (ADMIN) | logAttempt | так (idempotencyKey/dedupHash в enqueueEvent) | немає (сама обробка події відкладена в чергу) | немає (rate limit не реалізовано — можливий DoS чергою) | н/д | УВАГА (немає rate limit) |
| POST /worker | worker.tsx:10 | POST | Секрет у заголовку `x-terzi-worker-secret`, timing-safe порівняння | немає (тіло не використовується) | integration_events (через runQueue), integration_sync_state (через runDuePolls) | непрямо (writeAudit в глибині) | так (runQueue обробляє чергу ідемпотентно) | так (backoff на рівні processEvent) | немає explicit (обмежується лише знанням секрету) | ліміт 10 подій за тік | УВАГА (за відсутності `INTEGRATIONS_WORKER_SECRET` повертає 503, а не 500 — ОК; але не перевірено ротацію секрету/логування спроб з невірним секретом) |
