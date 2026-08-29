# INTEGRATIONS.md

## Архітектура

```text
Integration Core → Provider Adapter → Event → Mapping → Action → Log
```

Ядро (`src/lib/integrations/`) відповідає за підключення й статуси, API key/OAuth,
вхідні/вихідні вебхуки, мапінг полів, чергу подій, retry, журнал, ідемпотентність
і безпечні секрети. Специфіка провайдера живе тільки в адаптері.

## Таблиці

`integrations`, `integration_providers`, `integration_secrets`, `integration_tokens`,
`integration_webhooks`, `integration_events`, `integration_event_logs`,
`integration_field_mappings`, `integration_sync_links`, `integration_sync_state`,
`integration_sync_settings`, `integration_import_runs`, `integration_conflicts`,
`integration_rate_limits`, `integration_oauth_states`.

## Ідемпотентність

`claim_integration_event()` реєструє й атомарно захоплює подію:
ключ — `provider_event_id` → `idempotency_key` → hash payload.
Повтори рахуються в `duplicate_count`; події поза вікном replay відхиляються;
зависла обробка звільняється через `stale_lock_seconds`.

## Ендпойнти

| Маршрут | Призначення |
| --- | --- |
| `/api/public/integrations/webhook.$slug` | вхідні вебхуки провайдерів |
| `/api/public/integrations/oauth.callback` | OAuth-повернення |
| `/api/public/integrations/worker` | обробник черги (за секретом) |
| `/api/public/integrations/binotel/call-completed` | подія завершення дзвінка |
| `/api/public/leads/intake` | ліди з форм (HMAC) |
| `/api/public/marketing/sync` | синхронізація рекламних метрик |

Кожен обробник перевіряє підпис/токен ДО запису, валідує `zod`-схемою і
повертає 2xx лише після успішної реєстрації події.

## Провайдери (порядок впровадження)

1. **Binotel** — дзвінки, записи, мапінг співробітників і PBX (`binotel_*`).
2. **keyCRM** — ліди, клієнти, угоди; захист від циклу синхронізації через
   `integration_sync_links` і маркери походження.
3. **Meta Ads** — кампанії, витрати, ліди.
4. **Google Ads** — кампанії, витрати, конверсії.
5. **WordPress** — форми сайту й лендингів.
6. **Telegram** — сповіщення.

Не переходити до наступного провайдера, доки попередній не протестований.

## Безпека

Секрети — у secret store, читаються тільки в серверних обробниках.
Токени зберігаються в `integration_tokens` (доступ лише service_role).
Статус «підключено» показується лише після реального успішного тестового виклику.
