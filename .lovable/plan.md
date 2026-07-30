## 1. Що вже є (переиспользуем)
`user_access` / `role_permissions` / `has_permission` для прав, `audit_logs` + `writeAudit` для журналу, `notification_rules` для сповіщень, патерн `*.functions.ts` (90 server functions) + `*.server.ts`, `settings.tsx` з вкладками (`Tab` union, рядок 27), секрети — тільки backend (`process.env` всередині handler).

## 2. Нові таблиці (одна міграція, GRANT + RLS, доступ лише owner/ops_admin)
- `integration_providers` — довідник адаптерів (key, назва, тип auth, схема конфігу, статус реалізації).
- `integrations` — підключення: provider_key, назва, стан (`disconnected/connecting/active/error/disabled`), конфіг (без секретів), останній тест, останній успіх/помилка, увімкнено.
- `integration_secrets` — тільки посилання на ключі у Vault/секрети + метадані (маска, ким і коли оновлено). Значення в таблиці не зберігаються.
- `integration_oauth_states` — одноразовий state/PKCE, TTL.
- `integration_tokens` — access/refresh (шифровані), expires_at, scopes.
- `integration_webhooks` — вхідні ендпоінти (slug, secret_ref, спосіб підпису) і вихідні (URL, події, secret).
- `integration_events` — черга: напрям, provider, тип події, payload, статус (`pending/processing/done/failed/dead`), attempt, next_retry_at, idempotency_key (unique), dedup_hash.
- `integration_event_logs` — незмінний журнал спроб: HTTP-код, тривалість, запит/відповідь (обрізані, з маскуванням), помилка.
- `integration_field_mappings` — provider ↔ ERP-сутність, пара полів, трансформ, напрям, обов'язковість.

## 3. HTTP-ендпоінти (TanStack server routes, без Edge Functions)
- `src/routes/api/public/integrations/$slug/webhook.ts` — прийом вхідних: перевірка підпису над сирим body, idempotency за заголовком/хешем, миттєвий запис у `integration_events` і `200`, обробка асинхронна.
- `src/routes/api/public/integrations/oauth/callback.ts` — обмін коду, перевірка state.
- `src/routes/api/public/integrations/worker.ts` — тік черги за секретним заголовком (виклик з pg_cron), бере пачку `pending`/прострочених, обробляє, ставить `next_retry_at`.

## 4. Backend-логіка
- `src/lib/integrations.functions.ts` — CRUD підключень, тест з'єднання, вмикання/вимикання, ротація секрету, мапінги, перегляд черги/журналу, ручний retry і «в архів». Усі під `requireSupabaseAuth` + `requirePermission("integrations", …)`.
- `src/lib/integrations.server.ts` — ядро: реєстр адаптерів, диспетчер черги, backoff (1m/5m/30m/2h/6h, максимум 5 спроб → `dead`), idempotency, маскування секретів у логах, `writeAudit` на кожну зміну.
- `src/lib/integrations/adapter.ts` — інтерфейс адаптера: `testConnection`, `verifyWebhook`, `normalizeEvent`, `handleEvent`, `send`, `oauth`. Конкретні провайдери — окремими кроками, ядро їх не знає.

## 5. UI
Нова вкладка `integrations` у `src/routes/settings.tsx` + сторінка `src/routes/integrations.tsx`: список підключень зі статусом, картка (конфіг, секрети маскою, OAuth-кнопка, вебхук-URL з копіюванням), мапінг полів, черга подій з фільтрами і ручним retry, журнал помилок. Токени TERZI, адаптив, без нових залежностей.

## 6. Права
Новий модуль `integrations` у `permissions`/`role_permissions`: `view / manage / secrets / retry`. За замовчуванням `manage`+`secrets` лише owner і ops_admin.

## 7. Ризики
- Секрети: зберігати лише в Supabase-секретах/Vault, у БД — посилання; логи маскувати за списком чутливих ключів.
- `/api/public/*` без авторизації — підпис обов'язковий, timing-safe порівняння, читати сире тіло до JSON.
- Воркер на Cloudflare — короткий CPU-ліміт: маленькі пачки, ідемпотентні кроки, без довгих циклів.
- Дублікати подій — унікальний `idempotency_key`, `INSERT … ON CONFLICT DO NOTHING`.
- `integration_event_logs` росте — ретенція (наприклад 90 днів) окремим завданням.

## 8. Порядок реалізації
1) міграція таблиць + права; 2) ядро черги, retry, idempotency, аудит; 3) вхідні вебхуки і воркер; 4) OAuth/API Key і сховище секретів; 5) мапінг полів; 6) UI-вкладка та журнали; 7) тестовий «echo»-адаптер для перевірки ядра — і лише після цього перший реальний провайдер.

## 9. Файли, що зачіпаються
`src/routes/settings.tsx` (додати вкладку), новий `src/routes/integrations.tsx`, нові `src/routes/api/public/integrations/*`, нові `src/lib/integrations*.ts`, `src/components/AppShell.tsx` (пункт меню за правом), `src/integrations/supabase/types.ts` (регенерація після міграції). Наявні модулі не змінюються.

## 10. Поза межами кроку
Конкретні провайдери (Binotel, keyCRM, Meta, Google Ads, WordPress, Telegram), їхні поля й мапінги — окремими етапами після приймання ядра.
