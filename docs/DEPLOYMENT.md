# DEPLOYMENT.md

## Середовища

| Середовище | Призначення | Примітка |
| --- | --- | --- |
| local | розробка | локальний Supabase або окремий dev-проєкт |
| preview | перегляд змін | керується платформою |
| production | бойове | окрема база; тестові імпорти заборонені |

Preview і production не повинні ділити одну базу. Якщо ділять — див.
`docs/KNOWN_ISSUES.md`.

## Змінні оточення

Шаблон — `.env.example`. Клієнтські: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
Серверні: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
секрети інтеграцій (`BINOTEL_*`, `KEYCRM_API_KEY`, `LEAD_INTAKE_SECRET`,
`INTEGRATIONS_WORKER_SECRET`, `ERP_PUBLIC_BASE_URL`).

`.env` не комітиться. Серверні ключі ніколи не отримують префікс `VITE_`.

## Локальний запуск з нуля

```bash
git clone <repo> && cd <repo>
bun install
cp .env.example .env      # заповнити
npm run db:reset          # опційно: локальний Supabase + міграції + seed
npm run dev               # http://localhost:8080
```

## Перевірка перед релізом

```bash
npm run lint && npm run typecheck && npm run test && npm run build
npm run db:validate
npm run test:e2e
```

## Міграції на production

1. Міграція додається файлом і проходить `db:validate`.
2. Застосування — керовано, з бекапом перед зміною.
3. Після застосування — `db:snapshot` і оновлення `docs/SCHEMA_DRIFT.md`.

## Rollback

Код відкочується попереднім деплоєм. Схема відкочується **тільки** новою
additive-міграцією (compensating change), не `DROP` по історії.

## Публікація

Деплой — Cloudflare Worker (SSR + серверні функції). Публікація виконується
лише після явного погодження власника продукту.
