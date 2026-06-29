DROP POLICY "Authenticated can update bookings" ON public.crew_bookings;
DROP POLICY "Authenticated can delete bookings" ON public.crew_bookings;
CREATE POLICY "Author or admin can update bookings" ON public.crew_bookings
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin can delete bookings" ON public.crew_bookings
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));