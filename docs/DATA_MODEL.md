# DATA_MODEL.md — канонічна доменна модель

## Життєвий цикл

```text
Lead → Contact → Client → Order (проєкт) → Measurement → Estimate → Proposal
→ Contract → Procurement → Production → Payment → Project P&L → Handover → Warranty
```

## Канонічні сутності

| Сутність | Таблиця | Роль |
| --- | --- | --- |
| Лід | `crm_leads`, `crm_requests` | вхідний інтерес, воронка |
| Контакт | `crm_contacts` | фізична особа, телефон E.164 |
| Клієнт | `clients` | юридична/платіжна сторона |
| Замовлення (проєкт) | `orders` | **центральна сутність**, номер TRZ-YYYY-NNNN |
| Замір | `order_measurements`, `order_zones` | геометрія й умови об'єкта |
| Кошторис | `estimates`, `estimate_sections`, `estimate_versions` | версії з незмінним снапшотом |
| Рахунок | `invoices`, `invoice_lines` | виставлення до оплати |
| Платіж | `payments` | факт руху грошей |
| Витрата | `expenses` | собівартість проєкту |
| Склад | `stock_items`, `warehouses`, `stock_balances`, `stock_documents`, `stock_reservations` | матеріали й резерви |
| Виробництво | `roofing_actuals`, `crew_bookings`, `calendar_events` | план/факт і графік |
| Доступи | `user_roles`, `access_roles`, `user_access`, `role_permissions` | RBAC |

Нову сутність «об'єкт» не створювати: `/objects*` — редиректи на `/orders*`.

## Ключові зв'язки

```text
clients 1─n orders 1─n estimates
orders 1─n invoices 1─n invoice_lines
orders 1─n payments        orders 1─n expenses
orders 1─n order_zones     orders 1─n order_measurements
orders 1─n stock_reservations
orders 1─n calendar_events / crew_bookings / crm_tasks
crm_leads n─1 clients      crm_calls n─1 crm_contacts (phone_norm)
```

## Ідентичність контакту

`src/lib/phone.ts` нормалізує номер до E.164; тригер `crm_normalize_phone()`
заповнює `phone_norm` / `contact_phone_norm`. Матчинг ліда/дзвінка з клієнтом —
за `client_id`, інакше за нормалізованим телефоном.

## Походження даних

Кожне ключове поле картки замовлення має джерело: **Manual**
(`orders.management_data`), **Estimate**, **CRM**, **Integration**.
Синхронізація ніколи не перетирає Manual-значення.

## Незмінність

- Затверджений кошторис не перераховується при зміні каталогу: у ньому
  зберігається снапшот цін, норм, коефіцієнтів, `engine_version`,
  `price_book_version`, `direction_version`.
- Історія цін — `price_history`; історія статусів — `order_status_history`;
  дії користувачів — `audit_logs`.

## Фінансові визначення

- `payment` — факт оплати; не дорівнює виручці.
- `estimate total` — план; не дорівнює фактичній виручці.
- Собівартість = матеріали + роботи + логістика + обладнання/амортизація + інше.
- Markup = (Price − Cost) / Cost × 100; Margin = (Price − Cost) / Price × 100.

## Заборонені зміни

Дублювання канонічних таблиць, зберігання ролей у профілі, видалення історії,
хардкод цін, зміна семантики `orders` без ADR.
