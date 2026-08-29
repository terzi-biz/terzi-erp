# MODULES.md — реєстр напрямків

Джерело правди — `src/lib/modules.ts`. UI, довідники, кошториси, історія й
виробництво беруть звідси id, підпис, маршрут і права.

| id | Підпис | Маршрут | Калькулятор | Тип виробництва | Активний |
| --- | --- | --- | --- | --- | --- |
| `screed` | Стяжка | `/screed` | так | floor | так |
| `roofing_pvc` | ПВХ мембрана | `/roofing_pvc` | так | roof | так |
| `roofing_rub` | Руберойд | `/roofing_rub` | так | roof | так |
| `insulation` | Утеплення | `/insulation` | так | insulation | так |
| `demolition` | Демонтаж | `/demolition` | так | demolition | так |
| `plaster` | Штукатурка | — | ні | other | ні |
| `polybeton` | Полібетон | — | ні | floor | ні |
| `other` | Інше | — | ні | other | ні |

## Правила

1. Невідомий модуль → `findModule()` повертає `null`. Fallback на `screed` заборонений.
2. Довідник матеріалів і робіт фільтрується за `catalogModule`.
3. Кошторис зберігає `estimateModule`; історія показує підпис із реєстру.
4. Новий напрямок: додати запис у `src/lib/modules.ts`, маршрут, розділ довідника,
   двигун у `src/lib/core/module-registry.ts`, тест у `modules-registry.test.ts`,
   рядок у `e2e/smoke.spec.ts`.
5. Неактивні модулі не показуються в навігації, але лишаються валідними значеннями
   для історичних записів.

## Розрахунковий контур модуля

```text
UI (route) → *-calc.ts (чисті функції, норми з довідників)
   → RawLine[] → buildCanonicalResult() (src/lib/core)
   → CanonicalResult → внутрішній екран / клієнтський DTO / PDF / кошторис
```

Клієнтський DTO не містить собівартості, закупівельних цін, маржі й прибутку.
