Це велика фіча (~28 розділів). Пропоную реалістичний поетапний план, вбудований у наявну ERP TERZI без ламання. Кожен етап — окремий реліз, після якого можна працювати.

## Ключові принципи

- **Об'єкт = центральна сутність**, зв'язує clients / estimates / crew_bookings / calendar / files.
- Використовуємо існуючі таблиці (`clients`, `estimates`, `crew_bookings`, `profiles`, `user_roles`) — НЕ дублюємо.
- Дизайн — існуюча система (Oxford navy / gold / graphite, `AppShell`, shadcn).
- Всі server fns через `createServerFn` + `requireSupabaseAuth`, RLS обов'язково.

---

## Етап 1. База даних + реєстр (MVP каркас)

**Міграції:**
- `objects` — номер (TRZ-YYYY-NNNN, auto через sequence + trigger), name, address, coords, district, object_type, floor, lift, access, distance, notes, client_id → clients, manager_id → auth.users, source, crm_link, commercial_status, production_status, financial_status, risk_level, planned_start, planned_end, created_at/updated_at.
- `object_services` — object_id, service (enum: screed/roofing_pvc/roofing_ruberoid/insulation/demolition/plaster/polybeton/other).
- `object_zones` — object_id, name, service, area, perimeter, thickness, slope, volume, complexity, base_type, planned_start, planned_end, crew_id, status.
- `object_measurements` — object_id, type (первинний/повторний/…), date, surveyor_id, area, perimeter, thicknesses(jsonb), slopes(jsonb), base(jsonb), logistics(jsonb), photos(jsonb), files(jsonb), notes, status.
- `object_assignments` — object_id, role (manager/surveyor/estimator/foreman/brigadier/accountant/qc), user_id.
- `object_files` — object_id, zone_id?, category, url, uploaded_by, note.
- `object_comments` — object_id, author_id, body, mentions(jsonb), pinned.
- `object_status_history` — object_id, field, old_value, new_value, changed_by, changed_at.
- ALTER `estimates` ADD `object_id uuid REFERENCES objects(id)` (nullable — не ламає існуючі).
- ALTER `crew_bookings` ADD `object_id uuid REFERENCES objects(id)` (nullable).

Всі таблиці: GRANT + RLS (`authenticated` бачить, admin/director повний доступ, інші — тільки свої призначення). Тригер `update_updated_at_column` + `object_status_history` через тригер на зміни статусів.

**Server fns** (`src/lib/objects.functions.ts`):
- `listObjects` (з фільтрами: статус, менеджер, послуга, пошук)
- `getObject`, `createObject`, `updateObject`, `deleteObject`
- `linkEstimateToObject`, `linkBookingToObject`

**Роути + UI:**
- `/objects` — реєстр (таблиця, sticky-thead, фільтри, пошук, кнопка Створити).
- `/objects/new` — 5-крокова візард форма (Клієнт → Основне → Послуги → Параметри → Наступна дія).
- `/objects/:id` — карточка з вкладками (заглушками для наступних етапів): Огляд / Клієнт / Зони / Замери / Розрахунки / Договори / Виробництво / Фінанси / Файли / Задачі / Коментарі / Історія.

Пункт «Об'єкти» у бічному меню `AppShell`.

## Етап 2. Замери + Зони + інтеграція з калькуляторами

- Вкладка Замери: список + форма з фото/файлами (Supabase Storage bucket `object-files`).
- Після завершення замеру — оновлення параметрів об'єкта + автосинк у зони.
- Вкладка Зони: CRUD, копіювання, «Відправити в калькулятор» — відкриває `/screed?object=<id>&zone=<id>` з префілом (area, thickness, floor, lift, …).
- Розширення `useEstimatePrefill` → `useObjectPrefill`.
- При збереженні кошторису з калькулятора — автоматично `estimates.object_id = <id>`.

## Етап 3. Кошториси / Договори / Виробництво

- Вкладка «Розрахунки і сметы»: список `estimates` де `object_id = :id`, версії, статуси, дії (відкрити, дублювати, надіслати).
- Створення планування → запис у `crew_bookings` з `object_id`. Гейти: без завершеного замеру / погодженої сметы / оплати — блокуємо з підказкою.
- (Договори як мінімальна сутність `contracts` — окрема таблиця, файл-запис, статус, зв'язок з estimate + object. Повний договірний модуль — окремим релізом якщо треба.)

## Етап 4. Фінанси / Задачі / Файли / Коментарі / Ризики / Аналітика

- Простий `object_payments` (план/факт) + агрегати для картки (виручка/собівартість/маржа/борг).
- `object_tasks` (або розширення існуючих задач якщо є) + автопрапори.
- Файлові категорії + гейти закриття етапу.
- Автообчислення `risk_level` на основі правил (нема договору, прострочка, відсутність оплати, від'ємна маржа).
- Сторінка `/reports` — розширення новими віджетами: конверсія замір→смета→договір, план-факт, завантаження бригад.

---

## Що зроблю ЗАРАЗ (в цій відповіді після твого «так»)

**Тільки Етап 1** — реєстр + карточка з вкладками-каркасом + мастер створення + інтеграція `estimates.object_id`. Це дає робочу основу, нічого не ламає. Далі — по кроках за твоїм пріоритетом.

Скажи «ок, стартуй Етап 1» — і я одразу пишу міграцію та код. Або скоригуй порядок / об'єднай етапи.
