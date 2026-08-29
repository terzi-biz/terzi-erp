# TERZI ERP

Внутрішня система будівельної компанії TERZI (Одеса): CRM, кошториси й калькулятори,
замовлення як будівельні проєкти, виробництво, склад, фінанси (управлінський облік),
маркетинг і BI-шар.

UI — українською, валюта UAH, дати DD.MM.YYYY, таймзона Europe/Kyiv.

## Стек

React 19 · TypeScript · TanStack Start/Router · TanStack Query · Tailwind v4 · shadcn/ui ·
Supabase (PostgreSQL + Auth + RLS) · Vite 7 · Vitest · Playwright · bun.

## Швидкий старт

```bash
bun install                 # або npm install
cp .env.example .env        # заповнити значення Supabase
npm run dev                 # http://localhost:8080
```

Повний шлях після clone — `docs/DEPLOYMENT.md` і `HANDOFF.md`.

## Команди

| Команда | Що робить |
| --- | --- |
| `npm run setup` | install + створення `.env` з прикладу |
| `npm run dev` | dev-сервер |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript без емісії |
| `npm run test` | Vitest (юніт/доменні тести) |
| `npm run test:e2e` | Playwright |
| `npm run build` | production-збірка |
| `npm run db:validate` | перевірка історії міграцій |
| `npm run db:reset` | локальний Supabase: reset + міграції + seed |
| `npm run db:snapshot` | machine-readable snapshot схеми |

## Документація

- `AGENTS.md` — контекст для Codex/AI-агентів (домен, правила, DoD)
- `ARCHITECTURE.md` — архітектура
- `docs/DATA_MODEL.md`, `docs/MODULES.md`, `docs/CRM.md`, `docs/ORDERS.md`,
  `docs/FINANCE.md`, `docs/PRODUCTION.md`, `docs/MARKETING.md`,
  `docs/INTEGRATIONS.md`, `docs/DATABASE.md`, `docs/SCHEMA_DRIFT.md`,
  `docs/BI.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`
- `docs/OPEN_SOURCE.md`, `docs/THIRD_PARTY_LICENSES.md`
- `docs/KNOWN_ISSUES.md`, `docs/ROADMAP.md`, `docs/adr/`
- `HANDOFF.md` — стан передачі в GitHub/Codex

## Ліцензія та третій код

Пропрієтарний внутрішній продукт TERZI. Використання стороннього open source —
див. `docs/OPEN_SOURCE.md` і `docs/THIRD_PARTY_LICENSES.md`. GPL/AGPL-код у репозиторій
не копіюється.
