# TERZI ERP — стан реалізації (Build Wave A)

Документ фіксує, що саме реалізовано за Prompt №2. Оновлюється при кожній хвилі.

## Таблиця відповідності Prompt №2

| # | Вимога | Стан | Файл | Тест |
| --- | --- | --- | --- | --- |
| 0 | Launch Contract як єдине джерело правил | готово | `docs/ERP_LAUNCH_CONTRACT.md`, `src/lib/core/contract.ts` | `src/lib/__tests__/launch-contract.test.ts` |
| 1 | Єдине розрахункове ядро, підсумки народжуються один раз | готово | `src/lib/core/index.ts`, `src/lib/core/legacy-adapter.ts`, `core` у результатах усіх 5 калькуляторів | `src/lib/__tests__/core-wave-a.test.ts` |
| 1a | Серверний Core і серверна видача кошторису | готово | `src/lib/core/calc.functions.ts`, `src/lib/core/estimate-dto.functions.ts` | `src/lib/__tests__/core-wave-a.test.ts` |
| 2 | Роздільні InternalEstimateDTO / ClientEstimateDTO без внутрішніх полів | готово | `src/lib/core/dto.ts` (`toClientDTO`, `FORBIDDEN_CLIENT_KEYS`) | `src/lib/__tests__/core-wave-a.test.ts` |
| 3 | ПВХ: 1,5/1,8 мм, рулони 2×20, к-сть рулонів, технічна/закупівельна площа, залишок, профілі по 2 м, кріплення, планки, уголки, капельники, накривки, воронки, проходки | готово | `src/lib/pvc-calc.ts`, `src/routes/roofing_pvc.tsx` | `src/lib/__tests__/core-wave-a.test.ts` |
| 4 | Руберойд / утеплення / демонтаж на канонічному ядрі | готово | `src/lib/roofing-calc.ts`, `src/lib/insulation-calc.ts`, `src/lib/demolition-calc.ts` | `src/lib/__tests__/core-wave-a.test.ts` |
| 5 | Обладнання та амортизація: собівартість, маржа, галочки, % / грн/м² / фікс / у роботах | готово | `src/lib/core/amortization.ts`, інтеграція в `src/lib/core/index.ts` | `src/lib/__tests__/core-wave-a.test.ts` |
| 6 | Продавці та оплата: ФОП 2, ФОП 3 (+6% редаговано), ПДВ 20% по категоріях, без подвійного нарахування | готово | `src/lib/core/vat.ts`, `src/lib/core/adjustments.ts` | `src/lib/__tests__/core-wave-a.test.ts` |
| 7 | Підтверджений нуль, billing_mode, блокування лише невалідних позицій | готово | `src/lib/core/price-policy.ts` | `src/lib/__tests__/core-wave-a.test.ts` |
| 8 | Immutable snapshot: ціни, норми, формули, податки, оплата, амортизація, внутрішні/клієнтські рядки, версії | готово | `src/lib/estimate-snapshot.ts` (`snapshot@3`) | `src/lib/__tests__/core-wave-a.test.ts` |
| 9 | Нові розрахунки виведені з `/roofing`, історичний перегляд збережено | готово | `src/routes/roofing.tsx` (redirect), історія читає збережений знімок | — |
| 9a | Точкові обмеження ролей: внутрішні ціни лише за правом | готово | `src/lib/core/calc.functions.ts`, `src/lib/access.server.ts` | — |
| 10 | Міграції preview/rollback | не потрібні для цієї частини хвилі | — | — |

## Про міграції

Ця частина Wave A не змінює схему БД: канонічний результат зберігається всередині
вже наявного `estimates.calculation_json` (нові ключі `canonical`, `internalDTO`,
`clientDTO`, `snapshotVersion=snapshot@3`). Читачі старих знімків (`snapshot@1`,
`snapshot@2`) працюють без змін, історичні кошториси не перераховуються —
відповідно, rollback зводиться до відкату коду. Обмеження доступу до внутрішніх
цін реалізоване раніше застосованими RLS-міграціями (`private.is_finance`,
`canViewInternalPrices`) і не потребує нової міграції.

## Наступні хвилі

- Wave B — конструктор напрямків на єдиному API `calculate(direction, version, inputs)`.
- Wave C — CRM та інтеграції на спільній черзі подій.
- Wave D — маркетинг: атрибуція й KPI без «фальшивих нулів».
- Wave E — замовлення, склад і фінанси: проведення документів і звірка актів.

