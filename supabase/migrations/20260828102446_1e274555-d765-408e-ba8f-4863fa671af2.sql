-- Atomic claim for integration events (single source of truth in Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_events_provider_event
  ON public.integration_events (provider_key, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_events_payload_hash
  ON public.integration_events (provider_key, event_type, dedup_hash)
  WHERE provider_event_id IS NULL;

CREATE OR REPLACE FUNCTION public.claim_integration_event(
  p_event_id uuid DEFAULT NULL,
  p_integration_id uuid DEFAULT NULL,
  p_provider_key text DEFAULT NULL,
  p_direction text DEFAULT 'inbound',
  p_event_type text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_payload_hash text DEFAULT NULL,
  p_provider_event_id text DEFAULT NULL,
  p_event_ts timestamptz DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_replay_window_min integer DEFAULT 1440,
  p_stale_lock_seconds integer DEFAULT 600,
  p_claim boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
  v_source text;
  v_row public.integration_events;
  v_age interval;
BEGIN
  -- Path A: claim an already registered event for processing.
  IF p_event_id IS NOT NULL THEN
    UPDATE public.integration_events e
       SET status = 'processing', locked_at = now()
     WHERE e.id = p_event_id
       AND e.status <> 'done'
       AND NOT e.unsupported
       AND (e.status <> 'processing'
            OR e.locked_at IS NULL
            OR e.locked_at < now() - make_interval(secs => p_stale_lock_seconds))
     RETURNING * INTO v_row;

    IF FOUND THEN
      RETURN jsonb_build_object('status','claimed','event_id',v_row.id,
        'correlation_id',v_row.correlation_id,'attempt',v_row.attempt);
    END IF;

    SELECT * INTO v_row FROM public.integration_events WHERE id = p_event_id;
    IF v_row.id IS NULL THEN
      RETURN jsonb_build_object('status','missing');
    END IF;
    RETURN jsonb_build_object(
      'status', CASE WHEN v_row.status = 'done' THEN 'completed'
                     WHEN v_row.unsupported THEN 'unsupported'
                     ELSE 'already_processing' END,
      'event_id', v_row.id, 'correlation_id', v_row.correlation_id);
  END IF;

  -- Path B: register (or dedupe) an incoming event.
  IF p_provider_event_id IS NOT NULL AND p_provider_event_id <> '' THEN
    v_key := COALESCE(p_provider_key, p_integration_id::text, 'sys') || ':' || p_provider_event_id;
    v_source := 'provider_event_id';
  ELSIF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    v_key := p_idempotency_key;
    v_source := 'adapter_key';
  ELSE
    v_key := COALESCE(p_provider_key, p_integration_id::text, 'sys') || ':' || COALESCE(p_event_type,'') || ':' || COALESCE(p_payload_hash,'');
    v_source := 'payload_hash';
  END IF;

  SELECT * INTO v_row FROM public.integration_events WHERE idempotency_key = v_key;
  IF v_row.id IS NOT NULL THEN
    UPDATE public.integration_events
       SET duplicate_count = duplicate_count + 1
     WHERE id = v_row.id;
    RETURN jsonb_build_object('status','duplicate','event_id',v_row.id,
      'correlation_id',v_row.correlation_id,'duplicate_count',v_row.duplicate_count + 1,
      'idempotency_source',v_source);
  END IF;

  IF p_event_ts IS NOT NULL THEN
    v_age := now() - p_event_ts;
    IF v_age > make_interval(mins => p_replay_window_min) THEN
      RETURN jsonb_build_object('status','rejected_replay','reason','event older than window','idempotency_source',v_source);
    END IF;
    IF v_age < interval '-5 minutes' THEN
      RETURN jsonb_build_object('status','rejected_replay','reason','event timestamp in the future','idempotency_source',v_source);
    END IF;
  END IF;

  INSERT INTO public.integration_events (
    integration_id, provider_key, direction, event_type, payload,
    idempotency_key, dedup_hash, provider_event_id, event_ts,
    correlation_id, status, next_retry_at)
  VALUES (
    p_integration_id, p_provider_key, p_direction, p_event_type, COALESCE(p_payload,'{}'::jsonb),
    v_key, p_payload_hash, NULLIF(p_provider_event_id,''), p_event_ts,
    COALESCE(p_correlation_id, gen_random_uuid()), 'pending', now())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.integration_events WHERE idempotency_key = v_key;
    IF v_row.id IS NOT NULL THEN
      UPDATE public.integration_events SET duplicate_count = duplicate_count + 1 WHERE id = v_row.id;
      RETURN jsonb_build_object('status','duplicate','event_id',v_row.id,
        'correlation_id',v_row.correlation_id,'idempotency_source',v_source);
    END IF;
    RETURN jsonb_build_object('status','rejected','reason','insert conflict','idempotency_source',v_source);
  END IF;

  IF p_claim THEN
    UPDATE public.integration_events SET status = 'processing', locked_at = now() WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_claim THEN 'claimed' ELSE 'registered' END,
    'event_id', v_row.id, 'correlation_id', v_row.correlation_id, 'idempotency_source', v_source);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_integration_event(uuid,uuid,text,text,text,jsonb,text,text,timestamptz,uuid,text,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_event(uuid,uuid,text,text,text,jsonb,text,text,timestamptz,uuid,text,integer,integer,boolean) TO service_role;

-- No direct writes to the event journal from the browser.
REVOKE INSERT, UPDATE, DELETE ON public.integration_events FROM anon, authenticated;