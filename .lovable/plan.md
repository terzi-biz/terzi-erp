# Finance Core v3 — TERZI

Єдина детермінована фінансова модель: об'єктна економіка, компанійський P&L, Cash Flow, винагороди ролей, активи/амортизація, резерв ФНЗ, звірки. План лише описує роботу — жодних змін коду чи бази на цьому кроці.

---

## 1. Аудит поточного стану

Перевірено в поточній базі та коді.

Дані:
- `finance_transactions` — 1778 операцій; 1600 без `order_id`; 242 без категорії; 231 transfer.
- `finance_allocations` — 3085 рядків (алокації існують, покриття не перевірене).
- `finance_categories` — 112; **87 без `cost_class`** (UNCLASSIFIED), решта в різнобої: `labour`, `tax`, `administrative`, `transfer` замість канонічних `payroll`, `taxes`, `overhead`.
- `payroll_profiles` 21, `payroll_kpis` 30, `payroll_periods` 2, `payroll_calculations` 8, `payroll_positions` 7.
- Таблиць активів (`assets`/`vehicles`/`fixed_assets`/`equipment`) **не існує** — амортизація зараз лише розрахункова.

Код:
- `src/lib/finance/core.ts` — канонічна математика факту (income/expense/transfer, transfer виключено з P&L) — зберігаємо як базу.
- `src/lib/finance/cost-class.ts` — 10 внутрішніх класів + keyword-fallback; є мапа canonical→internal, але БД заповнена канонічними назвами лише частково.
- `src/lib/finance/payroll-engine.ts` — `PAYROLL_ENGINE_VERSION = "payroll-1.1.0"`, `computePayroll`, KPI-тіри, графік аванс/розрахунок.
- `src/lib/core/amortization.ts` — методи амортизації є, реєстру активів немає.
- Сторінки: `finance.tsx`, `reports.finance.tsx`, `reports.ceo.tsx`, `reports.finmap.tsx`, `settings.tsx`.

Конфлікти, які треба розв'язати правилом, а не правкою даних:
| Конфлікт | Поточне | To-Be |
|---|---|---|
| Sales base | 50 000 | 25 000 + змінна від attributed Eligible GP |
| Rodion | 35 000 | 30 000 |
| Finance | 35 000 | 30 000 |
| Прораби | стара логіка 30% net | 8% від attributed GP напрямку |
| Категорії | 87 UNCLASSIFIED | 100% покриття cost_class |
| Транзакції | 1600 без order_id | покриття алокацій за правилом direct/overhead |
| Marketing spend | ERP ≠ рекламні кабінети | контрольована звірка з reason-кодами |

---

## 2. Цільовий фінансовий водоспад

```text
Object accrual revenue (акт/виконано, НЕ гроші)
  − Direct cost (матеріали, роботи, логістика, підрядники, техніка на об'єкт)
  = Object gross profit
  − Allocated production overhead
  = Object contribution
  ─────────────────────────────
Σ Object contribution
  − Role variable (sales / estimator / foreman / marketing / driver)
  − Fixed OPEX (офіс, адмін, підписки, оклади)
  − Media spend
  − Taxes
  = Operating profit
  − CEO bonus
  − FNZ / CAPEX / warranty reserve
  = Distributable profit → dividends | retained profit
```

P&L (нарахування) і Cash Flow (Finmap) — **два окремі звіти**. Transfer не входить у жоден з показників P&L. Жоден legacy-платіж не додається до факту Finmap.

---

## 3. Модель даних: спершу наявні таблиці

Використовуємо наявне:
- `finance_categories.cost_class` — привести до канонічної таксономії: `materials, works, logistics, subcontractors, equipment, payroll, marketing, taxes, overhead, financing, transfer, other`. Backfill 87 порожніх + переіменування `labour→payroll`, `tax→taxes`, `administrative→overhead`.
- `finance_allocations` — носій розподілу на об'єкт/напрямок; інваріант «сума алокацій = сума транзакції».
- `finance_transactions` — факт грошей, read-only.
- `payroll_*` — нарахування, KPI, періоди.
- `orders`, `estimates` — accrual revenue та напрямок.

