
CREATE TYPE public.snapshot_kind AS ENUM ('approved', 'production');

CREATE TABLE public.estimate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  snapshot_kind public.snapshot_kind NOT NULL DEFAULT 'approved',
  snapshot jsonb NOT NULL,
  engine_version text,
  price_book_version integer,
  approved_by uuid REFERENCES auth.users(id),
  approved_by_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estimate_id, version_no)
);

CREATE INDEX estimate_versions_estimate_id_idx ON public.estimate_versions(estimate_id);

GRANT SELECT, INSERT ON public.estimate_versions TO authenticated;
GRANT ALL ON public.estimate_versions TO service_role;

ALTER TABLE public.estimate_versions ENABLE ROW LEVEL SECURITY;

-- Read: якщо користувач бачить сам кошторис (є в estimates → RLS кошторису це вирішує)
CREATE POLICY "versions_select_via_estimate"
ON public.estimate_versions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id));

-- Insert: той хто може оновити кошторис
CREATE POLICY "versions_insert_via_estimate"
ON public.estimate_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id));

-- UPDATE/DELETE: заборонено (немає policies)

ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS client_view_mode text NOT NULL DEFAULT 'detailed';
