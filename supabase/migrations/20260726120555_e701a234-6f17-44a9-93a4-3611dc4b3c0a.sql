ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'other',
  category TEXT NOT NULL DEFAULT 'office',
  direction TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  priority TEXT NOT NULL DEFAULT 'normal',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  address TEXT,
  zone TEXT,
  client_name TEXT,
  area NUMERIC,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participants UUID[] NOT NULL DEFAULT '{}',
  crew_key TEXT,
  object_id UUID REFERENCES public.objects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  measurement_id UUID REFERENCES public.object_measurements(id) ON DELETE SET NULL,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.crew_bookings(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id UUID,
  reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read calendar events"
  ON public.calendar_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create calendar events"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owner responsible or admin can update calendar events"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = responsible_user_id OR auth.uid() = employee_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR auth.uid() = responsible_user_id OR auth.uid() = employee_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner or admin can delete calendar events"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS calendar_events_starts_at_idx ON public.calendar_events (starts_at);
CREATE INDEX IF NOT EXISTS calendar_events_employee_idx ON public.calendar_events (employee_id);
CREATE INDEX IF NOT EXISTS calendar_events_crew_idx ON public.calendar_events (crew_key);
CREATE INDEX IF NOT EXISTS calendar_events_object_idx ON public.calendar_events (object_id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_uniq
  ON public.calendar_events (source_type, source_id, event_type)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();