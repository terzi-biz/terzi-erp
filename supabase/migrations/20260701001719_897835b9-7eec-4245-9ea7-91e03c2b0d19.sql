-- ============ directions ============
CREATE TABLE public.directions (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.directions TO authenticated;
GRANT ALL ON public.directions TO service_role;
ALTER TABLE public.directions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "directions read auth" ON public.directions FOR SELECT TO authenticated USING (true);
CREATE POLICY "directions admin write" ON public.directions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ input_fields ============
CREATE TABLE public.input_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'number',
  unit text,
  required boolean NOT NULL DEFAULT false,
  default_value jsonb,
  enum_values jsonb,
  validation_rules jsonb,
  affects_formula boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  help_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, field_key)
);
GRANT SELECT ON public.input_fields TO authenticated;
GRANT ALL ON public.input_fields TO service_role;
ALTER TABLE public.input_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "input_fields read auth" ON public.input_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "input_fields admin write" ON public.input_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ material_items ============
CREATE TABLE public.material_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  category text,
  unit text NOT NULL,
  cost_price numeric(14,4) NOT NULL DEFAULT 0,
  sale_coef_key text,
  consumption_formula text,
  supplier text,
  source_ref text,
  is_optional boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, code)
);
GRANT SELECT ON public.material_items TO authenticated;
GRANT ALL ON public.material_items TO service_role;
ALTER TABLE public.material_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_items read auth" ON public.material_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_items admin write" ON public.material_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ work_items ============
CREATE TABLE public.work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  section text,
  unit text NOT NULL,
  cost_price numeric(14,4) NOT NULL DEFAULT 0,
  sale_coef_key text,
  quantity_formula text,
  is_optional boolean NOT NULL DEFAULT false,
  is_client_visible boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, code)
);
GRANT SELECT ON public.work_items TO authenticated;
GRANT ALL ON public.work_items TO service_role;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_items read auth" ON public.work_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_items admin write" ON public.work_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ logistics_items ============
CREATE TABLE public.logistics_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  unit text NOT NULL,
  cost_price numeric(14,4) NOT NULL DEFAULT 0,
  sale_coef_key text,
  quantity_formula text,
  conditions jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, code)
);
GRANT SELECT ON public.logistics_items TO authenticated;
GRANT ALL ON public.logistics_items TO service_role;
ALTER TABLE public.logistics_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logistics_items read auth" ON public.logistics_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "logistics_items admin write" ON public.logistics_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ additional_services ============
CREATE TABLE public.additional_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  unit text NOT NULL,
  cost_price numeric(14,4) NOT NULL DEFAULT 0,
  sale_coef_key text,
  quantity_formula text,
  conditions jsonb,
  is_client_visible boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, code)
);
GRANT SELECT ON public.additional_services TO authenticated;
GRANT ALL ON public.additional_services TO service_role;
ALTER TABLE public.additional_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "additional_services read auth" ON public.additional_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "additional_services admin write" ON public.additional_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ coefficients ============
CREATE TABLE public.coefficients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  coef_group text NOT NULL,
  coef_key text NOT NULL,
  value numeric(14,6) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, coef_key)
);
GRANT SELECT ON public.coefficients TO authenticated;
GRANT ALL ON public.coefficients TO service_role;
ALTER TABLE public.coefficients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coefficients read auth" ON public.coefficients FOR SELECT TO authenticated USING (true);
CREATE POLICY "coefficients admin write" ON public.coefficients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ formulas ============
CREATE TABLE public.formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  formula_key text NOT NULL,
  expression text NOT NULL,
  output_unit text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, formula_key)
);
GRANT SELECT ON public.formulas TO authenticated;
GRANT ALL ON public.formulas TO service_role;
ALTER TABLE public.formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formulas read auth" ON public.formulas FOR SELECT TO authenticated USING (true);
CREATE POLICY "formulas admin write" ON public.formulas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ estimate_sections ============
CREATE TABLE public.estimate_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  client_visible boolean NOT NULL DEFAULT true,
  internal_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(direction_id, section_key)
);
GRANT SELECT ON public.estimate_sections TO authenticated;
GRANT ALL ON public.estimate_sections TO service_role;
ALTER TABLE public.estimate_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_sections read auth" ON public.estimate_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimate_sections admin write" ON public.estimate_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ price_history ============
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind text NOT NULL, -- material | work | logistics | additional
  item_id uuid NOT NULL,
  direction_id text,
  field text NOT NULL, -- cost_price | sale_price ...
  old_value numeric(14,4),
  new_value numeric(14,4),
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_history admin read" ON public.price_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- writes only via service_role