## Acceptance-перевірка Wave A (28.08.2026)

| Пункт | Стан | Файл | Тест |
| --- | --- | --- | --- |
| Core виконується на довіреному серверному контурі, DTO видає авторизований endpoint | готово | `src/lib/core/calc.functions.ts`, `src/lib/core/estimate-dto.functions.ts` | `src/lib/__tests__/wave-a-acceptance.test.ts` |
| Клієнтський контур без закупівель, собівартості, амортизації, прибутку, маржі (ключів немає фізично) | готово | `src/lib/core/dto.ts` | `wave-a-acceptance.test.ts` |
| Внутрішній контур лише за правом | готово | `src/lib/access.server.ts` | `wave-a-acceptance.test.ts` |
| Підтверджений нуль: причина, автор, дата, billing_mode; непідтверджений нуль блокує | готово (додано `zeroApproval`) | `src/lib/core/price-policy.ts` | `wave-a-acceptance.test.ts` |
| `/roofing` — лише історичний перегляд, нові розрахунки в `/roofing_pvc` і `/roofing_rub` | готово | `src/routes/roofing.tsx` | `wave-a-acceptance.test.ts` |
| Єдина оболонка кроків у 5 калькуляторах | готово | `src/components/calc/CalcStepRail.tsx`, `src/routes/calc.index.tsx` | `wave-a-acceptance.test.ts` |

**Залишкові обмеження, зафіксовані чесно:**
- Калькулятори досі виконують `buildCanonicalResult` і локально для миттєвого попереднього перегляду; збереження, PDF і внутрішній контур ідуть через серверні функції. Повний перенос live-preview у серверний Core запланований у Wave B (єдиний runtime `schema`/`calculate`).
- Користувацькі перемикачі амортизації (враховувати в собівартості / включати в клієнтську ціну, %, грн/м², фікс) поки доступні в налаштуваннях обладнання; крок 7 оболонки калькулятора отримає їх разом із серверним runtime Wave B, щоб не дублювати обчислення у фронтенді.
- Видалення сміттєвого напрямку «1» і dry-run дублів не виконувалися: потрібен окремий preview-прогін зв'язків, production і історія не змінюються.

## Prompt №3 — інформаційна архітектура

| Вимога | Стан | Файл | Тест |
| --- | --- | --- | --- |
| 8 розділів першого рівня, решта перенесена без втрат | готово | `src/components/nav-model.ts`, `src/components/AppShell.tsx` | `wave-a-acceptance.test.ts` |
| «Розрахунки» — картки напрямків і єдина послідовність кроків | готово | `src/routes/calc.index.tsx`, `src/components/calc/CalcStepRail.tsx` | `wave-a-acceptance.test.ts` |
| Конструктор напрямків у Налаштуваннях | готово | `src/components/nav-model.ts` (`/directions-editor`) | `wave-a-acceptance.test.ts` |
| Ролевий дашборд: ≤6 KPI, динаміка, дії, глобальні фільтри, персональний layout, «Немає даних», час оновлення | готово | `src/lib/dashboard/widgets.ts`, `src/routes/index.tsx` | `wave-a-acceptance.test.ts` |

## Prompt №4 — Webhook Core (доробка)

| Вимога | Стан | Файл | Тест |
| --- | --- | --- | --- |
| E.164-нормалізація з незмінним оригіналом | готово | `src/lib/phone.ts` | `src/lib/integrations/__tests__/webhook-core.test.ts` |
| Ідемпотентність за `provider_event_id`, лічильник дублів | готово | `src/lib/integrations/webhook-core.ts`, `core.server.ts` | там само |
| Replay-захист за `event_ts` з per-provider вікном | готово | `src/lib/integrations/webhook-core.ts` | там само |
| Атомарний захват події (без паралельної обробки дубля) | готово | `core.server.ts` (`processEvent`) | — |
| Retryable / permanent / unsupported: повтори лише де доречно | готово | `webhook-core.ts` `classifyError` | там само |
| `echo.ping` і невідомі події Binotel → `unsupported_event`, не «успіх» | готово | `src/lib/integrations/binotel/events.ts`, `adapter.server.ts` | там само |
| Журнал: фільтри provider / correlation / статус, ручний retry unsupported | готово | `src/routes/integrations.tsx`, `ops.server.ts` | — |
