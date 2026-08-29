# ARCHITECTURE.md

## Огляд

```text
Браузер (React 19, TanStack Router)
  ├─ supabase-js напряму → PostgREST → RLS → Postgres      (читання списків, довідники)
  └─ createServerFn (/_serverFn/*) → Cloudflare Worker
        ├─ requireSupabaseAuth (bearer користувача, RLS діє)
        └─ supabaseAdmin (service_role, RLS обходиться) — тільки після перевірки прав

Зовнішні системи (Binotel, keyCRM, Meta, Google Ads, форми сайту)
  └─ /api/public/* → integration_events (idempotent) → worker → мапінг → таблиці ERP
```

## Шари

| Шар | Де живе | Правило |
| --- | --- | --- |
| UI / презентація | `src/routes/*`, `src/components/*` | без бізнес-формул і без прямих грошових обчислень |
| Доменні розрахунки | `src/lib/*-calc.ts`, `src/lib/roofing/*` | чисті функції, детерміновані, покриті тестами |
| Calculation Core | `src/lib/core/*` | єдина точка підсумків: ПДВ, амортизація, собівартість, маржа, warnings, blocking errors |
| Серверні функції | `src/lib/*.functions.ts` | тонкі обгортки `createServerFn`; уся логіка — в імпортованих модулях |
| Серверні хелпери | `src/lib/*.server.ts` | не імпортуються з компонентів |
| Дані | Supabase / `supabase/migrations` | RLS + GRANT на кожну таблицю |

## Calculation Core

`buildCanonicalResult()` приймає сирі рядки модуля і повертає `CanonicalResult`:
рядки з нетто/ПДВ/брутто, підсумки за блоками, коригування (складність, знижка,
комісія, мінімальний чек), виручку, собівартість, прибуток, маржу, версії
(`contractVersion`, `engineVersion`, `priceBookVersion`, `directionVersion`),
warnings і `blockingErrors` (нульові ціни, відсутні коди каталогу).

Модулі підключаються тільки через `src/lib/core/module-registry.ts`; список
модулів звіряється з канонічним реєстром `src/lib/modules.ts`.

## Реєстр модулів

`src/lib/modules.ts` — id, label, route, catalogModule, estimateModule,
hasCalculator, productionType, permissions, active. Навігація, довідники,
кошториси, історія та виробництво беруть підписи й маршрути звідси.
Невідомий модуль → `null` (жодного fallback на «стяжку»).

## Канонічна доменна модель

`orders` — центральна проєктна сутність. `clients` ← `orders` ← (`estimates`,
`invoices`, `payments`, `expenses`, `order_zones`, `order_measurements`,
`stock_reservations`, `calendar_events`, `crm_tasks`). CRM (`crm_leads`,
`crm_requests`, `crm_contacts`, `crm_calls`) з'єднується з клієнтом за
нормалізованим телефоном (E.164) і `client_id`.

## Межі сервера й браузера

- Секрети — тільки `process.env` всередині `.handler()`.
- Публічні маршрути не викликають захищені серверні функції в loader.
- Модулі з `zod`-схемами винесені в окремі `*.schema.ts`: module-scope константи
  в `*.functions.ts` видаляються при serverfn-split і дають `ReferenceError`.

## Зовнішні сервіси (опційно, поза репозиторієм)

Marketing automation (Mautic), email-кампанії (listmonk), BI (Metabase,
read-only користувач до Postgres), веб-аналітика (Plausible). Інтеграція —
через API/webhook, без копіювання їх коду.