-- ============ estimates extension ============
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS direction_id text REFERENCES public.directions(id),
  ADD COLUMN IF NOT EXISTS calculation_json jsonb,
  ADD COLUMN IF NOT EXISTS client_lines jsonb,
  ADD COLUMN IF NOT EXISTS internal_lines jsonb,
  ADD COLUMN IF NOT EXISTS price_book_version int,
  ADD COLUMN IF NOT EXISTS engine_version text;

-- ============ updated_at triggers ============
CREATE TRIGGER trg_directions_updated BEFORE UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_input_fields_updated BEFORE UPDATE ON public.input_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_material_items_updated BEFORE UPDATE ON public.material_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_items_updated BEFORE UPDATE ON public.work_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_logistics_items_updated BEFORE UPDATE ON public.logistics_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_additional_services_updated BEFORE UPDATE ON public.additional_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coefficients_updated BEFORE UPDATE ON public.coefficients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_formulas_updated BEFORE UPDATE ON public.formulas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_estimate_sections_updated BEFORE UPDATE ON public.estimate_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED: direction pvc_membrane ============
INSERT INTO public.directions(id, name, category, description) VALUES
  ('pvc_membrane', 'Гідроізоляція ПВХ-мембраною', 'roofing', 'Sikaplan SPL G-15, парапети, воронки, аератори, капельник');

-- coefficients (from 07_Коэф + 01_Калькулятор defaults)
INSERT INTO public.coefficients(direction_id, coef_group, coef_key, value, description) VALUES
  ('pvc_membrane','sale','K_material',1.15,'Коефіцієнт продажу матеріалів'),
  ('pvc_membrane','sale','K_works',2.0,'Коефіцієнт продажу робіт (x до ставки бригади)'),
  ('pvc_membrane','sale','K_transport',1.0,'Коефіцієнт продажу транспорту/доп (1 = без маржі)'),
  ('pvc_membrane','reserve','K_reserve',0.05,'Резерв / непередбачені, частка від клієнтської суми'),
  ('pvc_membrane','stock','K_MEM',1.10,'Запас ПВХ мембрани'),
  ('pvc_membrane','stock','K_GEO',1.05,'Запас геотекстилю'),
  ('pvc_membrane','stock','K_CORNER',2.0,'Додаток до довжини ПВХ-уголка, м.п.'),
  ('pvc_membrane','stock','K_PLANK',2.0,'Додаток до довжини прижимної планки, м.п.'),
  ('pvc_membrane','stock','K_DRIP',2.0,'Додаток до довжини капельника, м.п.'),
  ('pvc_membrane','stock','K_METAL',1.15,'Запас ПВХ-металу'),
  ('pvc_membrane','norm','SEALANT_PER_MP',16.0,'М.п. планки на 1 тубу герметика'),
  ('pvc_membrane','norm','RONDOL_PER_M2',6.0,'Тарілок/рондолей на 1 м² покрівлі'),
  ('pvc_membrane','norm','FIX_PER_MP',3.0,'Крепежу на 1 м.п. по периметру елементів'),
  ('pvc_membrane','norm','MIN_DRILLS',2.0,'Мін. кількість бурів'),
  ('pvc_membrane','norm','MIN_BITS',5.0,'Мін. кількість насадок'),
  ('pvc_membrane','norm','CONSUM_PER_M2',150.0,'м² кровлі на 1 комплект дрібних розхідників');