Нові таблиці лише там, де наявна схема не тягне:
- `finance_rules` — версіоновані правила (ставки, %, пороги) з `effective_from`/`effective_to`.
- `assets` + `asset_depreciation` — реєстр техніки/авто та нарахована амортизація.
- `finance_reserves` — ФНЗ/warranty/CAPEX: цільовий рівень, поповнення, використання.
- `finance_reason_codes` — причини: `unmatched`, `needs_review`, `manual_override`, `out_of_scope`, `personal`, `intercompany`.

Кожна нова таблиця в одній міграції: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → політики (читання — `admin/director/finance`).

---

## 4. Формульний рушій і джерело правди

- Усі формули — у `src/lib/finance/*` та `src/lib/core/*`. Жодних ставок і відсотків у React-компонентах.
- Ставки, %, пороги, бази — тільки в `finance_rules`, редагуються в Finance Settings із правами.
- Кожне правило має `effective_from`/`effective_to`; історичні періоди перераховуються правилом, чинним на дату періоду.
- Версія рушія (`FINANCE_CORE_VERSION`, `PAYROLL_ENGINE_VERSION`) зберігається в результаті періоду — результат відтворюваний.
- Зміна правила = новий рядок, не перезапис. Аудит у `audit_logs`: хто, коли, було/стало.

---

## 5. Рушій винагород ролей (To-Be)

