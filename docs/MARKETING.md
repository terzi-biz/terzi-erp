# MARKETING.md

## Обсяг

Канали, кампанії, групи, оголошення, креативи, бюджети, щоденні метрики,
атрибуція лідів, рекомендації й алерти. Таблиці — `marketing_*`.

## Атрибуція

`marketing_touchpoints` зберігає UTM, click id, джерело, кампанію, креатив і
прив'язку до ліда/клієнта/замовлення. `src/lib/marketing/attribution.server.ts`
розкладає шлях ліда; `marketing_lead_reasons` фіксує причини відмов.

Метрики: CPL, CPQL, CAC, ROMI, конверсія за стадіями воронки
(`src/lib/marketing/kpi.ts`). Виручка береться з замовлень, а не з кошторисів.

## Синхронізація

Джерела: Meta Ads, Google Ads, форми сайту (WordPress), Telegram.
Потік — стандартний Integration Core: адаптер → `integration_events` →
worker → `marketing_daily_metrics`. Ендпойнт: `/api/public/marketing/sync`.

## Рекомендації й алерти

`marketing_recommendations` і `marketing_alerts` формуються детермінованими
правилами (`src/lib/marketing/rules.server.ts`): перевитрата бюджету, зростання
CPL, падіння конверсії, зупинена кампанія з активним бюджетом.
AI може лише пояснювати рекомендацію текстом, не рахувати її.

## Зовнішні сервіси (опційно)

Mautic / listmonk — кампанії й nurturing; Plausible — веб-аналітика лендингів.
Інтеграція через API/webhook, код у репозиторій не копіюється.
