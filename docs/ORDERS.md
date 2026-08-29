# ORDERS.md — замовлення як будівельний проєкт

`public.orders` — центральна сутність. Номер `TRZ-YYYY-NNNN` генерується тригером.

## Статуси

- Комерційний (`commercial_status`): new → qualification → measurement_scheduled →
  measurement_done → calculation → estimate_sent → negotiation → contract →
  awaiting_prepayment → sold | refused | postponed.
- Виробничий (`production_status`): not_planned → preparation → awaiting_materials →
  ready_to_plan → planned → crew_assigned → in_progress → paused → works_done →
  acceptance → remarks → handed_over → warranty.
- Фінансовий (`financial_status`): no_invoice → awaiting_payment → partial_payment →
  prepayment_received → has_debt → paid → financially_closed.
- Ризик (`risk_level`): green / yellow / red.

Кожна зміна пишеться в `order_status_history`.

## Картка замовлення (`/orders/$id`)

Блоки: шапка (номер, клієнт, адреса, напрямок, статуси, ризик), сторони й
відповідальні, обсяги й зони, кошториси/версії, договір і оплати, закупівлі й
резерви, план/факт виробництва, P&L, графік, комунікації, файли, історія.

## Ручні управлінські дані

`orders.management_data` (JSONB) — ручні поля: сума договору, аванс, планові
витрати, дати, коментар. Логіка порівняння план/факт — `src/lib/order-management.ts`
(детермінована, покрита тестами). Синхронізація з CRM/кошторисами **не перетирає**
ці значення; в UI показується походження: Manual / Estimate / CRM / Integration.

## Project P&L

```text
Виручка       = сума затверджених кошторисів / договірна сума (за режимом)
Собівартість  = матеріали + роботи + логістика + обладнання/амортизація + інше
Прибуток      = Виручка − Собівартість
Маржа         = Прибуток / Виручка × 100
Борг          = Виставлено − Оплачено
```

Джерела: `estimates`, `expenses`, `stock_documents` (списання), `payroll_entries`,
`invoices`, `payments`. Внутрішні цифри видимі лише ролям з правом на internal-фінанси.

## Правила

- Замовлення завжди має клієнта; без клієнта картка не створюється.
- Договір формується лише з затвердженого кошторису; сума договору = сумі кошторису
  (розбіжність вимагає авторизованого коригування з аудит-нотаткою).
- Акт не перевищує затверджені обсяги без зафіксованої зміни.
- Видалення замовлення заборонене; використовується статус/архів.
