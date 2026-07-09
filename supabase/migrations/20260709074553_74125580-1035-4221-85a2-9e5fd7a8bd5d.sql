
-- Grant DML privileges to authenticated on directions-constructor tables (were SELECT-only).
GRANT INSERT, UPDATE, DELETE ON public.directions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.input_fields TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.material_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.work_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.logistics_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.additional_services TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coefficients TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.formulas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.estimate_sections TO authenticated;

-- Broaden write policies so managers (default role) can also edit the price-book / constructor.
DROP POLICY IF EXISTS "directions admin write" ON public.directions;
CREATE POLICY "directions staff write" ON public.directions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "input_fields admin write" ON public.input_fields;
CREATE POLICY "input_fields staff write" ON public.input_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "material_items admin write" ON public.material_items;
CREATE POLICY "material_items staff write" ON public.material_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "work_items admin write" ON public.work_items;
CREATE POLICY "work_items staff write" ON public.work_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "logistics_items admin write" ON public.logistics_items;
CREATE POLICY "logistics_items staff write" ON public.logistics_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "additional_services admin write" ON public.additional_services;
CREATE POLICY "additional_services staff write" ON public.additional_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "coefficients admin write" ON public.coefficients;
CREATE POLICY "coefficients staff write" ON public.coefficients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "formulas admin write" ON public.formulas;
CREATE POLICY "formulas staff write" ON public.formulas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "estimate_sections admin write" ON public.estimate_sections;
CREATE POLICY "estimate_sections staff write" ON public.estimate_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
