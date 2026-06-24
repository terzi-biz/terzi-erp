ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS schedule_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_days numeric,
  ADD COLUMN IF NOT EXISTS duration_override_days numeric,
  ADD COLUMN IF NOT EXISTS gcal_event_id text,
  ADD COLUMN IF NOT EXISTS gcal_calendar_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS gcal_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS estimates_schedule_start_idx ON public.estimates(schedule_start_at);
CREATE INDEX IF NOT EXISTS estimates_module_status_idx ON public.estimates(module, status);