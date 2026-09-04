UPDATE public.crm_calls
SET recording_url = NULL
WHERE recording_url IS NOT NULL AND recording_url ILIKE '%X-Amz-%';

UPDATE public.crm_calls
SET recording_available = true
WHERE external_source = 'binotel'
  AND COALESCE(duration_sec, 0) > 0
  AND COALESCE(is_missed, false) = false
  AND COALESCE(recording_available, false) = false;