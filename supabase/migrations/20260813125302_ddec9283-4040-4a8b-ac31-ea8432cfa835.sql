
-- 1. Orders: CRM fields
alter table public.orders
  add column if not exists amount_total numeric(14,2) not null default 0,
  add column if not exists paid_total numeric(14,2) not null default 0,
  add column if not exists payment_status text,
  add column if not exists crm_status text,
  add column if not exists ordered_at timestamptz,
  add column if not exists manager_comment text;

-- 2. Payroll & KPI
create table if not exists public.payroll_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text unique,
  base_salary numeric(14,2) not null default 0,
  target_bonus numeric(14,2) not null default 0,
  bonus_percent numeric(6,2),
  advance_percent numeric(6,2) not null default 50,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position_id uuid references public.payroll_positions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  base_salary numeric(14,2),
  hired_at date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_kpi_templates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references public.payroll_positions(id) on delete cascade,
  code text not null,
  title text not null,
  weight_percent numeric(6,2) not null default 0,
  max_bonus numeric(14,2) not null default 0,
  metric text,
  scale jsonb not null default '[]'::jsonb,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period date not null unique,
  status text not null default 'draft',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.payroll_employees(id) on delete cascade,
  base_salary numeric(14,2) not null default 0,
  advance numeric(14,2) not null default 0,
  bonus_total numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  total_payout numeric(14,2) not null default 0,
  kpi_results jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);

create table if not exists public.brigade_rates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  work_name text not null,
  unit text not null default 'м²',
  crew_rate numeric(14,2) not null default 0,
  sell_from numeric(14,2),
  sell_to numeric(14,2),
  bonus_max numeric(14,2) not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.payroll_positions, public.payroll_employees,
  public.payroll_kpi_templates, public.payroll_periods, public.payroll_entries, public.brigade_rates to authenticated;
grant all on public.payroll_positions, public.payroll_employees, public.payroll_kpi_templates,
  public.payroll_periods, public.payroll_entries, public.brigade_rates to service_role;

alter table public.payroll_positions enable row level security;
alter table public.payroll_employees enable row level security;
alter table public.payroll_kpi_templates enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.brigade_rates enable row level security;

create policy "payroll positions finance" on public.payroll_positions for all to authenticated
  using (private.is_finance()) with check (private.is_finance());
create policy "payroll kpi finance" on public.payroll_kpi_templates for all to authenticated
  using (private.is_finance()) with check (private.is_finance());
create policy "payroll periods finance" on public.payroll_periods for all to authenticated
  using (private.is_finance()) with check (private.is_finance());
create policy "brigade rates read" on public.brigade_rates for select to authenticated using (true);
create policy "brigade rates write" on public.brigade_rates for all to authenticated
  using (private.is_finance()) with check (private.is_finance());

create policy "payroll employees read" on public.payroll_employees for select to authenticated
  using (private.is_finance() or user_id = auth.uid());
create policy "payroll employees write" on public.payroll_employees for all to authenticated
  using (private.is_finance()) with check (private.is_finance());

create policy "payroll entries read" on public.payroll_entries for select to authenticated
  using (private.is_finance() or exists (
    select 1 from public.payroll_employees e where e.id = payroll_entries.employee_id and e.user_id = auth.uid()));
create policy "payroll entries write" on public.payroll_entries for all to authenticated
  using (private.is_finance()) with check (private.is_finance());

-- 3. Seed from KPI document
insert into public.payroll_positions (title, code, base_salary, target_bonus, bonus_percent, notes) values
  ('Виконавчий директор','exec_director',60000,57000,null,'Бонус: валова маржа 50%, план продажів 30%, конверсія 15%, впровадження системи фікс 10 000'),
  ('Помічник виконавчого директора','exec_assistant',30000,13000,null,'KPI: контроль доручень 5 000, CRM і документи 5 000, звітність 3 000'),
  ('Фінансист','finance',35000,14000,null,'KPI: дебіторка 5 000, weekly report 4 000, місячна звітність 5 000 (+5 000 впровадження FinMAP)'),
  ('Менеджер з продажу','sales_manager',50000,37500,null,'План 2 500 000 грн, маржа 25%; KPI: маржа 50%, конверсія лід→договір 25%, нові клієнти 25%'),
  ('Бригадир 1','foreman_1',25000,0,30,'Бонус 30% від валового прибутку закритого обʼєкта'),
  ('Бригадир 2','foreman_2',25000,0,30,'Бонус 30% від валового прибутку закритого обʼєкта'),
  ('Водій','driver',35000,0,null,null)
on conflict (code) do nothing;

