# AGENTS.md — TERZI ERP

Внутрішня ERP будівельної компанії TERZI (Одеса). UI українською, UAH, DD.MM.YYYY, Europe/Kyiv; код і таблиці — англійською.

## Стек
React 19 + TS + TanStack Start/Router/Query, Tailwind v4 + shadcn, Supabase (Postgres, Auth, RLS), bun, Cloudflare Worker. Без Edge Functions: серверна логіка — `createServerFn` у `src/lib/*.functions.ts`, хелпери — `*.server.ts`, публічні ендпойнти — `src/routes/api/public/*`.

## Канонічні сутності
- `public.orders` — єдиний Order/Object (нову `objects` не створювати; `/objects*` — редиректи). Нові модулі зв'язуються через `order_id`.
- Клієнти — `public.clients`, матчинг за E.164 (`src/lib/phone.ts`). Кошториси — `public.estimates` з незмінним снапшотом.
- Реєстр модулів — `src/lib/modules.ts` (єдине джерело); `findModule()` повертає `null`, без fallback на screed.

## Жорсткі правила
- Розрахунки детерміновані; AI не рахує цифр. Підсумки — тільки `src/lib/core` (`buildCanonicalResult`), не в компонентах.
- Ціни/норми/коефіцієнти — у довідниках, не в UI. Історія незмінна: нова версія замість перезапису.
- `payment ≠ revenue`, `estimate ≠ actual revenue`. Ручні поля не перетираються синхронізацією.
- Internal-фінанси (собівартість, маржа, ЗП, комісії) — лише ролям admin/director/finance; не в клієнтських PDF/DTO.
- Ролі — тільки `user_roles`/`access_roles`/`user_access`, перевірка через `has_role()`/`private.*`. `supabaseAdmin` — лише після перевірки прав.
- Секрети — тільки `process.env` всередині handler, ніколи в браузер.
- Міграції additive: `CREATE TABLE` → `GRANT` → RLS → політики в одній міграції; production-дані не видаляти; схеми auth/storage/realtime/vault не чіпати.
- Не копіювати GPL/AGPL-код; не комітити секрети чи персональні дані.

## Definition of Done
typecheck/тести/build зелені; без 404 і білих екранів; internal-фінанси не витікають; історичні кошториси не змінені; без дублюючих сутностей.

Інтеграції — див. `src/lib/integrations/AGENTS.md`; домен — `docs/`.
