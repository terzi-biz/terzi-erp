# SECURITY

## Модель доступу

- Автентифікація: Supabase Auth (Google OAuth, Apple). Реєстрація проходить
  схвалення адміністратором (`registration_approvals`, `access_requests`).
- Ролі: enum `app_role` (`admin`, `director`, `manager`, `finance`) для RLS-політик
  і таблиця `access_roles`/`user_access`/`role_permissions` для гранульованих прав.
  Ролі ніколи не зберігаються в профілі користувача.
- Перевірка ролі — через `public.has_role()` та `private.*` (SECURITY DEFINER,
  фіксований `search_path`).

## RLS

- RLS увімкнено на всіх таблицях `public`.
- Кожна нова таблиця: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`.
- `anon` отримує доступ лише там, де це свідоме публічне читання.
- Собівартість, закупівельні ціни, маржа, прибуток, зарплати й комісії закриті
  політиками та перевірками ролі на сервері.

## Секрети

- Секрети живуть у secret store середовища; у коді читаються тільки в
  `.handler()` серверних функцій через `process.env`.
- Заборонено комітити: service role key, KeyCRM/Binotel секрети, OpenAI ключ,
  Google credentials, будь-які токени. `.env` не комітиться, є `.env.example`.
- Ніколи не логувати й не повертати клієнту значення секретів.

## Публічні ендпойнти

`src/routes/api/public/*` доступні без сесії. Кожен обробник зобов'язаний
перевірити підпис/токен (HMAC, webhook token, worker secret) ДО будь-якого запису,
валідувати вхід через `zod` і бути ідемпотентним (`integration_events`).

## Повідомлення про вразливість

Внутрішній продукт. Про знайдену вразливість повідомляти відповідальному за ERP
у TERZI напряму; не створювати публічний issue з деталями експлуатації.
