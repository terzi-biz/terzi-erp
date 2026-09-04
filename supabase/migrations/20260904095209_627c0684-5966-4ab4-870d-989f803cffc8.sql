-- ============ 1. stock_items: additive columns for family/variant card ============
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS family_key text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS origin_external_key text,
  ADD COLUMN IF NOT EXISTS source_ref jsonb;

CREATE INDEX IF NOT EXISTS stock_items_family_idx ON public.stock_items (family_key);
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_origin_external_key_uidx
  ON public.stock_items (origin_external_key) WHERE origin_external_key IS NOT NULL;

-- ============ 2. stock_item_attributes ============
CREATE TABLE public.stock_item_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  data_type text NOT NULL DEFAULT 'number',
  numeric_value numeric,
  min_value numeric,
  max_value numeric,
  text_value text,
  unit text,
  source_text text,
  verification_status text NOT NULL DEFAULT 'unknown',
  source_ref jsonb,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, attribute_key),
  CONSTRAINT stock_item_attributes_type_chk CHECK (data_type IN ('number','range','text')),
  CONSTRAINT stock_item_attributes_shape_chk CHECK (
    (data_type = 'number' AND min_value IS NULL AND max_value IS NULL)
    OR (data_type = 'range' AND numeric_value IS NULL)
    OR (data_type = 'text')
  ),
  CONSTRAINT stock_item_attributes_range_chk CHECK (
    min_value IS NULL OR max_value IS NULL OR max_value >= min_value
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_attributes TO authenticated;
GRANT ALL ON public.stock_item_attributes TO service_role;
ALTER TABLE public.stock_item_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock item attributes read" ON public.stock_item_attributes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock item attributes write" ON public.stock_item_attributes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

-- ============ 3. stock_item_pack_units ============
CREATE TABLE public.stock_item_pack_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_label text NOT NULL,
  base_qty_per_pack numeric(18,6) NOT NULL,
  barcode text,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  verification_status text NOT NULL DEFAULT 'unknown',
  source_text text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, unit_label, valid_from),
  CONSTRAINT stock_item_pack_units_qty_chk CHECK (base_qty_per_pack > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_pack_units TO authenticated;
GRANT ALL ON public.stock_item_pack_units TO service_role;
ALTER TABLE public.stock_item_pack_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock item pack units read" ON public.stock_item_pack_units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock item pack units write" ON public.stock_item_pack_units
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

-- ============ 4. stock_item_applications ============
CREATE TABLE public.stock_item_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  module text NOT NULL,
  link_type text NOT NULL DEFAULT 'catalog',
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  material_item_id uuid REFERENCES public.material_items(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, module),
  CONSTRAINT stock_item_applications_link_chk CHECK (link_type IN ('catalog','material','none'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_applications TO authenticated;
GRANT ALL ON public.stock_item_applications TO service_role;
ALTER TABLE public.stock_item_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock item applications read" ON public.stock_item_applications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock item applications write" ON public.stock_item_applications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

-- ============ 5. warehouse_import_runs ============
CREATE TABLE public.warehouse_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id text NOT NULL,
  schema_version text NOT NULL,
  file_sha256 text NOT NULL,
  source_commit text,
  source_name text,
  status text NOT NULL DEFAULT 'staged',
  production_import_allowed boolean NOT NULL DEFAULT false,
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, file_sha256),
  CONSTRAINT warehouse_import_runs_status_chk
    CHECK (status IN ('staged','needs_review','verified','closed','excluded'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_import_runs TO authenticated;
GRANT ALL ON public.warehouse_import_runs TO service_role;
ALTER TABLE public.warehouse_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse import runs finance only" ON public.warehouse_import_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));

-- ============ 6. warehouse_import_rows ============
CREATE TABLE public.warehouse_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.warehouse_import_runs(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  external_key text NOT NULL,
  source_hash text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  conflict boolean NOT NULL DEFAULT false,
  raw_payload jsonb NOT NULL,
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_payload jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'needs_review',
  linked_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, external_key),
  CONSTRAINT warehouse_import_rows_kind_chk
    CHECK (source_kind IN ('requirement','supplier_product','legacy_row')),
  CONSTRAINT warehouse_import_rows_decision_chk
    CHECK (decision IN ('needs_review','verified','linked','created','excluded'))
);

CREATE INDEX IF NOT EXISTS warehouse_import_rows_run_idx ON public.warehouse_import_rows (run_id, source_kind, decision);
CREATE INDEX IF NOT EXISTS warehouse_import_rows_key_idx ON public.warehouse_import_rows (external_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_import_rows TO authenticated;
GRANT ALL ON public.warehouse_import_rows TO service_role;
ALTER TABLE public.warehouse_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse import rows finance only" ON public.warehouse_import_rows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));

-- ============ 7. updated_at triggers ============
CREATE TRIGGER update_stock_item_attributes_updated_at BEFORE UPDATE ON public.stock_item_attributes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_item_pack_units_updated_at BEFORE UPDATE ON public.stock_item_pack_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_item_applications_updated_at BEFORE UPDATE ON public.stock_item_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouse_import_runs_updated_at BEFORE UPDATE ON public.warehouse_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouse_import_rows_updated_at BEFORE UPDATE ON public.warehouse_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();