-- input fields
INSERT INTO public.input_fields(direction_id, field_key, label, type, unit, required, default_value, sort_order, help_text) VALUES
  ('pvc_membrane','area_m2','Площа горизонтальної покрівлі','number','м²',true,'200',10,'Ручний ввід'),
  ('pvc_membrane','perimeter_m','Довжина парапетів / примикань','number','м.п.',true,'135',20,NULL),
  ('pvc_membrane','h_parapet','Висота заведення на парапет','number','м',true,'0.3',30,NULL),
  ('pvc_membrane','w_horizontal','Ширина горизонтального заведення','number','м',true,'0.07',40,'Стандарт 0.07'),
  ('pvc_membrane','geo_on_parapet','Геотекстиль на парапетах','number','0/1',false,'0',50,'1=так, 0=ні'),
  ('pvc_membrane','corner_length','Довжина ПВХ-уголка','number','м.п.',false,'135',60,NULL),
  ('pvc_membrane','plank_length','Довжина прижимної планки','number','м.п.',false,'135',70,NULL),
  ('pvc_membrane','drip_length','Довжина капельника','number','м.п.',false,'0',80,'0 = не потрібен'),
  ('pvc_membrane','drip_width','Ширина заготовки капельника','number','м',false,'0.2',90,NULL),
  ('pvc_membrane','scupper_75_qty','Воронки S-Scupper 75','number','шт',false,'0',100,NULL),
  ('pvc_membrane','scupper_110_qty','Воронки S-Scupper 110','number','шт',false,'0',110,NULL),
  ('pvc_membrane','gully_160_qty','Воронки S-Gully 160','number','шт',false,'2',120,NULL),
  ('pvc_membrane','drain_90_qty','Воронки S-Drain 90','number','шт',false,'0',130,NULL),
  ('pvc_membrane','aerator_qty','Аератори / флюгарки','number','шт',false,'0',140,NULL),
  ('pvc_membrane','other_penetrations','Інші проходки / вузли','number','шт',false,'0',150,NULL),
  ('pvc_membrane','new_drain_holes','Нові отвори під воронки','number','шт',false,'0',160,'Для допробіт'),
  ('pvc_membrane','delivery_trips','Доставка матеріалів','number','рейс',false,'1',170,NULL),
  ('pvc_membrane','delivery_price','Ціна доставки','number','грн/рейс',false,'1800',180,NULL),
  ('pvc_membrane','crane_shifts','Кран / маніпулятор','number','зміна',false,'0.5',190,NULL),
  ('pvc_membrane','crane_price','Ціна крану','number','грн/зміна',false,'8800',200,NULL),
  ('pvc_membrane','unload_services','Загрузка/розвантаження','number','послуга',false,'1',210,NULL),
  ('pvc_membrane','unload_price','Ціна розвантаження','number','грн/послуга',false,'1300',220,NULL),
  ('pvc_membrane','intercity_km','Км за містом','number','км',false,'0',230,NULL),
  ('pvc_membrane','intercity_rate','Ставка за км','number','грн/км',false,'0',240,NULL);

-- estimate sections
INSERT INTO public.estimate_sections(direction_id, section_key, section_name, sort_order, client_visible, internal_visible) VALUES
  ('pvc_membrane','materials','Матеріали',10,true,true),
  ('pvc_membrane','works','Роботи',20,true,true),
  ('pvc_membrane','logistics','Транспорт та логістика',30,true,true),
  ('pvc_membrane','additional','Додаткові роботи',40,true,true);

