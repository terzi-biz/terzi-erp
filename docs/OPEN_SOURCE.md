# OPEN_SOURCE.md — використання стороннього open source

Правило TERZI:

- **MIT / Apache-2.0 / BSD** — можна адаптувати код і патерни в репозиторій з атрибуцією.
- **GPL / AGPL / mixed / source-available** — код **не копіюється** в репозиторій.
  Такі системи використовуються лише як функціональний референс або як окремий
  self-hosted сервіс, інтегрований через API/webhook.

## Прямі донори (permissive)

### marmelab/atomic-crm — MIT

- Використано як **architecture / UX reference** для CRM-поверхонь: дашборд,
  канбан угод, картки контакту/клієнта, задачі, нотатки, activity timeline,
  фільтри, патерни React Query і Supabase, структура e2e-тестів.
- Що НЕ переносилось: їх router, auth, react-admin шар, модель БД.
  Канонічні таблиці — TERZI (`crm_leads`, `crm_contacts`, `crm_requests`,
  `crm_tasks`, `crm_calls`, `clients`).
- Стан: адаптація патернів, без копіювання файлів. Атрибуція — у
  `docs/THIRD_PARTY_LICENSES.md`.

### BuildSuite-io/buildsuite_core — MIT

- Використано як **domain reference** для будівельної частини: проєкт/пакети робіт,
  стадії, кошторисування, бібліотека ресурсів і розцінок, обміри субпідряду,
  білінг субпідряду, site labour, техніка, фінансові поверхні проєкту, прогрес.
- Frappe-залежність не переносилась; модель адаптована під `orders`,
  `order_zones`, `roofing_actuals`, `payroll_*`, `stock_*`.

### medusajs/medusa — MIT (core)

- Використано як **pattern reference** для складу: inventory items, stock
  locations, reservations, immutable transactions, workflow/подієва обробка,
  модульні межі сервісів.
- ERP не перетворюється на e-commerce; TERZI-схема лишається спрощеною
  (`stock_items`, `warehouses`, `stock_balances`, `stock_documents`,
  `stock_document_lines`, `stock_reservations`, `stock_counts`).

## Референси без копіювання коду

| Проєкт | Ліцензія | Роль | Що вивчено |
| --- | --- | --- | --- |
| frappe/erpnext | GPL-3.0 | reference | облік, закупівлі, постачальники, PO, склад, активи, проєкти, витрати, рахунки/платежі |
| bvisible/Construction | GPL/AGPL (mixed) | reference | BOQ, 4D-графік, 5D-вартість, тендер, cost control, ризики, каталог ресурсів, звітність |
| bigcapitalhq/bigcapital | AGPL-3.0 | reference | подвійний запис, invoices/bills/expenses/payments, AR/AP, P&L, баланс |
| mautic/mautic | GPL-3.0 | зовнішній сервіс | кампанії, сегменти, форми, nurturing, scoring, тригери |
| knadh/listmonk | AGPL-3.0 | зовнішній сервіс | email-кампанії (легка альтернатива Mautic) |
| metabase/metabase | AGPL-3.0 / комерційна | зовнішній сервіс | read-only BI поверх Postgres (див. `docs/BI.md`) |
| plausible/analytics | AGPL-3.0 | зовнішній сервіс | веб-аналітика для сайту й лендингів |

Жоден рядок коду з цих проєктів не міститься в репозиторії TERZI ERP.

## Свідомо НЕ імпортовано

Twenty, n8n, NocoDB, ERPNext, Bigcapital, Mautic, Metabase, OpenConstructionERP —
через невідповідність стеку, copyleft/mixed/source-available ліцензії або
надлишкове дублювання архітектури.

## Процедура для нового джерела

1. Перевірити ліцензію в репозиторії джерела.
2. Якщо copyleft — тільки референс або окремий сервіс; рішення зафіксувати в ADR.
3. Якщо permissive — додати запис у `docs/THIRD_PARTY_LICENSES.md`: repository,
   ліцензія, commit/tag, що саме взято, локальні модифікації, атрибуція.
4. Оновити цей файл і, за потреби, `docs/adr/0005-open-source-license-strategy.md`.
