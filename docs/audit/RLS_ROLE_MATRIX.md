# RLS_ROLE_MATRIX.md — ролі, права та фактичне їх виконання

Дата: 01.08.2026. Джерело: `pg_policies`, `user_roles`, `user_access`, `role_permissions`, `src/lib/access*.ts`.

## 1. Головний висновок: у системі дві незалежні системи ролей, і вони не пов'язані

| | Система A (RLS) | Система B (UI «Доступи і ролі») |
| --- | --- | --- |
| Носій | enum `app_role`, таблиця `user_roles` (8 рядків) | таблиця `access_roles` (6) + `user_access` (6) + `role_permissions` (1656) |
| Значення | admin, director, finance, manager | owner, ops_admin, sales_manager, surveyor, foreman, finance |
| Перевірка | `has_role(auth.uid(), 'admin')` у **майже всіх** RLS-політиках | `has_permission(uid, module, action)` / `can_manage_access(uid)` |
| Де використовується | Postgres, на кожному запиті | сторінка `/access`, частина серверних функцій, 3 таблиці (`audit_logs`, `integration_secrets`, `access_*`) |

Перетин значень — лише `finance`, і навіть він означає різні речі. Тобто модуль «Доступи і ролі», в який вкладено 1656 записів прав, **на 95% не впливає на реальний доступ до даних**: PostgREST-запити з браузера перевіряються виключно системою A.

## 2. Фактичний розподіл ролей (6 користувачів)

| Користувач | `app_role` (реально керує доступом) | `access_role` (показується в UI) | Наслідок |
| --- | --- | --- | --- |
| terzi.deals@gmail.com | admin, manager | owner | ОК — має повний доступ |
| pm.terzi.krovly@gmail.com | admin, manager | foreman | **Невідповідність**: у UI «бригадир», у БД повний адмін |
| office@terzi.biz | manager | finance | **Не бачить кошторисів як фінансист** — політика вимагає `app_role='finance'` |
| terzi.manager1@gmail.com | manager | ops_admin | «Операційний адмін» без жодних адмінських прав у БД |
| maliutaoleg@gmail.com | manager | surveyor | бачить лише власні записи |
| office.terzi@gmail.com | manager | foreman | бачить лише власні записи; `object_assignments` порожня → **не бачить жодного об'єкта** |

Ролей `director` і `finance` у `user_roles` **не має жоден користувач**, хоча половина політик написана саме під них. Це мертві гілки прав.

## 3. Матриця: сутність × роль × фактичне право (з `pg_policies`)

Легенда: `own` — лише власні рядки; `all` — усі; `—` — немає.

| Таблиця | admin | director | finance | manager (усі 5 користувачів) | anon |
| --- | --- | --- | --- | --- | --- |
| clients | SELECT all, UPD all, DEL all | SELECT all | — | own (owner_id) | — |
| estimates | all | SELECT all | SELECT all | own | — |
| objects | ALL all | ALL all | — | own / manager_id / через `object_assignments` (порожня) | — |
| object_files, object_zones, object_measurements, object_comments | через `can_view_object` / `can_manage_object` | — | own upload | — |
| catalog_items | ALL | ALL | — | **SELECT `true` — бачать усі автентифіковані**, у т.ч. закупівельні ціни | — |
| coefficients, material_items, work_items, logistics_items | ALL | ALL | — | SELECT | — |
| crm_leads / crm_tasks / crm_calls / crm_contacts / crm_requests | через `crm_is_manager()` | own або assigned_to | — |
| audit_logs | `can_manage_access(uid)` або власні дії | — |
| integration_secrets | `can_manage_access(uid)` (SELECT) | — |
| user_roles | 5 політик, self-read + admin-manage | self | — |
| integration_oauth_states, integration_tokens | **0 політик** — доступ лише service_role | — |

## 4. Виявлені проблеми

### 4.1 Роль `manager` не бачить чужих даних — і це ламає роботу (CRITICAL для експлуатації)

5 із 6 користувачів мають лише `manager`. Політики `objects_read_scoped`, `Owner or admin/director sees clients`, `Owner or admin/director/finance read` (estimates) дають їм лише власні записи. Керівник напрямку, операційний адміністратор і фінансист **не бачать роботи колег**, попри те, що UI показує їм відповідні ролі. Система працює лише під двома адмінами.

### 4.2 Прайс і собівартість відкриті всім автентифікованим (HIGH)

```
policy "Auth read catalog" on catalog_items for select to authenticated using (true)
```

`catalog_items` (192 рядки) містить закупівельні ціни та маржинальні тіри (`sell_price_t50..t500`). Project Knowledge прямо вимагає: «внутрішня собівартість, закупівельні ціни, маржа, прибуток — конфіденційні; менеджери з продажу не повинні їх бачити». Політика `using(true)` це порушує. Те саме для `material_items`, `work_items`, `logistics_items`, `coefficients`, `catalog_tier_margins`.

Приховування внутрішніх цифр реалізовано **лише у фронтенді** (`EstimateView.tsx`, режим «клієнтський вигляд»), тобто обходиться одним запитом з консолі браузера.

### 4.3 `access_roles` без впливу на дані (HIGH)

Зміна ролі в модулі «Доступи» не змінює нічого в RLS. Адміністратор вважає, що знизив права співробітника, а фактично права визначаються `user_roles`, яку той самий UI не редагує (перевірено: `/access` пише в `user_access`).

### 4.4 Дві різні ідентичності користувача (MEDIUM)

`profiles` має і `id`, і `user_id`. `user_roles.user_id` / `user_access.user_id` посилаються на `profiles.user_id` (= `auth.uid()`), а не на `profiles.id`. Join по `profiles.id` дає 0 збігів. Це готова пастка: будь-який майбутній запит або політика, що з'єднає по `profiles.id`, мовчки поверне порожньо і **відкриє або закриє доступ помилково**.

### 4.5 `has_role` — SECURITY INVOKER (INFO, свідоме рішення)

`has_role` виконується від імені викликача і читає `user_roles`, тому залежить від self-read політики на `user_roles`. Це було зроблено навмисно під час попереднього виправлення безпеки. Працює, але робить перевірку прав залежною від політик тієї ж таблиці — крихка конструкція; канонічний підхід — SECURITY DEFINER з фіксованим `search_path` (як зроблено для решти 6 функцій).

### 4.6 DEFINER-функції доступні ролі `authenticated` (MEDIUM)

`can_manage_access`, `can_manage_object`, `can_view_object`, `crm_is_manager`, `has_permission`, `is_access_owner` мають `EXECUTE` для `authenticated`. Це необхідно для роботи політик, але означає, що будь-який користувач може викликати їх напряму через RPC і **перебирати `object_id`, з'ясовуючи, які об'єкти існують** (boolean-оракул). Ризик низький, але фіксується.

## 5. Рекомендації

1. Прийняти **одну** систему ролей. Практично: залишити `access_roles` як продуктову модель і переписати всі RLS-політики на `has_permission(auth.uid(), 'module', 'action')`, а `app_role` звести до технічного `is_admin`.
2. До моменту (1) — синхронізувати `user_roles` з `user_access` тригером, інакше система непридатна для 4 із 6 співробітників.
3. Закрити `catalog_items` та решту прайсових таблиць: SELECT закупівельних/маржинальних колонок — лише для owner/finance; для продажників — окрема view з `sell_price_*`.
4. Заповнити `object_assignments` при призначенні бригади, інакше бригадири не бачать роботу.
5. Уніфікувати ідентичність: прибрати `profiles.id` або зробити `id = user_id`.
