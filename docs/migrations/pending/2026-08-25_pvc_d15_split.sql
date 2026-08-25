-- ПІДГОТОВЛЕНО, НЕ ЗАСТОСОВАНО. Ручний контрольований запуск після погодження.
-- TERZI ERP — розділення ПВХ-мембран у довіднику (рішення директора 25.08.2026).
--
-- Правила:
--   * Sikaplan D-15 (655 грн/м²) — окремий код, неармована мембрана ТІЛЬКИ для
--     проходок, примикань і вузлів.
--   * Основне армоване польове полотно 1,8 мм — окремий код. Ціна не підтверджена:
--     залишається порожньою, калькулятор показує blocking warning.
--   * Історичні кошториси НЕ перераховуються і НЕ бекфіляться.

BEGIN;

-- 1. Неармована деталювальна мембрана D-15.
INSERT INTO public.catalog_items (module, kind, code, name, unit, buy_price, sell_price, is_active)
VALUES ('roofing_pvc', 'material', 'pvc_d15_detail',
        'ПВХ-мембрана неармована Sikaplan D-15, 1×20 м (вузли, проходки, примикання)',
        'м²', 655.00, 851.50, true)
ON CONFLICT (module, kind, code) DO UPDATE
  SET name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      buy_price = EXCLUDED.buy_price,
      sell_price = EXCLUDED.sell_price,
      is_active = true;

-- 2. Армоване польове полотно 1,5 мм (підтверджено прайсом Sikaplan 15 G, 2.0×20 м).
UPDATE public.catalog_items
   SET name = 'ПВХ-мембрана армована Sikaplan 15 G light grey 1,5 мм, 2.0×20 м (польове полотно)',
       unit = 'м²'
 WHERE module = 'roofing_pvc' AND kind = 'material' AND code = 'pvc_15_sika';

-- 3. Армоване польове полотно 1,8 мм: ціну D-15 (655) використовувати заборонено.
--    Обнуляємо лише там, де ціна дорівнює ціні D-15 — тобто була підставлена помилково.
UPDATE public.catalog_items
   SET name = 'ПВХ-мембрана армована 1,8 мм (польове полотно) — ціна не підтверджена',
       unit = 'м²',
       buy_price = 0,
       sell_price = 0
 WHERE module = 'roofing_pvc' AND kind = 'material' AND code = 'pvc_18_sika'
   AND buy_price = 655;

COMMIT;

-- Перевірка після застосування:
-- SELECT code, name, unit, buy_price, sell_price FROM public.catalog_items
--  WHERE module = 'roofing_pvc' AND code IN ('pvc_15_sika','pvc_18_sika','pvc_d15_detail');
