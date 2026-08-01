# Інтеграція Binotel ↔ TERZI ERP — аудит і план

Нижче — результат етапу 0 (тільки читання, нічого не змінено).

## 1. Фактична структура CRM TERZI (підтверджено запитами до БД)

| Сутність | Таблиця | Ключові поля |
|---|---|---|
| Контакт | `crm_contacts` | `full_name, phone, phone_norm, email, client_id, owner_id, external_source, external_id` |
| Клієнт | `clients` | `name, phone, email, address, status, owner_id, external_source, external_id` |
| Ліди/угоди | `crm_leads` | `title, pipeline_id, stage_id, contact_id, client_id, object_id, source, campaign, direction, status, assigned_to, utm, external_source, external_id` |
| Воронки/етапи | `crm_pipelines` (6), `crm_stages` (71) | `key, name, is_won, is_lost, sort_order` |
| Задачі | `crm_tasks` | `kind, title, due_at, priority, status, lead_id, client_id, contact_id, assigned_to` |
| Дзвінки | `crm_calls` | `direction, from_number, to_number, phone_norm, started_at, duration_sec, status, recording_url, lead_id, contact_id, external_id, payload` |
| Звернення | `crm_requests` | канал, джерело, телефон, звʼязок з лідом |
| Таймлайн | `crm_lead_activities` | `kind, body, meta, actor` |
| Співробітники | `profiles` + `user_access` | `email, display_name, phone, department, position` / `role_key, scope, manager_id` |
| Аудит | `audit_logs` | критичні дії |

Integration Core (вже працює, використаний keyCRM): `integrations`, `integration_secrets` (тільки посилання `secret_ref`, без значень), `integration_webhooks` (slug, token, підпис), `integration_events` (черга + `dedup_hash`, `idempotency_key`, retry/`next_retry_at`), `integration_event_logs`, `integration_conflicts`, `integration_sync_settings`, `integration_field_mappings`.

## 2. Що переиспользуємо, а що створюємо

Переиспользуємо повністю: `crm_contacts`, `clients`, `crm_leads`, `crm_pipelines/stages`, `crm_tasks`, `crm_lead_activities`, `profiles/user_access`, увесь Integration Core (черга, дедуплікація, ретраї, журнали, секрети, панель інтеграцій). Нові таблиці contacts/clients/deals/tasks/employees/calls **не створюються**.

Нові таблиці (мінімум): `binotel_employee_mappings`, `binotel_pbx_mappings`, `binotel_call_sessions` (тимчасовий ключ сесії для API CALL SETTINGS до появи `generalCallID`), `binotel_settings` (SLA, прапорці призначення).

## 3. Сторінки, компоненти, endpoints, RLS

- Сторінки: `/crm` (дашборд), `/crm/leads` (канбан), `/crm/contacts`, `/crm/requests`, `/crm/calls`, `/crm/tasks`, `/clients`, `/integrations`, `/access`.
- Компоненти інтеграцій: `BinotelPanel.tsx` (наразі — режим очікування документації), `SyncPanel`, `ImportPanel`, `ConflictsPanel`, `OneWayPanel`.
- **Edge Functions відсутні і не використовуються**: стек — TanStack Start. Серверна логіка — `createServerFn` + публічні server-routes `src/routes/api/public/...`. Вже є: `webhook.$slug`, `worker`, `oauth.callback`. Функції Binotel буде реалізовано як server routes/серверні модулі з тими самими іменами-роллю.
- RLS увімкнена на CRM- та інтеграційних таблицях; доступ керується `user_access`/ролями, службові операції — через admin-клієнт лише в серверному коді.
- `pg_cron` у проєкті **не встановлено**: черга обробляється зовнішнім планувальником, що дьоргає `/api/public/integrations/worker` із секретом. Звірку Binotel підвісимо на той самий тік.

## 4. Запропоновані URL вебхуків

- API CALL SETTINGS: `POST {ERP_PUBLIC_BASE_URL}/api/public/binotel/call-settings?token=…`
- API CALL COMPLETED: `POST {ERP_PUBLIC_BASE_URL}/api/public/binotel/call-completed?token=…`
- Альтернатива через ядро: `/api/public/integrations/webhook/binotel-<id>` з `x-endpoint-token`.

Обидва: тільки POST, перевірка `BINOTEL_WEBHOOK_TOKEN` і `companyID`, ліміт розміру тіла, rate limiting, лог IP, без CORS.

## 5. Карта полів Binotel → ERP

| Binotel | ERP | Перетворення |
|---|---|---|
| `generalCallID` | `crm_calls.external_id` (+`external_source='binotel'`) | unique `(external_source, external_id)` |
| `callType` 0/1 | `crm_calls.direction` inbound/outbound | enum |
| `externalNumber` | `from_number`/`to_number` + `phone_norm` | нормалізація до `+380XXXXXXXXX`, `phone_norm` — тільки цифри (як зараз у CRM) |
| `internalNumber`, `internalAdditionalData` | `payload` + `binotel_employee_mappings` | пошук співробітника |
| `disposition` | `crm_calls.status` (нормалізований) + оригінал у `payload` | ANSWER→answered, TRANSFER→transferred, NOANSWER→missed, BUSY→busy, CANCEL→cancelled, CONGESTION/CHANUNAVAIL→failed, VM→voicemail, VM-SUCCESS→voicemail_with_message, ONLINE→online |
| `startTime` | `started_at` | unix→timestamptz |
| `waitsec`/`billsec` | нові поля `wait_seconds` / `duration_sec` | int |
| `pbxNumberData` | нові поля `pbx_number`, `pbx_number_name` → `binotel_pbx_mappings` | вибір воронки/напрямку |
| `callTrackingData`/`getCallData` | `crm_leads.utm`, `source`, `campaign` + `crm_calls.payload` | UTM, gaClientId, домен, geo |
| `historyData` | `crm_calls.payload.legs` (JSON) | історія переводів |
| `employeeData` | `answered_employee_id` (нове поле) | мапінг за id → email → internalNumber |
| весь запит | `integration_events.payload` | сире збереження до ACK |

