-- 1) Trigger-only SECURITY DEFINER functions must not be callable from the API
REVOKE ALL ON FUNCTION public.sync_user_roles_from_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_object_manager_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) Integration tables: backend-only writes, explicit policies

-- binotel_call_sessions
REVOKE INSERT, UPDATE, DELETE ON public.binotel_call_sessions FROM anon, authenticated;
GRANT ALL ON public.binotel_call_sessions TO service_role;
DROP POLICY IF EXISTS binotel_sessions_no_insert ON public.binotel_call_sessions;
DROP POLICY IF EXISTS binotel_sessions_no_update ON public.binotel_call_sessions;
DROP POLICY IF EXISTS binotel_sessions_no_delete ON public.binotel_call_sessions;
CREATE POLICY binotel_sessions_no_insert ON public.binotel_call_sessions FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY binotel_sessions_no_update ON public.binotel_call_sessions FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY binotel_sessions_no_delete ON public.binotel_call_sessions FOR DELETE TO anon, authenticated USING (false);

-- integration_import_runs
REVOKE INSERT, UPDATE, DELETE ON public.integration_import_runs FROM anon, authenticated;
GRANT ALL ON public.integration_import_runs TO service_role;
DROP POLICY IF EXISTS import_runs_no_insert ON public.integration_import_runs;
DROP POLICY IF EXISTS import_runs_no_update ON public.integration_import_runs;
DROP POLICY IF EXISTS import_runs_no_delete ON public.integration_import_runs;
CREATE POLICY import_runs_no_insert ON public.integration_import_runs FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY import_runs_no_update ON public.integration_import_runs FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY import_runs_no_delete ON public.integration_import_runs FOR DELETE TO anon, authenticated USING (false);

-- integration_oauth_states (PKCE verifiers) - fully backend-only
REVOKE ALL ON public.integration_oauth_states FROM anon, authenticated;
GRANT ALL ON public.integration_oauth_states TO service_role;
DROP POLICY IF EXISTS oauth_states_deny_all ON public.integration_oauth_states;
CREATE POLICY oauth_states_deny_all ON public.integration_oauth_states FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- integration_tokens (OAuth access/refresh tokens) - fully backend-only
REVOKE ALL ON public.integration_tokens FROM anon, authenticated;
GRANT ALL ON public.integration_tokens TO service_role;
DROP POLICY IF EXISTS integration_tokens_deny_all ON public.integration_tokens;
CREATE POLICY integration_tokens_deny_all ON public.integration_tokens FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);