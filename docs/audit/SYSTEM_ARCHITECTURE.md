# SYSTEM_ARCHITECTURE.md — фактична архітектура TERZI ERP

Дата аудиту: 01.08.2026, 00:30–01:30 UTC (Europe/Kyiv +3).
Гілка: `edit/edt-5778a14b-89c2-49ca-a7dd-79c88a6a1754`, commit `b020b04`.
Режим: read-only. Жодного файлу поза `docs/audit/` не змінено, жодної міграції не виконано.

## 1. Стек (з package.json, перевірено фактично)

| Шар | Технологія | Версія |
| --- | --- | --- |
| Frontend framework | React | ^19.2.0 |
| Роутер / SSR | @tanstack/react-router / @tanstack/react-start | ^1.168.25 / ^1.167.50 |
| Кеш даних | @tanstack/react-query | ^5.83.0 |
| Збірка | Vite | ^7.3.1 |
| Стилі | Tailwind CSS | ^4.2.1 (через `src/styles.css`) |
| UI | shadcn/ui + Radix (30+ пакетів) | різні |
| Backend SDK | @supabase/supabase-js | ^2.106.2 |
| Валідація | zod | ^3.24.2 |
| Мова | TypeScript | ^5.8.3 |
| Документи | jspdf ^4.2.1, html2canvas ^1.4.1, xlsx ^0.18.5, canvg | — |
| Package manager | bun (bunfig.toml, bun.lock) | — |
| Ціль деплою | Cloudflare Worker (nitro, `dist/server/wrangler.json`) | — |

Backend: **Lovable Cloud (керований Supabase)**. Власного Supabase-проєкту немає. Edge Functions Supabase **не використовуються взагалі** — `supabase/` містить лише `config.toml` і `migrations/` (33 файли). Уся серверна логіка — це TanStack `createServerFn` у `src/lib/*.functions.ts` (12 модулів) плюс 3 публічні HTTP-маршрути.

## 2. Фактична схема потоків

```text
Браузер (React 19, TanStack Router)
  |
  |-- supabase-js напряму (src/integrations/supabase/client.ts) --> PostgREST --> RLS --> Postgres
  |      використовується у більшості сторінок: clients, estimates, catalog, calendar
  |
  `-- createServerFn (RPC /_serverFn/...) --> Worker
         |-- requireSupabaseAuth (src/integrations/supabase/auth-middleware.ts)
         |-- context.supabase (від імені користувача, RLS діє)
         `-- admin() / supabaseAdmin (src/lib/access.server.ts, client.server.ts)
                --> service_role, RLS ОБХОДИТЬСЯ

Зовнішні системи (keyCRM / Binotel)
  --> /api/public/integrations/webhook.$slug  (src/routes/api/public/integrations/webhook.$slug.tsx)
  --> /api/public/integrations/oauth.callback
  --> /api/public/integrations/worker         (обробник черги)
        --> integration_events -> integration_event_logs -> integration_sync_links -> таблиці ERP
```

Ключова архітектурна особливість: **два паралельні шляхи доступу до даних** — прямий PostgREST з браузера і серверні функції. Через це бізнес-правила дублюються: те, що заборонено в серверній функції, часто дозволено прямим запитом з браузера, і навпаки. Єдиного шару доступу до даних немає.

## 3. Авторизація

- Провайдери: **Google OAuth** (5 користувачів) і **Apple** (1 користувач) — фактично з `auth.users.raw_app_meta_data`. Email/пароль у продукті не використовується.
- Сесія: `persistSession` у клієнті Supabase, keep-alive у `src/lib/auth.tsx`.
- Пост-реєстраційне схвалення: таблиця `registration_approvals` (6 рядків).
- Клієнтський middleware, що додає bearer-токен до серверних функцій: `src/start.ts`.

## 4. Дані

64 таблиці в схемі `public`, 0 view, 0 materialized view, 53 тригери, 138 індексів, 29 enum-типів, 33 міграції. RLS увімкнено на всіх 64 таблицях; 2 таблиці мають RLS без жодної політики (`integration_oauth_states`, `integration_tokens`) — fail-closed, але доступ до них лише через service_role.

**Storage: 0 бакетів.** Таблиця `object_files` існує і читається (`src/lib/objects.functions.ts:124`), але завантаження файлів у коді немає взагалі (`rg "storage.from"` — 0 збігів у `src/`). Модуль «Документи/Файли» фактично відсутній.

## 5. Оточення та експлуатація

| Пункт | Факт |
| --- | --- |
| Environment variables (тільки назви) | `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` |
| Production / staging / development | Окремих інстансів немає. Preview і Published б'ють в **одну і ту саму базу**. Тестування на проді неминуче. |
| CI/CD | Каталог `.github` відсутній. Автоматичного pipeline немає. |
| Автотести | Відсутні повністю (0 файлів `*.test.*` / `*.spec.*`). |
| Бекапи | НЕ ПЕРЕВІРЕНО — керуються платформою, доступу до налаштувань немає. |
| GitHub-інтеграція | НЕ ПЕРЕВІРЕНО з середовища аудиту. |

## 6. Слабкі місця архітектури (стисло, деталі в профільних звітах)

1. **Дві незалежні системи ролей** — enum `app_role` (admin/director/finance/manager), на який спираються RLS-політики, і таблиця `access_roles` (owner/ops_admin/sales_manager/surveyor/foreman/finance) з 1656 рядками `role_permissions`, на яку спирається модуль «Доступи». Вони не синхронізовані.
2. **Немає доменного шару.** Формули та бізнес-переходи живуть у React-компонентах і в `src/lib/*-calc.ts`, які виконуються у браузері; сервер їх не перевіряє.
3. **`estimates` не пов'язані ні з клієнтом, ні з об'єктом** — усі 51 запис мають `client_id IS NULL` і `object_id IS NULL`, зв'язок імітується текстовими полями `client_name`/`client_phone`.
4. **Дублювання сховищ розрахунку** в межах однієї таблиці: `estimates.payload`, `calculation_json`, `client_lines`, `internal_lines`.
5. **Обхід RLS через `admin()`** у серверних функціях без послідовної перевірки ролі перед викликом.
6. **Немає soft delete** — жодної колонки `deleted_at` у всій схемі; видалення незворотні.
7. **Немає версіонування записів / оптимістичних блокувань** — паралельне редагування перезаписує чужі зміни.
8. **Немає окремого dev-середовища** — будь-який тест імпорту keyCRM пише в бойові дані.
