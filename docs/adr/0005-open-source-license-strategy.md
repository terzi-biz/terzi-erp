# ADR 0005 — стратегія використання open source

Статус: прийнято

## Контекст

Для збагачення ERP розглядались зрілі open-source системи: Atomic CRM,
BuildSuite, Medusa, ERPNext, bvisible/Construction, Bigcapital, Mautic,
Metabase, Plausible. Ліцензії різні: від MIT до AGPL і mixed.

## Рішення

- **MIT / Apache-2.0 / BSD** — дозволено адаптувати код і патерни в репозиторій
  з обов'язковою атрибуцією в `docs/THIRD_PARTY_LICENSES.md`.
- **GPL / AGPL / mixed / source-available** — код у репозиторій не копіюється.
  Такі системи використовуються як функціональний референс або як окремий
  self-hosted сервіс, інтегрований через API/webhook/read-only SQL.

Прямі permissive-донори: `marmelab/atomic-crm` (CRM UX і патерни),
`BuildSuite-io/buildsuite_core` (будівельна доменна модель),
`medusajs/medusa` (складські патерни).

## Наслідки

- Репозиторій лишається пропрієтарним і придатним до закритого використання.
- Кожне нове джерело проходить процедуру з `docs/OPEN_SOURCE.md` і запис у
  `docs/THIRD_PARTY_LICENSES.md`.
- Mautic, listmonk, Metabase, Plausible за потреби розгортаються окремо і
  спілкуються з ERP лише мережево.
