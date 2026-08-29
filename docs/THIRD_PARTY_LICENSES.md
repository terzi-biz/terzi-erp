# THIRD_PARTY_LICENSES.md

Реєстр стороннього коду й джерел, використаних у TERZI ERP.

## 1. Адаптовані патерни / архітектура (permissive)

### marmelab/atomic-crm

- Repository: https://github.com/marmelab/atomic-crm
- License: MIT
- Copyright: © marmelab
- Version/ref: `main` (звірено 29.08.2026)
- Тип використання: architecture / UX reference (adapted patterns, без копіювання файлів)
- Що використано: структура CRM-дашборда й KPI, канбан-воронка, картки контакту
  та клієнта, задачі й нагадування, activity timeline, набір фільтрів,
  патерни TanStack Query + Supabase, підхід до e2e-сценаріїв.
- Локальні модифікації: повністю переписано під TanStack Start, TERZI-схему
  (`crm_*`, `clients`, `orders`) і українську термінологію.

### BuildSuite-io/buildsuite_core

- Repository: https://github.com/BuildSuite-io/buildsuite_core
- License: MIT
- Copyright: © BuildSuite
- Version/ref: `main` (звірено 29.08.2026)
- Тип використання: domain architecture reference
- Що використано: декомпозиція проєкту на пакети робіт і стадії, бібліотека
  ресурсів/розцінок, обміри та білінг субпідряду, облік праці й техніки,
  фінансові поверхні проєкту, модель прогресу.
- Локальні модифікації: Frappe-стек не використовується; модель відображена на
  `orders`, `order_zones`, `roofing_actuals`, `brigade_rates`, `payroll_*`.

### medusajs/medusa

- Repository: https://github.com/medusajs/medusa
- License: MIT (core packages)
- Copyright: © Medusa
- Version/ref: `v2` line (звірено 29.08.2026)
- Тип використання: pattern reference
- Що використано: inventory/stock location/reservation модель, незмінна історія
  транзакцій, подієві workflow, модульні межі сервісів.
- Локальні модифікації: спрощено до складських таблиць TERZI без e-commerce частин.

## 2. Референси без копіювання коду (copyleft / mixed)

| Repository | License | Використання |
| --- | --- | --- |
| https://github.com/frappe/erpnext | GPL-3.0 | функціональний референс |
| https://github.com/bvisible/Construction | GPL/AGPL (mixed) | функціональний референс |
| https://github.com/bigcapitalhq/bigcapital | AGPL-3.0 | функціональний референс |
| https://github.com/mautic/mautic | GPL-3.0 | опційний зовнішній сервіс (API/webhook) |
| https://github.com/knadh/listmonk | AGPL-3.0 | опційний зовнішній сервіс (API) |
| https://github.com/metabase/metabase | AGPL-3.0 / комерційна | опційний зовнішній BI-сервіс (read-only SQL) |
| https://github.com/plausible/analytics | AGPL-3.0 | опційний зовнішній сервіс аналітики |

Код з цих проєктів у репозиторії відсутній. Інтеграція — лише мережева (HTTP/SQL).

## 3. Runtime-залежності (npm)

Повний перелік і версії — `package.json` та `bun.lock`. Основні:

| Пакет | License |
| --- | --- |
| react, react-dom | MIT |
| @tanstack/react-router, react-start, react-query | MIT |
| @supabase/supabase-js | MIT |
| tailwindcss, @tailwindcss/vite | MIT |
| radix-ui/* (shadcn-ui base) | MIT |
| lucide-react | ISC |
| recharts | MIT |
| zod | MIT |
| jspdf, jspdf-autotable | MIT |
| html2canvas | MIT |
| xlsx (SheetJS CE) | Apache-2.0 |
| date-fns, zustand, sonner, cmdk, vaul | MIT |
| vite, vitest, eslint, prettier, typescript | MIT / Apache-2.0 |
| @playwright/test | Apache-2.0 |

Оновлювати цей файл при кожному додаванні залежності або джерела адаптації.
