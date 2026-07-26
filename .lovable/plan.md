# План: Пріоритет 2 + Пріоритет 3

Це великий обсяг — розіб'ю на 7 етапів. Кожен етап — окрема міграція БД + код + перевірка. Зупинюсь після кожного етапу для швидкої верифікації, щоб не накопичувати помилок.

## П2.4 — Версії кошторису (immutable snapshot)
- Нова таблиця `estimate_versions`: `id`, `estimate_id`, `version_no`, `snapshot` (jsonb, копія `calculation_json` + фін.поля + payload), `engine_version`, `price_book_version`, `approved_by`, `approved_at`, `note`, `created_at`. RLS: read — власник/менеджер об'єкта/admin/director; insert — той самий; update/delete — заборонено (immutable).
- Server fn `approveEstimate({id, note?})` — читає поточний кошторис, вставляє новий рядок у `estimate_versions` з `version_no = max+1`, ставить статус `approved` + `approved_at`.
- Server fn `listEstimateVersions({estimate_id})` і `getEstimateVersion({id})`.
- При спробі змінити «approved» кошторис у `saveEstimate` — блокуємо; редагування підказує «створити нову версію». Хендлер `forkEstimateFromVersion({version_id})` — створює новий draft-кошторис на базі snapshot.
- UI: в `history.tsx` кнопка «Погодити версію», модалка «Історія версій» з diff (просто before/after JSON у details).

## П2.5 — Клієнтські групи 8-12 + режим деталізації
- Нова таблиця `client_groups` (seed 10 груп: «Підготовчі роботи», «Демонтаж», «Матеріали чорнові», «Матеріали фінішні», «Основні роботи», «Утеплення», «Гідроізоляція», «Логістика і підйом», «Обладнання», «Інше»). Керується адміном у Settings.
- Нова таблиця `client_group_mapping` (`module`, `engine_block`, `engine_key`, `client_group_id`) — маппінг з engine key → group.
- Enum режиму рендеру КП: `detailed | condensed | turnkey` (зберігається на кошторисі: колонка `client_view_mode`).
- `EstimateView.tsx` `ClientSheet`:
  - `detailed` — як зараз (по позиціях),
  - `condensed` — групуємо по `client_group_id`, показуємо групи з підсумками,
  - `turnkey` — 1 рядок «Комплекс робіт під ключ» + примітка про склад.
- Селектор режиму в UI.

## П2.6 — `showInClient` як enum з 4 значень
- Enum `show_in_client_mode`: `always | detailed_only | condensed_only | never`.
- Замінити `boolean is_client_visible` у `catalog_items` (fallback: `true→always`, `false→never`).
- Оновити engines: розрахунок повертає це поле на лінії, `EstimateView.ClientSheet` фільтрує згідно з поточним `client_view_mode`.
- UI редактора каталогу — селект замість чекбокса.

## П3.7 — План-факт (виробнича версія)
- Розширити `estimate_versions` — тип версії `snapshot_kind`: `approved | production`.
- При переведенні статусу `inWork` — автоматично клонуємо approved у production version.
- Додаємо в snapshot.lines поля `fact_qty`, `fact_price`, `fact_note`, `fact_updated_by`, `fact_updated_at`.
- Server fn `updateFactLine({version_id, line_key, fact_qty?, fact_price?, fact_note?})` — inplace update у snapshot (jsonb_set).
- Новий route `/production/:estimateId` — компактний екран прораба: список ліній з полями план/факт/дельта, автосейв, підсумок відхилень.
- Пункт меню «Виробництво» — список активних `inWork` кошторисів.

## П3.8 — Полістиролбетон і машинна штукатурка
- Два нових engines: `src/lib/polystyrene-calc.ts`, `src/lib/plaster-calc.ts` (структура як у screed-calc: constants, engine, версія у `engines/versions.ts`).
- Два нових routes: `/polystyrene`, `/plaster`.
- Seed каталогу для двох нових модулів у `catalog.functions.ts` (`module` тепер union з двома новими значеннями — оновити zod enum у `estimates.functions.ts` теж).
- Наявний `roofing` полістиролбетон-суб-режим лишаю поки що; окрема сторінка — точна.

## П3.9 — Розширення полів
- `roofing-calc.ts`: PIR товщина+товщина ухилу, клин ухилу (шт), вітрова зона мембрани (I-IV), довжина траси (для логістики). UI — окрема секція «Додаткові параметри».
- `screed-calc.ts`: вологість основи (dry/damp/wet) — впливає на праймер/грунтовку.
- `insulation-calc.ts`: клин, вітрова зона.
- Оновити версії engines.

## П3.10 — Аналітика у /reports
- Server fn `reportProfitBy({dimension, dateFrom, dateTo})` — dimension: `manager | crew | source | supplier`.
- `reports.tsx`: таблиці і прості bar-charts (recharts вже підключений) з фільтрами і CSV-експортом.

## Технічні деталі
- Кожна нова таблиця в `public` — з блоком `GRANT SELECT,INSERT,UPDATE,DELETE ON ... TO authenticated; GRANT ALL ... TO service_role;` + RLS.
- Всі нові server fns через `createServerFn` з `requireSupabaseAuth`.
- Оновлення `client.ts`/`types.ts` — після кожної міграції автоматично.
- Після кожного етапу typecheck + збірка + одна фіксація роботи в UI.

## Порядок виконання
Порядок = П2.4 → П2.5 → П2.6 → П3.7 → П3.8 → П3.9 → П3.10. Готовий стартувати з П2.4 (міграція + server fns + UI approve/list versions).
