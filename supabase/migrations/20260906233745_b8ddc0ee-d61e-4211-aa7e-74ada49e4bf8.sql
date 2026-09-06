ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'planned';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'canceled';
ALTER TYPE public.object_measurement_status ADD VALUE IF NOT EXISTS 'rescheduled';