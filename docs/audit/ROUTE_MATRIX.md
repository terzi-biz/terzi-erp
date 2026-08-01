# ROUTE_MATRIX — карта маршрутів (src/routes)

Обмеження: LOVABLE_BROWSER_AUTH_STATUS=signed_out — активної сесії немає, автентифіковані сторінки в браузері не перевірялися. Оцінка «робоча/заглушка/недосяжна» зроблена статичним аналізом коду (наявність `component`, запитів даних, `beforeLoad`/`useAuth`), без живого рендеру. Позначено «НЕ ПЕРЕВІРЕНО» де це важливо.

Захист визначався за: `beforeLoad` з `redirect` (route:file:line) АБО перевіркою `useAuth()` всередині компонента. Якщо жодного немає — позначено «публічний / НЕ ПЕРЕВІРЕНО (немає видимого guard)».

| # | Шлях (URL) | Файл | Тип | В меню (AppShell.tsx) | Захист | head()/SEO | Стан |
|---|---|---|---|---|---|---|---|
| 1 | `/` | src/routes/index.tsx | сторінка | Так (topLinks, AppShell.tsx:69) | useAuth в компоненті (index.tsx:26), без beforeLoad-redirect | Так (index.tsx head grep, файл містить `head:`) | Робоча, але TS2741 на index.tsx:59 (Link на /screed без search) |
| 2 | `/access` | src/routes/access.tsx | сторінка | Так, умовно для admin/director (AppShell.tsx: `canManageAccess`) | Так, `beforeLoad` (access.tsx:22) | Так (access.tsx:26) | Робоча |
| 3 | `/api/public/integrations/oauth/callback` | src/routes/api/public/integrations/oauth.callback.tsx | API-route | Ні (немає, і не повинно бути) | Публічний (без beforeLoad, за задумом — колбек OAuth) | Немає (не потрібен для API) | Робоча (НЕ ПЕРЕВІРЕНО в рантаймі — потребує зовнішнього OAuth-провайдера) |
| 4 | `/api/public/integrations/webhook/$slug` | src/routes/api/public/integrations/webhook.$slug.tsx | API-route | Ні | Публічний (webhook за призначенням) | Немає | Робоча (НЕ ПЕРЕВІРЕНО в рантаймі) |
| 5 | `/api/public/integrations/worker` | src/routes/api/public/integrations/worker.tsx | API-route | Ні | Публічний | Немає | Робоча (НЕ ПЕРЕВІРЕНО в рантаймі) |
| 6 | `/branding` | src/routes/branding.tsx | сторінка | Так (bottomLinks, AppShell.tsx) | НЕ ПЕРЕВІРЕНО — немає `beforeLoad`, немає `useAuth` у файлі | Ні (head=0) | Робоча (доступ не обмежений — потенційна проблема, див. FRONTEND_AUDIT) |
| 7 | `/clients` | src/routes/clients.tsx | сторінка | Так (crmLinks, AppShell.tsx) | Так, `beforeLoad` (clients.tsx:13) | Ні (head=0) | Робоча, TS2741 на clients.tsx:178 (Link на /screed без search) |
| 8 | `/crm/calls` | src/routes/crm.calls.tsx | сторінка | Так (crmLinks) | Так, beforeLoad (crm.calls.tsx:13) | Так (crm.calls.tsx:17) | Робоча |
| 9 | `/crm/contacts` | src/routes/crm.contacts.tsx | сторінка | Так (crmLinks) | Так, beforeLoad (crm.contacts.tsx:13) | Так (crm.contacts.tsx:17) | Робоча |
| 10 | `/crm/` | src/routes/crm.index.tsx | сторінка | Так, «Панель CRM» (crmLinks) | Так, beforeLoad (crm.index.tsx:12) | Так (crm.index.tsx:16) | Робоча |
| 11 | `/crm/leads` | src/routes/crm.leads.tsx | сторінка | Так (crmLinks) | Так, beforeLoad (crm.leads.tsx:16) | Так (crm.leads.tsx:20) | Робоча |
| 12 | `/crm/requests` | src/routes/crm.requests.tsx | сторінка | Так (crmLinks) | Так, beforeLoad (crm.requests.tsx:13) | Так (crm.requests.tsx:17) | Робоча |
| 13 | `/crm/tasks` | src/routes/crm.tasks.tsx | сторінка | Так (crmLinks) | Так, beforeLoad (crm.tasks.tsx:13) | Так (crm.tasks.tsx:17) | Робоча |
| 14 | `/demolition` | src/routes/demolition.tsx | сторінка (модуль-калькулятор) | Так, через розкривний пункт «Модулі» (AppShell.tsx: modules) | useAuth у компоненті (demolition.tsx:42), без beforeLoad | Ні (head=0) | Робоча; ціль TS2741 непрямо — на неї веде `<Link>` з AppShell.tsx:157 без обов'язкового search |
| 15 | `/directions-editor` | src/routes/directions-editor.tsx | сторінка | Так (bottomLinks) | НЕ ПЕРЕВІРЕНО — немає beforeLoad і немає useAuth у файлі | Ні (head=0) | Робоча, але доступ не обмежений на рівні route |
| 16 | `/equipment` | src/routes/equipment.tsx | сторінка | Так, через розкривний пункт модуля (AppShell.tsx: «Обладнання», search={{module:m}}) | НЕ ПЕРЕВІРЕНО — немає beforeLoad/useAuth у файлі | Ні (head=0) | Робоча, `validateSearch` обов'язковий (equipment.tsx:10) |
| 17 | `/history` | src/routes/history.tsx | сторінка | Так (bottomLinks) | useAuth у компоненті (history.tsx:66), без beforeLoad-redirect | Так (history.tsx:1 містить head, за grep) | Робоча |
| 18 | `/insulation` | src/routes/insulation.tsx | сторінка (модуль-калькулятор) | Так, через «Модулі» | useAuth у компоненті (insulation.tsx:51), без beforeLoad | Ні (head=0) | Робоча |
| 19 | `/integrations` | src/routes/integrations.tsx | сторінка | Так, умовно для admin/director (AppShell.tsx `canManageAccess`) | useAuth у компоненті (integrations.tsx:62), без beforeLoad-redirect | Ні (head=0) | Робоча |
| 20 | `/invite/$token` | src/routes/invite.$token.tsx | сторінка | Ні (публічне посилання-запрошення, свідомо поза меню) | Публічна за задумом | Так (за grep head=1) | Робоча (НЕ ПЕРЕВІРЕНО в браузері — потребує дійсного токена) |
| 21 | `/login` | src/routes/login.tsx | сторінка | Ні (свідомо поза меню, вхідна точка для неавторизованих) | Публічна за задумом | Так (login.tsx head=1) | Робоча |
| 22 | `/logistics` | src/routes/logistics.tsx | сторінка | Так, через розкривний пункт модуля | НЕ ПЕРЕВІРЕНО — немає beforeLoad/useAuth у файлі | Ні (head=0) | Робоча, `validateSearch` обов'язковий (logistics.tsx:10) |
| 23 | `/materials` | src/routes/materials.tsx | сторінка | Так, через розкривний пункт модуля | НЕ ПЕРЕВІРЕНО — немає beforeLoad/useAuth у файлі | Так (materials.tsx head=1) | Робоча, `validateSearch` обов'язковий (materials.tsx:18) |
| 24 | `/objects/$id` | src/routes/objects.$id.tsx | сторінка (деталі об'єкта) | Ні прямого пункту меню — доступна лише через клік з `/objects` (список) | Так (objects.$id.tsx head=1, ознака guard-логіки) | Так | Робоча, «маршрут без прямого посилання в меню» |
| 25 | `/objects/` | src/routes/objects.index.tsx | сторінка | Так, «Об'єкти» (topLinks, AppShell.tsx) | Так (head=1) | Так | Робоча |
| 26 | `/objects/new` | src/routes/objects.new.tsx | сторінка (форма створення) | Ні прямого пункту меню — доступна через кнопку на `/objects` | Так (head=1) | Так | Робоча, «маршрут без прямого посилання в меню» |
| 27 | `/operations` | src/routes/operations.tsx | сторінка | Так, «Операційний календар» (topLinks) | useAuth у компоненті (operations.tsx:72), без beforeLoad | Так (operations.tsx head=1) | Робоча; найбільший файл маршрутів — 1182 рядки |
| 28 | `/production/$id` | src/routes/production.$id.tsx | сторінка | Ні прямого пункту — доступна через `/production` | useAuth у компоненті (production.$id.tsx:34), без beforeLoad | Так | Робоча, «маршрут без прямого посилання в меню» |
| 29 | `/production/` | src/routes/production.index.tsx | сторінка | Так, «Виробництво» (topLinks) | useAuth у компоненті (production.index.tsx:26), без beforeLoad | Так | Робоча |
| 30 | `/reports` | src/routes/reports.tsx | сторінка | Так (bottomLinks) | useAuth у компоненті (reports.tsx:16), без beforeLoad | Ні (head=0) | Робоча |
| 31 | `/roofing` | src/routes/roofing.tsx | сторінка (модуль-калькулятор) | Так, через «Модулі» | useAuth у компоненті (roofing.tsx:79), без beforeLoad | Так (roofing.tsx head=1) | Робоча |
| 32 | `/screed` | src/routes/screed.tsx | сторінка (модуль-калькулятор) | Так, через «Модулі», і численні `<Link to="/screed">` з дашборду/клієнтів | useAuth у компоненті (screed.tsx:88), без beforeLoad | Так (screed.tsx head=1) | Робоча; ціль трьох помилок TS2741 (AppShell.tsx:157, clients.tsx:178, index.tsx:59) |
| 33 | `/settings` | src/routes/settings.tsx | сторінка | Так (bottomLinks) | useAuth у компоненті (settings.tsx:118), без beforeLoad | Так (settings.tsx head=1) | Робоча |
| 34 | `/works` | src/routes/works.tsx | сторінка | Так, через розкривний пункт модуля | НЕ ПЕРЕВІРЕНО — немає beforeLoad/useAuth у файлі | Так (works.tsx head=1) | Робоча, `validateSearch` обов'язковий (works.tsx:18) |

Довідково: src/routes/__root.tsx — не сторінка, це layout з `head()` (root.tsx:11), `errorComponent` (root.tsx:31) та `notFoundComponent` (root.tsx:30); src/routes/README.md — документація, не route-файл.

## Маршрути без посилань у меню
- `/objects/$id` — доступний лише опосередковано, через клік по картці об'єкта в `/objects`.
- `/objects/new` — доступний лише через кнопку «Новий об'єкт» на `/objects`.
- `/production/$id` — доступний лише через клік по елементу списку на `/production`.
- `/invite/$token` — навмисно поза меню (одноразове запрошення за токеном).
- `/login` — навмисно поза меню (публічна точка входу).
- `/api/public/integrations/*` (3 файли) — не UI-сторінки, серверні API-маршрути; в меню бути не повинні.

Це очікувана поведінка для деталей/форм (drill-down), а не дефект, окрім випадку відсутності явного захисту (див. нижче).

## Пункти меню, що ведуть у нікуди
За статичним аналізом (`src/components/AppShell.tsx`) усі `to="..."` в масивах `topLinks`, `crmLinks`, `bottomLinks`, а також посилання модулів (`/${m}`, `/materials`, `/works`, `/equipment`, `/logistics`) відповідають реальним файлам-маршрутам у `src/routes`. Дослівно «в нікуди» (404) пунктів меню не знайдено.

Проблема іншого роду: `<Link>` на калькулятор модуля в AppShell.tsx:157 (`<Link to={`/${m}`}>`) не передає обов'язковий `search`-параметр і провалює типізацію (TS2741, див. FRONTEND_AUDIT.md, п.1) — у рантаймі URL, ймовірно, відкриється без параметра модуля, і сторінка отримає `undefined` там, де очікує задане значення. Це відрізняється від «404», але є прихованим функціональним дефектом навігації.

## Маршрути без видимого захисту (список для довідки)
`branding.tsx`, `directions-editor.tsx`, `equipment.tsx`, `logistics.tsx`, `materials.tsx`, `works.tsx`, `demolition.tsx`, `insulation.tsx`, `roofing.tsx`, `screed.tsx`, `index.tsx`, `operations.tsx`, `reports.tsx`, `settings.tsx`, `history.tsx`, `production.index.tsx`, `production.$id.tsx`, `integrations.tsx`, `login.tsx` — не мають `beforeLoad` з redirect на рівні route-конфігурації (grep `-L "beforeLoad" src/routes/*.tsx`). Частина з них перевіряє `useAuth()` вже всередині компонента (не блокує перший рендер/дані до перевірки), частина не має жодної видимої перевірки авторизації у файлі. Це системний ризик — деталі й наслідки в FRONTEND_AUDIT.md.