-- material items (from 02_Материалы + 05_БазаМат, cost = закупка)
INSERT INTO public.material_items(direction_id, code, name, category, unit, cost_price, sale_coef_key, consumption_formula, supplier, source_ref, sort_order) VALUES
  ('pvc_membrane','M001','Нетканий геотекстиль LB geotex PP200','Геотекстиль','м²',44.00,'K_material','ROUNDUP((inputs.area_m2 + (inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal))*inputs.geo_on_parapet) * coef.K_GEO, 0)','Лебер','КП Лебер 04.05.2026 стр.1',10),
  ('pvc_membrane','M002','ПВХ мембрана Sikaplan SPL G-15','Мембрана','м²',359.00,'K_material','ROUNDUP((inputs.area_m2 + inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal)) * coef.K_MEM, 0)','Лебер','КП Лебер 04.05.2026 стр.1',20),
  ('pvc_membrane','M003','Sikaplan D-15 неармована','Мембрана неарм.','м²',520.00,'K_material','MAX(0.5, inputs.scupper_75_qty*0.25 + inputs.scupper_110_qty*0.25 + inputs.gully_160_qty*0.25 + inputs.drain_90_qty*0.25 + inputs.aerator_qty*0.2 + inputs.other_penetrations*0.25)','Лебер','КП Лебер 04.05.2026 стр.1',30),
  ('pvc_membrane','M004','ПВХ-метал RAL 7047','ПВХ-метал','м²',1400.00,'K_material','IF(inputs.drip_length>0, ROUNDUP((inputs.drip_length+coef.K_DRIP)*inputs.drip_width*coef.K_METAL, 1), 0)','Лебер','КП Лебер 04.05.2026 стр.1',40),
  ('pvc_membrane','M005','Sikaflex-11FC Purform 600 мл','Герметик','шт',397.00,'K_material','ROUNDUP((inputs.plank_length+coef.K_PLANK)/coef.SEALANT_PER_MP, 0)','Лебер','КП Лебер 04.05.2026 стр.1',50),
  ('pvc_membrane','M006','S-Scupper PVC 75 мм','Воронка','шт',2000.00,'K_material','inputs.scupper_75_qty','Лебер','КП Лебер 04.05.2026 стр.1',60),
  ('pvc_membrane','M007','S-Scupper PVC 110 мм','Воронка','шт',2109.60,'K_material','inputs.scupper_110_qty','Лебер','КП Лебер 04.05.2026 стр.1',70),
  ('pvc_membrane','M008','S-Gully PVC 160 мм','Воронка','шт',2790.00,'K_material','inputs.gully_160_qty','Лебер','КП Лебер 04.05.2026 стр.1',80),
  ('pvc_membrane','M009','S-Drain PVC 90 мм','Воронка','шт',2135.00,'K_material','inputs.drain_90_qty','Лебер','КП Лебер 04.05.2026 стр.1',90),
  ('pvc_membrane','M010','Флюгарка PVC d75 h240','Флюгарка','шт',730.00,'K_material','inputs.aerator_qty','Лебер','КП Лебер 04.05.2026 стр.1',100),
  ('pvc_membrane','M012','Дюбель АХК 8х60','Крепіж','шт',1.05,'K_material','ROUNDUP(inputs.area_m2*coef.RONDOL_PER_M2 + ((inputs.corner_length+coef.K_CORNER)+(inputs.plank_length+coef.K_PLANK)+IF(inputs.drip_length>0,inputs.drip_length+coef.K_DRIP,0))*coef.FIX_PER_MP, 0)','Лебер','КП Лебер 04.05.2026 стр.1',110),
  ('pvc_membrane','M014','Шуруп 5,0х70','Крепіж','стошт',101.10,'K_material','ROUNDUP((ROUNDUP(inputs.area_m2*coef.RONDOL_PER_M2 + ((inputs.corner_length+coef.K_CORNER)+(inputs.plank_length+coef.K_PLANK)+IF(inputs.drip_length>0,inputs.drip_length+coef.K_DRIP,0))*coef.FIX_PER_MP, 0))/100, 0)','Лебер','КП Лебер 04.05.2026 стр.1',120),
  ('pvc_membrane','M016','Тарілка дожимна 50х5','Рондоль','стошт',340.20,'K_material','ROUNDUP(inputs.area_m2*coef.RONDOL_PER_M2/100, 0)','Лебер','КП Лебер 04.05.2026 стр.1',130),
  ('pvc_membrane','M017','Свердло SDS PLUS 8,0x160','Бур','шт',50.16,'K_material','MAX(coef.MIN_DRILLS, ROUNDUP((ROUNDUP(inputs.area_m2*coef.RONDOL_PER_M2 + ((inputs.corner_length+coef.K_CORNER)+(inputs.plank_length+coef.K_PLANK)+IF(inputs.drip_length>0,inputs.drip_length+coef.K_DRIP,0))*coef.FIX_PER_MP, 0))/100, 0))','Лебер','КП Лебер 04.05.2026 стр.1',140),
  ('pvc_membrane','M021','Диски (набір розхідників)','Диск','шт',0.00,'K_material','MAX(coef.MIN_BITS, ROUNDUP(inputs.area_m2/150, 0))','Лебер','КП Лебер 04.05.2026 стр.1',150),
  ('pvc_membrane','M999','Комплект дрібних розхідників','Розхідники','компл.',0.00,'K_material','MAX(1, ROUNDUP((inputs.area_m2 + inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal))/coef.CONSUM_PER_M2, 0))','Лебер','КП Лебер 04.05.2026 стр.1',160);

