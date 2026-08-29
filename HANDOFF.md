# HANDOFF.md — передача TERZI ERP у GitHub / Codex

## Що це

Внутрішня ERP будівельної компанії TERZI: CRM, кошториси й калькулятори,
замовлення як проєкти, виробництво, склад, фінанси, маркетинг.

## Перші кроки нового розробника або AI-агента

1. Прочитати `AGENTS.md` — домен, канонічні сутності, жорсткі правила, DoD.
2. Прочитати `ARCHITECTURE.md` і `docs/DATA_MODEL.md`.
3. Підняти проєкт:
   ```bash
   bun install
   cp .env.example .env   # заповнити значення
   npm run dev
   ```
4. Перевірити зелений стан: `npm run lint && npm run typecheck && npm run test && npm run build`.
5. Перед зміною схеми — `docs/DATABASE.md` і `docs/SCHEMA_DRIFT.md`.

## Мапа документації

| Файл | Про що |
| --- | --- |
| `AGENTS.md` | контекст для Codex/AI: правила, заборони, DoD |
| `ARCHITECTURE.md` | шари, потоки, межі сервера/браузера |
| `CONTRIBUTING.md` | процес, стиль, вимоги до PR |
| `SECURITY.md` | ролі, RLS, секрети, публічні ендпойнти |
| `docs/DATA_MODEL.md` | канонічні сутності й зв'язки |
| `docs/MODULES.md` | реєстр напрямків |
| `docs/CRM.md`, `docs/ORDERS.md`, `docs/FINANCE.md`, `docs/PRODUCTION.md`, `docs/MARKETING.md` | доменні модулі |
| `docs/INTEGRATIONS.md` | Integration Core і провайдери |
| `docs/DATABASE.md`, `docs/SCHEMA_DRIFT.md` | схема й узгодження міграцій |
| `docs/BI.md` | аналітичний шар |
| `docs/TESTING.md`, `docs/DEPLOYMENT.md` | якість і релізи |
| `docs/OPEN_SOURCE.md`, `docs/THIRD_PARTY_LICENSES.md` | джерела й ліцензії |
| `docs/KNOWN_ISSUES.md`, `docs/ROADMAP.md`, `docs/adr/` | обмеження, план, рішення |

## Стан на момент передачі

- Канонічні сутності зафіксовані: `orders` — центральний проєкт, `/objects*` — редиректи.
- Реєстр модулів `src/lib/modules.ts` без fallback на «стяжку».
- Calculation Core — єдина точка підсумків із версіонуванням і blocking errors.
- RLS увімкнено на всіх таблицях; internal-фінанси закриті ролями.
- Юніт-тести й Playwright smoke налаштовані; CI перевіряє lint/typecheck/test/build/міграції.
- Відомі обмеження перелічені в `docs/KNOWN_ISSUES.md` — вони не блокують експлуатацію.

## Що робити далі

Пріоритети — `docs/ROADMAP.md`. Найближче: окреме dev-середовище БД,
reconciliation-міграції, soft delete, backfill прив'язок кошторисів,
завантаження файлів замовлення.

## Чого не робити

Переписувати робочі калькулятори без затвердження, створювати паралельні
канонічні сутності, хардкодити ціни, обходити Calculation Core, копіювати
GPL/AGPL-код, комітити секрети або реальні персональні дані.