Загальне правило: Sales, Estimator, Foreman рахуються від **attributed Eligible GP своєї ролі** (об'єкти/напрямки, за які роль відповідає), ніколи від company GP.

| Роль | База | Змінна |
|---|---|---|
| CEO | — | бонус із operating profit, після FNZ-гейту |
| Sales | 25 000 | % від attributed Eligible GP закритих ним об'єктів |
| Estimator | оклад за правилом | % від attributed Eligible GP прорахованих/виграних об'єктів |
| Foreman | оклад за правилом | 8% від GP напрямку (без старої логіки 30% net) |
| Office | 30 000 | KPI-надбавки |
| Finance | 30 000 | KPI-надбавки |
| Marketing | оклад | KPI за лідами/CPL у межах медіа-бюджету |
| Driver | оклад | за виїздами/логістичними нормами |

Eligible GP виключає: нерозподілений production overhead, media, taxes, fixed OPEX. Нарахування ≠ виплата: `accrued` фіксується в `payroll_*`, факт оплати підтягується з Finmap алокацією.

---

## 6. Активи, амортизація, CAPEX

- `assets`: назва, тип (техніка/авто/інструмент), вартість, дата введення, метод (`months|hours|shifts|m2|orders|fixed`), ресурс, залишкова вартість, відповідальний, статус.
- `asset_depreciation`: період, актив, нарахована сума, база розподілу.
- Розподіл: прямий на об'єкт — якщо є підтверджене використання (зміни/м²/виїзди); інакше — у production overhead і далі алокація за базою напрямку.
- CAPEX — рух грошей, не витрата P&L; у P&L входить лише амортизація.
- Рушій розрахунку — наявний `src/lib/core/amortization.ts`, розширений читанням реєстру.

---

## 7. ФНЗ (фонд незнижуваного залишку)

- Ціль = 2 місяці нормалізованого фіксованого burn (fixed OPEX + оклади + податки, без разових).
- Нормалізація: середнє за останні 3 закриті місяці з виключенням разових статей за reason-кодом.
- Поповнення: заданий % operating profit щомісяця, поки резерв < цілі.
- **Гейт дивідендів**: distributable profit доступний до розподілу лише коли резерв ≥ цілі; інакше показуємо «Заблоковано: резерв X% від цілі».
- Використання резерву — окрема операція з причиною та підтвердженням.

---

## 8. Контролі звірки

1. **Cash vs Accrual** — Finmap cash income/expense проти ERP accrual revenue/cost за період; різниця розкладається на дебіторку, кредиторку, аванси, transfer.
2. **Transfers** — 231 transfer виключені з P&L; контроль «жоден transfer не потрапив у revenue/expense».
3. **Allocation coverage** — % суми транзакцій, розподілених на об'єкт/напрямок; ціль і поточний факт показані окремо.
4. **Category coverage** — % транзакцій із заповненим `cost_class` (зараз 87 категорій без класу, 242 транзакції без категорії).
5. **Order/project links** — 1600 транзакцій без `order_id`: розділити на легітимний overhead і справді unmatched.
6. **Marketing spend** — ERP media проти витрат кабінетів; розбіжність показується сумою і reason-кодом, не приховується.

Усе неоднозначне → `needs_review`, ніколи не «0» і не «успішно».

---

## 9. Сторінки UI

| Сторінка | Призначення |
|---|---|
| Finance Settings | правила, ставки, cost_class, reason-коди, ФНЗ, версії |
| Object Economy | водоспад по одному об'єкту з drill-down до транзакцій |
| Company P&L | нарахування за період, повний водоспад |
| Cash Flow | рух грошей Finmap, окремо від P&L |
| Payroll / KPI | нарахування, KPI, аванс/розрахунок, accrued vs paid |
| Assets | реєстр, амортизація, розподіл |
| Reconciliation | шість контролів із розділу 8 |
| Simulator | сценарії: обсяг, маржа, ставки, media — без запису в факт |
| CEO Dashboard | верхні показники з кліком у джерело, факт окремо від прогнозу |

---

## 10. Розкатка

1. **Shadow mode** — новий рушій рахує паралельно зі старим, нічого не замінює.
2. **Backtest червень–серпень** — порівняння з контрольними точками (розділ 12).
3. **Pilot** — один напрямок (покрівля) на один закритий період.
4. **Switch** — новий рушій стає основним; старий залишається доступним для історичних періодів.
5. **Rollback** — вимикається перемикачем правил; історичні результати не перераховуються.
6. Жодного деструктивного перезапису: лише additive-міграції, backfill, версії.

---

## 11. Файли, маршрути й таблиці до зміни

Код: `src/lib/finance/core.ts`, `cost-class.ts`, `payroll-engine.ts`, `payroll.functions.ts`, `order-finance.functions.ts`, `management.functions.ts`, `service-economics.ts`, `allocations.ts`, `finmap-match.server.ts`, `src/lib/core/amortization.ts`, `src/lib/core/index.ts`.

Маршрути: `src/routes/finance.tsx`, `reports.finance.tsx`, `reports.ceo.tsx`, `reports.finmap.tsx`, `settings.tsx`, `orders.$id.tsx` + нові сторінки з розділу 9.

Таблиці: `finance_transactions` (read-only), `finance_categories`, `finance_allocations`, `payroll_*`, `orders`, `estimates`, `marketing_daily_metrics`; нові — `finance_rules`, `assets`, `asset_depreciation`, `finance_reserves`, `finance_reason_codes`.

---

## 12. Приймальні тести та інваріанти

Інваріанти:
- Σ алокацій транзакції = сума транзакції (до копійки).
- Transfer не впливає на revenue, expense, GP, profit.
- Жодна операція не врахована двічі (Finmap + legacy, або прямо + через overhead).
- Округлення тільки на фінальному кроці.
- Зміна правила не змінює закритий період.
- Sales/Estimator/Foreman рахуються лише від attributed GP.

Контрольні точки backtest (як тестові очікування, не хардкод у коді):
- Серпень: production revenue 5 727 177,20.
- GP до нерозподіленого production OH: 1 837 852,20 (~32,09%).
- Provisional unallocated production OH: 471 865,75.
- FinMap cash: income 5 672 314,47, expense 5 685 064,55.
- Нормалізований recurring non-payroll OPEX (черв–серп, середнє): ~125 079.
- Media spend (середнє): ~109 127.
- Прораби, серпень: покрівля GP 781 398 (32,46%), стяжка GP 1 056 454 (31,82%); 8% від GP дає сумарну виплату, майже рівну фактичній серпневій.

Definition of Done: lint/typecheck/тести/build зелені; історичні кошториси й періоди не змінені; internal-фінанси не витікають у клієнтські документи; кожна цифра дашборда клікається до джерела.
