# CONTRIBUTING

## Процес

1. Гілка від `main`: `feat/<scope>`, `fix/<scope>`, `docs/<scope>`.
2. Перед PR локально: `npm run lint && npm run typecheck && npm run test && npm run build`.
3. Зміни схеми — тільки новою міграцією у `supabase/migrations/`; `npm run db:validate`.
4. PR описує: що змінено, які таблиці/політики зачеплено, які тести додано.
5. Merge заборонений при червоних critical checks у CI.

## Правила коду

- TypeScript strict; жодних `any` у публічних сигнатурах доменних модулів.
- Бізнес-формули — у `src/lib/**`, не в компонентах.
- Підсумкові гроші рахує тільки Calculation Core (`src/lib/core`).
- Ціни/норми/коефіцієнти — з довідників, не з коду UI.
- Кольори — семантичні токени з `src/styles.css`, без `text-white`/`bg-[#...]`.
- Файли `*.functions.ts` — тонкі: тільки імпорти, типи й експорт серверних функцій.
- `zod`-схеми серверних функцій — в окремому `*.schema.ts`.

## Тести

- Кожна зміна доменної логіки супроводжується Vitest-тестом.
- Кожен новий маршрут додається у список `e2e/smoke.spec.ts`.
- Регресії фінансів (маржа, ПДВ, план/факт) покриваються числовими кейсами.

## Міграції

- Additive; без видалення production-даних.
- Кожен `CREATE TABLE public.x`: GRANT → ENABLE RLS → POLICY у тій самій міграції.
- Ролі — тільки в `user_roles`/`user_access`, ніколи в профілі.
- Будь-яка розбіжність із production фіксується в `docs/SCHEMA_DRIFT.md`.

## Комміти

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
