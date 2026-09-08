GRANT INSERT, UPDATE ON public.finmap_sync_log TO authenticated;
GRANT INSERT, UPDATE ON public.finmap_sync_state TO authenticated;

CREATE POLICY "finmap_sync_log_write" ON public.finmap_sync_log
  FOR INSERT TO authenticated WITH CHECK (public.is_finance_user(auth.uid()));
CREATE POLICY "finmap_sync_log_update" ON public.finmap_sync_log
  FOR UPDATE TO authenticated USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));

CREATE POLICY "finmap_sync_state_write" ON public.finmap_sync_state
  FOR INSERT TO authenticated WITH CHECK (public.is_finance_user(auth.uid()));
CREATE POLICY "finmap_sync_state_update" ON public.finmap_sync_state
  FOR UPDATE TO authenticated USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));