insert into public.payroll_kpi_templates (position_id, code, title, weight_percent, max_bonus, scale, description, sort_order)
select p.id, v.code, v.title, v.weight, v.max_bonus, v.scale::jsonb, v.descr, v.ord
from (values
  ('exec_director','ed_margin','Валова маржа компанії',50,20000,'[{"label":"до 500 тис","bonus":0},{"label":"500–600 тис","bonus":10000},{"label":"600 тис – 1 млн","bonus":15000},{"label":"понад 1 млн","bonus":20000}]','Відповідальність за прибутковість замовлень',1),
  ('exec_director','ed_plan','Виконання плану продажів',30,20000,'[{"label":"менше 90%","bonus":0},{"label":"90–99%","bonus":10000},{"label":"100%","bonus":15000},{"label":"понад 100%","bonus":20000}]','',2),
  ('exec_director','ed_conv','Конверсія продажів',15,7000,'[{"label":"менше 80%","bonus":0},{"label":"80–99%","bonus":3000},{"label":"100–109%","bonus":5000},{"label":"понад 110%","bonus":7000}]','Лід → замір → кошторис → договір',3),
  ('exec_director','ed_system','Впровадження системи (період трансформації)',5,10000,'[{"label":"фікс","bonus":10000}]','CRM, регламенти, звіти, структура відділу, стандарти кошторисів',4),
  ('finance','fin_ar','Дебіторська заборгованість',20,5000,'[{"label":"виконано","bonus":5000}]','Weekly AR-звіт без пропусків, підсвітка відхилень і ризиків',1),
  ('finance','fin_weekly','Weekly report і комунікація',40,4000,'[{"label":"виконано","bonus":4000}]','Щотижневий звіт за шаблоном, структуровані коментарі',2),
  ('finance','fin_month','Місячна звітність',40,5000,'[{"label":"виконано","bonus":5000}]','Закриття місяця в строк, дашборд, факт/план + висновки',3),
  ('finance','fin_system','Впровадження FinMAP (тимчасовий)',0,5000,'[{"label":"фікс","bonus":5000}]','Налаштування FinMAP, регламенти команди і контроль',4),
  ('sales_manager','sm_margin','Валова маржа особистого плану',50,12500,'[{"label":"до 80% плану","bonus":0},{"label":"80–99%","bonus":6000},{"label":"100–119%","bonus":10000},{"label":"120%+","bonus":12500}]','Особистий план 2 500 000 грн, маржа 625 000 грн',1),
  ('sales_manager','sm_conv','Конверсія лід → договір',25,6250,'[{"label":"менше 15%","bonus":0},{"label":"15–18%","bonus":3000},{"label":"18%+","bonus":6250}]','Норматив не менше 18%',2),
  ('sales_manager','sm_new','Залучення нових клієнтів',25,6250,'[{"label":"0–2","bonus":0},{"label":"3 клієнти","bonus":3125},{"label":"5 клієнтів","bonus":6250},{"label":"6 і більше","bonus":7500}]','Новий клієнт: договір + передоплата, не купував 12 місяців',3),
  ('exec_assistant','ea_tasks','Контроль доручень і строків',40,5000,'[{"label":"95%+ у строк","bonus":5000}]','Не менше 95% доручень закриті в строк, немає загублених задач',1),
  ('exec_assistant','ea_crm','CRM і документи',40,5000,'[{"label":"95%+ актуальні","bonus":5000}]','95% обʼєктів мають актуальний статус, 100% договорів і КП завантажені',2),
  ('exec_assistant','ea_report','Звітність і операційна дисципліна',20,3000,'[{"label":"виконано","bonus":3000}]','Щоденний і щотижневий звіт вчасно, не більше одного зауваження',3),
  ('foreman_1','fm_profit','Бонус від валового прибутку обʼєкта',100,0,'[{"label":"30% валового прибутку закритого обʼєкта","bonus":0}]','Виплата після повного закриття обʼєкта',1),
  ('foreman_2','fm_profit','Бонус від валового прибутку обʼєкта',100,0,'[{"label":"30% валового прибутку закритого обʼєкта","bonus":0}]','Виплата після повного закриття обʼєкта',1)
) as v(pcode, code, title, weight, max_bonus, scale, descr, ord)
join public.payroll_positions p on p.code = v.pcode
where not exists (select 1 from public.payroll_kpi_templates t where t.position_id = p.id and t.code = v.code);

insert into public.brigade_rates (category, work_name, unit, crew_rate, sell_from, sell_to, bonus_max, sort_order)
select * from (values
  ('Стяжка','Напівсуха стяжка до 70 мм','м²',90,180,null,10,1),
  ('Стяжка','Кожен додатковий 1 см понад 70 мм','м²',5,null,null,0,2),
  ('Стяжка','Промисловий підлога','м²',100,null,null,10,3),
  ('Стяжка','Малі обʼєкти до 70 м²','м²',100,null,null,10,4),
  ('Стяжка','Малі обʼєкти до 50 м²','м²',110,null,null,10,5),
  ('Штукатурка','Стандартна штукатурка','м²',100,240,null,10,6),
  ('Штукатурка','Складна геометрія','м²',110,240,null,10,7),
  ('Штукатурка','Стелі','м²',120,240,null,10,8),
  ('Покрівля ПВХ','Проста покрівля','м²',60,435,899,10,9),
  ('Покрівля ПВХ','Середня складність','м²',70,435,899,10,10),
  ('Покрівля ПВХ','Висока складність','м²',80,435,899,10,11),
  ('Покрівля рулонна','Рулонна покрівля (1 шар)','м²',50,280,320,10,12),
  ('Покрівля рулонна','Рулонна покрівля (2 шари)','м²',60,330,380,10,13),
  ('Покрівля рулонна','Рулонна покрівля (3 шари)','м²',70,390,450,10,14),
  ('Натяжні стелі','Стандартна стеля','м²',110,499,null,0,15),
  ('Натяжні стелі','Тіньовий профіль','м²',130,499,null,0,16),
  ('Натяжні стелі','Ширяюча стеля','м²',140,499,null,0,17),
  ('Натяжні стелі','Багаторівнева стеля','м²',160,499,null,0,18)
) as v(category, work_name, unit, crew_rate, sell_from, sell_to, bonus_max, sort_order)
where not exists (select 1 from public.brigade_rates b where b.work_name = v.work_name);