Поля, яких бракує в `crm_calls` і які додамо: `provider, company_id, pbx_number, pbx_number_name, internal_number, client_id, employee_id, answered_employee_id, answered_at, ended_at, wait_seconds, disposition_raw, is_new_call, is_missed, recording_available, recording_checked_at, call_tracking, updated_at`.

## 6. Карта співробітників

`binotel_employee_mappings`: `binotel_employee_id, binotel_email, binotel_internal_number, binotel_employee_name, local_user_id → profiles.user_id, department, is_active, mapping_status, last_synced_at`. Джерело — `settings/list-of-employees.json`. Порядок зіставлення: id → email → internalNumber → ручний мапінг. Зіставлення тільки за іменем заборонено; без підтвердженого мапінгу `assignedToEmployee*` не повертаємо.

## 7. Потрібні міграції

1. Розширення `crm_calls` (поля вище) + `unique (external_source, external_id) where external_id is not null` + індекси `phone_norm`, `started_at`, `lead_id`.
2. `binotel_employee_mappings`, `binotel_pbx_mappings`, `binotel_call_sessions`, `binotel_settings` — з GRANT + RLS (читання — менеджери/керівники, запис — адміністратори, службові операції — service_role).
3. Ідемпотентні задачі: часткова унікальність задачі «Передзвонити клієнту» на дзвінок (`crm_tasks` + `external_id`/meta-ключ).
4. Довідникові рядки: етап «Новий дзвінок» у загальній воронці, якщо його немає (без зміни наявних воронок).

Нічого не перейменовуємо, наявні дані не змінюємо.

## 8. Ризики

**Дублі:** повторні webhook → закриваємо unique `(provider, external_id)` + `dedup_hash` черги; API CALL SETTINGS без `generalCallID` → тимчасовий ключ сесії `companyID+phone+pbxNumber+callType+вікно 5 хв` у `binotel_call_sessions`, потім злиття з `generalCallID`; один номер у кількох контактах → детермінований вибір (активний, найстаріший) + прапорець «потребує обʼєднання», без автозлиття; паралельні звонки → унікальність на рівні БД, не в коді.

**Втрата дзвінків:** відсутній `pg_cron` (планувальник зовнішній) — звірку робимо ідемпотентною і наздоганяючою по перекриттю періодів; ACK повертаємо лише після фізичного запису події; помилка обробки не видаляє подію, вона йде в retry; `list-of-calls-for-period` кожні 30–60 хв + нічна перевірка 24 год; невідомий pbxNumber не втрачається — падає в загальну воронку з попередженням.

**Інше:** архівна документація (методи підтверджені підтримкою, але поля можуть відрізнятися — тому зберігаємо `raw_payload`); IP allowlist вмикаємо лише після підтвердження від Binotel; ліміти API — черга з затримками.

## 9. План реалізації (етапи 1–8, як у завданні)

1. Аудит (виконано) + перевірка REST-зʼєднання та отримання співробітників.
2. Секрети `BINOTEL_API_KEY/API_SECRET/COMPANY_ID/WEBHOOK_TOKEN/ERP_PUBLIC_BASE_URL`, серверний API-клієнт, журнали, мапінги співробітників і PBX.
3. API CALL SETTINGS: пошук клієнта, створення першого контакту та угоди, `customerData` з посиланням на картку, маршрут до закріпленого менеджера.
4. API CALL COMPLETED: ACK після запису, ідемпотентність, дзвінки, статуси, привʼязки (сценарії A–E).
5. Пропущені: задача «Передзвонити клієнту», SLA 5 хв, ескалація 15 хв, автозакриття після успішного вихідного.
6. Click-to-call (`calls/internal-number-to-external-number.json`), запис розмови (`stats/call-record.json`, тимчасове посилання, без збереження URL), таймлайн у картках.
7. Звірка (`stats/list-of-calls-for-period.json`, вікна ≤24 год), retry, журнали, панель Binotel замість поточної заглушки.
8. RLS, ролі, 25 тестових сценаріїв, фінальний звіт.

## 10. План відкату

Кожен етап окремою міграцією; вимкнення інтеграції через `integrations.enabled=false` миттєво зупиняє обробку; вебхуки відключаються прапорцем `integration_webhooks.enabled`; нові таблиці ізольовані та видаляються без впливу на CRM; додані колонки `crm_calls` nullable — старий код працює; жоден наявний рядок не змінюється деструктивно, усі записи Binotel помічені `external_source='binotel'` і можуть бути відфільтровані або видалені.

## 11. План тестування

Усі 25 сценаріїв із завдання проганяємо як серверні виклики з фікстурами payload (у т.ч. семиразова повторна доставка одного `generalCallID`, невірний companyID/token, збій БД після прийому, паралельні дзвінки, дубльований номер), з фіксацією: вхід → створені/оновлені записи → очікуване/фактичне → відсутність дублів → відображення в UI → статус журналу. RLS перевіряємо реальними запитами від менеджера, офіс-менеджера, керівника, адміністратора та анонімного користувача.

## Технічні уточнення

- Edge Functions у проєкті немає — реалізація буде через TanStack server routes (`/api/public/binotel/*`) та серверні модулі `src/lib/integrations/binotel/*`, що відповідає наявній архітектурі Integration Core.
- Ключі Binotel зберігаються лише як серверні секрети й підставляються в тіло JSON усередині серверного обробника; у браузер, БД, міграції та логи не потрапляють.
