# DATABASE.md

## Загальне

PostgreSQL (Supabase). Схема `public` — 64+ таблиць, 29 enum-типів, тригери
`update_updated_at_column`, послідовності номерів документів. RLS увімкнено скрізь.

Історія схеми — `supabase/migrations/*.sql`, іменування
`<YYYYMMDDHHMMSS>_<slug>.sql`. Валідація — `npm run db:validate`.

## Обов'язковий шаблон нової таблиці

```sql
CREATE TABLE public.<name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
GRANT ALL ON public.<name> TO service_role;

ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<name>_rw" ON public.<name>
  FOR ALL TO authenticated
  USING (...) WITH CHECK (...);

CREATE TRIGGER <name>_updated BEFORE UPDATE ON public.<name>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

RLS без GRANT = таблиця недоступна через Data API. GRANT без RLS = витік даних.

## Ролі

- Enum `app_role`: `admin`, `director`, `manager`, `finance` — використовується
  RLS-політиками через `public.has_role()`.
- Гранульовані права: `access_roles`, `role_permissions`, `user_access`,
  `user_permission_overrides`. Синхронізація в `user_roles` — тригером
  `sync_user_roles_from_access()`.
- Ролі ніколи не зберігаються в `profiles`.

## Тригери-ключові

| Тригер | Ефект |
| --- | --- |
| `set_object_number` / `set_invoice_number` / `set_stock_document_number` | нумерація документів |
| `log_object_status_change` | історія статусів замовлення |
| `log_catalog_price_change` | історія цін |
| `sync_invoice_paid` | перерахунок оплаченої суми й статусу рахунка |
| `sync_stock_reserved` | актуальний резерв на складі |
| `crm_normalize_phone` | E.164 нормалізація |
| `handle_new_user` | профіль + заявка на доступ при реєстрації |

## Функції

Складські операції (`post_stock_document`, `cancel_stock_document`,
`post_stock_count`) і `claim_integration_event` — SECURITY DEFINER з фіксованим
`search_path` і перевіркою прав усередині.

## Правила міграцій

1. Additive; не видаляти production-дані.
2. Ніяких `ALTER DATABASE`.
3. Не чіпати схеми `auth`, `storage`, `realtime`, `vault`.
4. Часозалежні правила — тригерами, не CHECK-констрейнтами.
5. Розбіжності з production фіксувати в `docs/SCHEMA_DRIFT.md`.

## Локальна робота

```bash
npm run db:reset      # supabase db reset + міграції + seed
npm run db:validate   # структурна перевірка міграцій
npm run db:snapshot   # знімок схеми для аналізу drift
```

Seed (`supabase/seed.sql`) — тільки синтетичні дані, без персональних даних клієнтів.
