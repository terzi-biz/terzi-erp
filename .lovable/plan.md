
# Пілот ERP-калькулятора: ПВХ-мембрана

Мета: перевести один напрям (ПВХ-мембрана) на нову модель "довідники в БД + детермінований engine + дві версії кошторису + експорт". Решта 3 напрямів мігруються за тим самим патерном на наступних кроках, не ламаючи поточні `screed/roofing/insulation/demolition`.

## Що вже витягнуто з файлів
Розпарсив `TERZI_сметный_калькулятор_ПВХ_мембрана.xlsx` (9 листів). Виявлено канонічну структуру:
- `01_Калькулятор` — 17 вводних параметрів (площа, парапети, воронки 4 типи, аератори, коеф. продажу матеріалів/робіт, транспорт, резерв).
- `02_Материалы` — 21 позиція з формулами кількості (`ROUNDUP`, `MAX`), `cost_price`, `sale_price = cost * K_material`.
- `03_Работы` — 7 робіт (підготовка, геотекстиль, воронки, аератори, мембрана, парапет, капельник), `sale = cost * K_works`.
- `04_Транспорт` — доставка/кран/розвантаження/км + 7 допробіт, `sale = cost * K_transport`.
- `05_БазаМат` / `06_БазаРаб` — прайс з посиланнями (КП Лебер стр.1) — це source-of-truth для `cost_price`.
- `07_Коэф` — коефіцієнти запасу (мембрана 1.10, геотекстиль 1.05, метал 1.15 тощо), нормативи (герметик 1 туба/16 м.п., диски 1/150 м²…).
- `08_Логика` — прописані правила (площа парапету = L×(H+W); ROUNDUP; MIN пакування).
- `09_Источники` — реєстр джерел цін.
Файл збережено як JSON: `/mnt/documents/terzi-analysis/pvc_raw.json`.

## Архітектура

```text
uploads → parser (одноразово, вручну керовано) → JSON manifest
JSON manifest → migration seed → БД довідники
UI форма (input_fields) → serverFn engine (formulas + coefficients + prices) → EstimateResult
EstimateResult → 2 версії: клієнт / внутрішній → PDF + Excel + збереження в estimates
```

Engine детермінований на TypeScript, LLM не використовується для розрахунків.

## База даних (нові таблиці)

- `directions(id text pk, name, category, description, active)`
- `input_fields(id, direction_id, field_key, label, type, unit, required, default_value, enum_values jsonb, sort_order, affects_formula)`
- `material_items(id, direction_id, code, name, unit, cost_price, sale_coef_key, consumption_formula, supplier, source_ref, sort_order, is_optional)`
- `work_items(id, direction_id, code, name, unit, cost_price, sale_coef_key, quantity_formula, sort_order, is_optional, is_client_visible)`
- `logistics_items(id, direction_id, name, unit, cost_price, sale_coef_key, quantity_formula, sort_order)`
- `additional_services(id, direction_id, name, unit, cost_price, sale_coef_key, quantity_formula, is_client_visible)`
- `coefficients(id, direction_id, group, key, value numeric, description)` — сюди йде і `K_material/K_works/K_transport`, і всі коеф. запасу.
- `formulas(id, direction_id, key, expression, output_unit, description)` — реєстр іменованих формул для UI-підказок.
- `estimate_sections(id, direction_id, name, sort_order, client_visible, internal_visible)`

Розширення до існуючих `estimates`:
- `direction_id text`, `calculation_json jsonb`, `client_lines jsonb`, `internal_lines jsonb`, `price_book_version int`, `engine_version text`.

RLS: читання — `authenticated`; запис прайсів/коефів — тільки `admin` (через `has_role`). GRANT + policies у тій же міграції.

## Формат `expression` (безпечно виконуваний)

Обмежений DSL: `+ - * / ( )`, функції `ROUNDUP, MAX, MIN, IF, SUM`, посилання на `inputs.<field_key>` та `coef.<key>`. Виконує серверний парсер (whitelist AST на базі `expr-eval` або мінімальний власний). Це прямий переклад Excel-формул: `ROUNDUP((area + perimeter*(h_parapet+w_horizontal))*coef.K_MEM, 0)`.

## План виконання (одним релізом)

1. **Міграція БД** — таблиці + RLS + GRANT + `price_history` (окрема таблиця для аудиту зміни цін).
2. **Seed ПВХ-напряму** — SQL-migration з `insert` усіх 21 матеріалу, 7 робіт, 4 транспорт-позицій, 15 коефіцієнтів. Джерело: витягнуте з xlsx, `source_ref="КП Лебер 04.05.2026 стр.1"`.
3. **Server functions** (`src/lib/pvc.functions.ts`):
   - `getDirectionManifest("pvc_membrane")` — повертає всі довідники (public read).
   - `calculatePvcEstimate({ inputs })` — детермінований engine, повертає `{ client_lines, internal_lines, totals, warnings }`.
   - `savePvcEstimate` — запис у `estimates` з обома JSON.
4. **Engine** (`src/lib/engines/pvc-engine.ts`) + універсальний `src/lib/engines/formula-eval.ts` (whitelist AST). Юніт-тести на 3 контрольних кейсах з xlsx (200 м², 100 м², 500 м²) — числа мають зійтись.
5. **UI** `/directions/pvc` — форма з `input_fields`, live-recalc, дві таби "Клієнту / Внутрішній", підсвітка маржі. Внутрішня таба гейтиться `has_role('admin' or 'director' or 'finance')` серверно.
6. **Експорт**: PDF (jsPDF + вже існуючі `pdfFonts.ts` кирилиця) і Excel (`xlsx` вже встановлено) — окремі шаблони для двох версій. Водяний знак з існуючого `EstimateWatermark`.
7. **Інтеграція**: маршрут додається окремо, старий `/roofing` лишається робочим. У сайдбарі — новий розділ "Напрями (нова модель)" з єдиним пунктом "ПВХ-мембрана". Після ОК користувача решта 3 напрямів мігруються по цьому ж патерну.

## Що НЕ входить у цей крок
- Не переписуємо `screed/roofing/insulation/demolition` — вони працюють як зараз.
- Не робимо загальний "import Excel wizard" для довільних прайсів (це вже є в `PriceImportDialog`, окремий трек).
- Не інтегруємо з календарем/актами/договорами (окремі фази).
- Контракти/акти/лід-картка — окремі майбутні кроки.

## Конфлікти/питання для ручної перевірки (винесу в `/mnt/documents/terzi-analysis/pvc_review.md` після імпорту)
- У поточному `src/lib/roofing-calc.ts` PVC-логіка спрощена (немає окремих типів воронок S-Scupper/S-Gully/S-Drain, немає ПВХ-металу як окремої позиції). Нова модель — точніша; при переході старі кошториси лишаються як snapshot у `estimates.payload`.
- Коефіцієнт продажу транспорту в xlsx = 1 (без маржі); підтвердити правило.
- Мінімальний чек у xlsx ПВХ не заданий — брати `settings.minCheck`?

Після апруву — запускаю міграцію, потім seed+код в одному циклі.
