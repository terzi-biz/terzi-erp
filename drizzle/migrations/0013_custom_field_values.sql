CREATE TABLE public.custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('order','lead')),
  entity_id uuid NOT NULL,
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,47}$'),
  value jsonb,
  definition_version integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_key)
);
CREATE INDEX custom_field_values_entity_idx ON public.custom_field_values (entity_type, entity_id);
GRANT SELECT ON public.custom_field_values TO authenticated;
GRANT ALL ON public.custom_field_values TO service_role;
REVOKE ALL ON public.custom_field_values FROM anon;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Custom field values readable by entity viewers"
ON public.custom_field_values FOR SELECT TO authenticated
USING (
  private.can_manage_access(auth.uid())
  OR (entity_type = 'order' AND private.has_permission(auth.uid(), 'orders', 'view'))
  OR (entity_type = 'lead' AND private.has_permission(auth.uid(), 'leads', 'view'))
);
CREATE TRIGGER custom_field_values_updated_at BEFORE UPDATE ON public.custom_field_values
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.custom_field_values IS 'Control Plane Wave 2: values of admin-defined custom fields (definitions in config_entries kind=custom_field). Writes only via server functions.';