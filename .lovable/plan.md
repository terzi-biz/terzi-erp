## Що зробимо (крок 3)

Google Calendar конектор уже підключено через gateway (scope: events read/write на акаунт terzi.deals@gmail.com). OAuth-авторизація працює централізовано через Lovable connector gateway, додаткове налаштування користувача не потрібне.

### Частина A — Перевірка та фікс PDF/PNG для довгих кошторисів (клієнтська версія)

1. Відкрити `src/lib/pngExport.ts` → `exportElementAsPdf`. Перевірити:
   - правильну розбивку по A4 при висоті > 1 сторінки;
   - відсутність обрізання рядків таблиці посередині (додати CSS `page-break-inside: avoid` на `<tr>` та секціях);
   - коректне масштабування при ширині > 794px;
   - `useCORS: true`, `scale: 2` для чіткості.
2. У `src/components/EstimateView.tsx` для клієнтської версії додати клас-обгортку `.print-block` навколо кожної секції/таблиці-групи з `break-inside: avoid` (Tailwind `break-inside-avoid`).
3. Для PNG-експорту (`exportElementAsPng`) — якщо контент > 4000px по висоті, ділити на 2+ зображення (zip або послідовно).
4. Додати тестову кнопку «Згенерувати тестовий довгий кошторис» у Settings (DEV) — 50+ позицій, перевірити обидва формати.

### Частина B — Google Calendar sync (estimates → events)

1. **БД**: міграція `estimates` — додати колонки:
   - `schedule_start_at timestamptz`
   - `schedule_end_at timestamptz`
   - `duration_days numeric` (авто-розрахунок)
   - `duration_override_days numeric` (ручне коригування, nullable)
   - `gcal_event_id text` (для update/delete)
   - `gcal_calendar_id text default 'primary'`
2. **Розрахунок тривалості** — `src/lib/duration-calc.ts`:
   - норми продуктивності по модулях (м²/день для бригади):
     - screed: 200 м²/день
     - roofing PVC: 150 м²/день; ruberoid 1 шар 250, 2 шари 180, 3 шари 130
     - insulation: 180 м²/день
     - demolition: 120 м²/день
   - `calcDuration(module, area, layers?) → days` (≥ 1, округлення вгору)
   - норми зберігаються у конфіг-файлі, видимі в Settings (read-only поки).
3. **Server fn** `src/lib/gcal.functions.ts`:
   - `syncEstimateToCalendar({ estimateId })` — `requireSupabaseAuth`, читає `estimates`, формує event payload, дзвонить gateway `POST /calendars/primary/events` або `PATCH` якщо `gcal_event_id` є.
   - `deleteEstimateEvent({ estimateId })` → `DELETE`.
   - Title: `[МОДУЛЬ] Клієнт — Об'єкт (площа м²)`; Description: посилання на кошторис, менеджер, статус, сума клієнта; Location: адреса об'єкта.
4. **UI у EstimateView (внутрішня вкладка)**:
   - блок «Планування» з полями: дата початку, тривалість (показано auto, можна override), кнопка «Синхронізувати в Google Calendar» / «Оновити подію» / «Видалити з календаря».
   - Показ статусу синхронізації (event_id, остання дата).

### Частина C — Сторінка «Операційний календар»

1. Новий route `src/routes/_authenticated/operations.tsx` — тижнева сітка:
   - рядки: 4 модулі (Стяжка, Покрівля, Утеплення, Демонтаж);
   - колонки: 7 днів обраного тижня;
   - комірки: картки кошторисів, що мають `schedule_start_at` у діапазоні;
   - картка показує: клієнт, площа, статус (badge), менеджер.
2. Фільтри зверху: 
   - менеджер (selector з `profiles`);
   - статус (multi-select chips);
   - діапазон тижнів (стрілки ‹ ›, кнопка «Сьогодні»);
   - модулі (toggle для приховування рядків).
3. Server fn `getOperationsSchedule({ weekStart, managerId?, statuses[] })`.
4. Клік на картку → перехід до кошторису.
5. Пункт меню в навігації: «Операційний календар».

### Частина D — OAuth/конектор

Конектор уже підключено централізовано (`GOOGLE_CALENDAR_API_KEY` секрет доступний). Жодних додаткових кроків від користувача — всі дзвінки в API проходять через `connector-gateway.lovable.dev/google_calendar/calendar/v3` з автоматичним refresh токенів.

### Файли

**Нові:**
- `src/lib/duration-calc.ts`
- `src/lib/gcal.functions.ts`
- `src/lib/operations.functions.ts`
- `src/routes/_authenticated/operations.tsx`
- `src/components/SchedulePanel.tsx` (планування + sync кнопки)
- міграція БД

**Редагування:**
- `src/lib/pngExport.ts` (фікс пагінації)
- `src/components/EstimateView.tsx` (page-break класи + SchedulePanel)
- `src/components/AppSidebar.tsx` (пункт меню)
- `src/routeTree.gen.ts` (авто)

### Поза скоупом

- Багатокористувацький OAuth (кожен користувач свій календар) — зараз single-tenant ERP, всі події в основному календарі TERZI.
- Drag-and-drop переміщення в календарі (тільки клік для відкриття).
- Конфлікт-детектор перетинів бригад (буде в окремому раунді).
- Авто-нагадування/листи з календаря (керується через стандартні Google Calendar reminders).

Кажи «го» — і починаю з міграції БД + duration-calc.
