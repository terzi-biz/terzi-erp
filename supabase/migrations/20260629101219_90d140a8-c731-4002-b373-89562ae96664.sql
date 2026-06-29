CREATE TABLE public.crew_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brigade_key text NOT NULL,
  brigade_label text NOT NULL,
  module text NOT NULL,
  date date NOT NULL,
  title text NOT NULL,
  client text,
  address text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_bookings TO authenticated;
GRANT ALL ON public.crew_bookings TO service_role;
ALTER TABLE public.crew_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bookings" ON public.crew_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert bookings" ON public.crew_bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated can update bookings" ON public.crew_bookings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete bookings" ON public.crew_bookings FOR DELETE TO authenticated USING (true);
CREATE INDEX crew_bookings_date_idx ON public.crew_bookings(date);
CREATE INDEX crew_bookings_brigade_idx ON public.crew_bookings(brigade_key);
CREATE TRIGGER update_crew_bookings_updated_at BEFORE UPDATE ON public.crew_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();