-- work items (from 03_Работы, cost = ставка бригади)
INSERT INTO public.work_items(direction_id, code, name, section, unit, cost_price, sale_coef_key, quantity_formula, sort_order) VALUES
  ('pvc_membrane','W001','Підготовка поверхні','works','м²',20.00,'K_works','inputs.area_m2',10),
  ('pvc_membrane','W002','Монтаж геотекстилю','works','м²',20.00,'K_works','ROUNDUP((inputs.area_m2 + (inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal))*inputs.geo_on_parapet) * coef.K_GEO, 0)',20),
  ('pvc_membrane','W003','Монтаж та обпайка воронки','works','шт',750.00,'K_works','inputs.scupper_75_qty + inputs.scupper_110_qty + inputs.gully_160_qty + inputs.drain_90_qty',30),
  ('pvc_membrane','W004','Монтаж та обпайка аератора','works','шт',550.00,'K_works','inputs.aerator_qty',40),
  ('pvc_membrane','W005','Монтаж ПВХ мембрани','works','м²',160.00,'K_works','inputs.area_m2',50),
  ('pvc_membrane','W006','Монтаж ПВХ мембрани на парапет/примикання','works','м.п.',100.00,'K_works','inputs.perimeter_m',60),
  ('pvc_membrane','W007','Монтаж ПВХ капельника','works','м.п.',100.00,'K_works','IF(inputs.drip_length>0, inputs.drip_length+coef.K_DRIP, 0)',70);

-- logistics items
INSERT INTO public.logistics_items(direction_id, code, name, unit, cost_price, sale_coef_key, quantity_formula, sort_order) VALUES
  ('pvc_membrane','L001','Доставка матеріалів','рейс',0.00,'K_transport','inputs.delivery_trips * inputs.delivery_price',10),
  ('pvc_membrane','L002','Кран / маніпулятор','зміна',0.00,'K_transport','inputs.crane_shifts * inputs.crane_price',20),
  ('pvc_membrane','L003','Загрузка / розвантаження','послуга',0.00,'K_transport','inputs.unload_services * inputs.unload_price',30),
  ('pvc_membrane','L004','Міжміський/додатковий кілометраж','км',0.00,'K_transport','inputs.intercity_km * inputs.intercity_rate',40);

-- additional services
INSERT INTO public.additional_services(direction_id, code, name, unit, cost_price, sale_coef_key, quantity_formula, sort_order) VALUES
  ('pvc_membrane','A001','Свердління нових отворів під воронки','шт',0.00,'K_transport','inputs.new_drain_holes',10);

-- formulas registry (для UI підказок)
INSERT INTO public.formulas(direction_id, formula_key, expression, output_unit, description) VALUES
  ('pvc_membrane','parapet_area','inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal)','м²','Площа парапетів'),
  ('pvc_membrane','total_hydro_area','inputs.area_m2 + inputs.perimeter_m*(inputs.h_parapet+inputs.w_horizontal)','м²','Загальна площа гідроізоляції');