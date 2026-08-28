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
