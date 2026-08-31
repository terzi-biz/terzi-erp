UPDATE public.orders o
SET source = COALESCE(s.payload->>'name', s.payload->>'title')
FROM integration_sync_links l
JOIN integration_sync_links s
  ON s.entity = 'sources' AND s.external_id = l.payload->>'source_id'
WHERE l.entity = 'orders'
  AND l.internal_id = o.id::text
  AND o.source = 'keyCRM'
  AND COALESCE(s.payload->>'name', s.payload->>'title') IS NOT NULL;