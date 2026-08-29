# AGENTS.md — контекст для AI-агентів (Codex) і нових розробників

TERZI ERP — внутрішня система будівельної компанії TERZI (Одеса): CRM, кошториси,
замовлення, виробництво, склад, фінанси, маркетинг. UI українською, валюта UAH,
дати DD.MM.YYYY, таймзона Europe/Kyiv. Код, таблиці й ідентифікатори — англійською.

## Стек

React 19 + TypeScript + TanStack Start/Router (SSR, Vite 7) + TanStack Query,
Tailwind v4 + shadcn/ui, Supabase (PostgreSQL, Auth, RLS). Пакетний менеджер — bun.
Деплой — Cloudflare Worker. Supabase Edge Functions НЕ використовуються: серверна
логіка — `createServerFn` у `src/lib/*.functions.ts`, публічні HTTP-ендпойнти — у
`src/routes/api/public/*`.

## Канонічні сутності

```
Lead → Contact → Client → Order → Measurement → Estimate → Proposal → Contract
→ Procurement → Production → Payment → Project P&L → Handover → Warranty
```

- Центральна проєктна сутність — `public.orders`. Нової `objects` не створювати;
  `/objects*` — лише редиректи на `/orders*`.
- Усі нові модулі зв'язуються через `order_id`.
- Клієнт — `public.clients`; матчинг по нормалізованому телефону (`src/lib/phone.ts`, E.164).
- Кошториси — `public.estimates` з незмінним снапшотом цін/норм/версій.

## Реєстр модулів

`src/lib/modules.ts` — єдине джерело правди (id, label, route, catalogModule,
estimateModule, hasCalculator, productionType, permissions, active).
Навігація (`src/components/nav-model.ts`) і Calculation Core
(`src/lib/core/module-registry.ts`) звіряються з ним у тестах.
**Заборонено** fallback «невідомий модуль → screed»: `findModule()` повертає `null`.

## Бізнес-правила (жорсткі)

1. Усі фінальні розрахунки детерміновані. AI не рахує кількості, ціни, податки,
   маржу, прибуток чи підсумки — тільки пояснення й чернетки текстів.
2. Єдина точка підсумків — `src/lib/core/index.ts` (`buildCanonicalResult`).
   Калькулятори віддають сирі рядки; податки, амортизація, собівартість, маржа,
   warnings і blocking errors рахуються тільки в Core.
3. Markup = (Price − Cost) / Cost × 100; Margin = (Price − Cost) / Price × 100.
   Округлення — тільки на фінальному кроці.
4. Ціни, норми й коефіцієнти не хардкодяться в UI: вони в довідниках
   (`catalog_items`, `coefficients`, `*_config`) і редагуються з правами.
5. Історія незмінна: нова версія замість перезапису. Збережений кошторис не
   перераховується при зміні каталогу.
6. `payment ≠ revenue`, `estimate ≠ actual revenue`. Не змішувати їх у KPI.
7. Ручні поля (`orders.management_data`) не перетираються синхронізацією;
   показуємо походження даних: Manual / CRM / Estimate / Integration.
8. Затверджені норми: фібра для 7 м³ — M100=4, M150=6, M200=8, M250=10, M300=12
   упаковки (legacy-значення 11 для M200 не використовувати). Sikaplan D-15 —
   тільки деталі/вузли, не основне поле мембрани.

## Захищені фінансові дані

Собівартість, закупівельні ціни, маржа, прибуток, ФОП, комісії — internal.
Доступ — тільки за роллю (`admin`, `director`, `finance`; див.
`src/lib/useInternalAccess.ts`, `access_roles`/`role_permissions`).
Клієнтські PDF і DTO не повинні містити цих полів.

## RLS і безпека

- RLS увімкнено на всіх таблицях `public`. Кожен `CREATE TABLE public.x` у міграції
  супроводжується `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY` у тій самій міграції.
- Ролі зберігаються тільки в `public.user_roles` (+ `access_roles`/`user_access`);
  ніколи в профілі. Перевірка ролі — через `public.has_role()`/`private.*` (SECURITY DEFINER).
- `supabaseAdmin` (service role) — тільки після явної перевірки прав у серверній функції.
- Секрети читаються лише всередині `.handler()` через `process.env`; у браузер — ніколи.

## Правила міграцій

- Тільки через `supabase/migrations/*.sql`, іменування `<YYYYMMDDHHMMSS>_<slug>.sql`.
- Additive за замовчуванням; жодного видалення production-даних.
- Валідація: `npm run db:validate`. Drift фіксується в `docs/SCHEMA_DRIFT.md`.
- Не чіпати схеми `auth`, `storage`, `realtime`, `vault`.

## Команди

```bash
npm run setup       # install + .env
npm run dev
npm run lint
npm run typecheck
npm run test        # vitest
npm run test:e2e    # playwright
npm run build
npm run db:validate # перевірка історії міграцій
npm run db:reset    # локальний Supabase: скидання + міграції + seed
```

## Definition of Done

lint / typecheck / unit / build зелені; жоден маршрут не 404 і не білий екран;
міграції валідні й задокументовані; internal-фінанси не витікають клієнту;
детермінізм розрахунків збережений; історичні кошториси не змінені;
нових дублюючих канонічних сутностей не додано.

## Заборонені скорочення

- Переписувати робочі калькулятори або pricing-формули без затвердження.
- Створювати паралельні сутності (`objects`, друга модель ролей, друга модель модулів).
- Хардкодити ціни, маршрути, підписи модулів у компонентах.
- Копіювати GPL/AGPL-код у репозиторій (див. `docs/OPEN_SOURCE.md`).
- Обходити Calculation Core розрахунками в React-компонентах.
- Комітити секрети або production-персональні дані (seed — тільки синтетичний).

## Мапа каталогів

| Шлях | Призначення |
| --- | --- |
| `src/routes/` | Файлові маршрути TanStack (сторінки + `api/public/*`) |
| `src/lib/*.functions.ts` | Серверні функції (`createServerFn`), тонкі обгортки |
| `src/lib/*.server.ts` | Серверні хелпери (не імпортувати в компоненти) |
| `src/lib/core/` | Calculation Core, DTO, ПДВ, амортизація, price policy |
| `src/lib/modules.ts` | Канонічний реєстр модулів |
| `src/lib/crm/`, `src/lib/marketing/`, `src/lib/integrations/` | Доменні модулі |
| `src/components/` | UI, shadcn-обгортки, AppShell і навігація |
| `supabase/migrations/` | Історія схеми |
| `docs/` | Домен, БД, тести, ліцензії, ADR |
| `e2e/` | Playwright-сценарії |

## Інтеграції

Патерн: Integration Core → Provider Adapter → Event → Mapping → Action → Log.
Черга й ідемпотентність — `integration_events` + `claim_integration_event()`.
Вхідні вебхуки — `src/routes/api/public/integrations/webhook.$slug.tsx` з перевіркою
підпису/токена ДО обробки. Порядок провайдерів: Binotel → keyCRM → Meta → Google Ads
→ WordPress → Telegram. Деталі — `docs/INTEGRATIONS.md`.
