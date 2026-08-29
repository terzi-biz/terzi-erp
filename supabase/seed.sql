-- TERZI ERP — синтетичний seed для локальної розробки.
-- УВАГА: тільки вигадані дані. Реальні клієнти, телефони й ціни сюди не потрапляють.
-- Запуск: npm run db:reset

begin;

-- Склад -----------------------------------------------------------------
insert into public.warehouses (id, name, code, is_active)
values ('11111111-1111-4111-8111-111111111111', 'Основний склад (demo)', 'WH-DEMO', true)
on conflict (id) do nothing;

-- Групи клієнтів ---------------------------------------------------------
insert into public.client_groups (id, name)
values ('22222222-2222-4222-8222-222222222222', 'Демо-група')
on conflict (id) do nothing;

-- Клієнти ----------------------------------------------------------------
insert into public.clients (id, name, phone, email, city, group_id, source, notes)
values
  ('33333333-3333-4333-8333-333333333331', 'ТОВ «Демо Буд»', '+380000000001',
   'demo1@example.test', 'Одеса', '22222222-2222-4222-8222-222222222222', 'demo', 'Синтетичний запис'),
  ('33333333-3333-4333-8333-333333333332', 'ФОП Демо Тестовий', '+380000000002',
   'demo2@example.test', 'Чорноморськ', null, 'demo', 'Синтетичний запис')
on conflict (id) do nothing;

-- Замовлення (проєкти) ---------------------------------------------------
insert into public.orders (id, client_id, name, address, service, commercial_status, production_status, financial_status)
values
  ('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331',
   'Демо: стяжка складу', 'вул. Тестова, 1', 'screed', 'calculation', 'not_planned', 'no_invoice'),
  ('44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333332',
   'Демо: покрівля ПВХ', 'вул. Тестова, 2', 'roofing_pvc', 'estimate_sent', 'not_planned', 'no_invoice')
on conflict (id) do nothing;

commit;
