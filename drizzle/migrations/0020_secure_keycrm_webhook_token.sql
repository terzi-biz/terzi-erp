UPDATE public.integration_webhooks
   SET endpoint_token = encode(extensions.gen_random_bytes(32), 'hex'),
       signature_mode = 'token',
       signature_header = 'x-endpoint-token',
       updated_at = now()
 WHERE slug = 'keycrm-terzi-3'
   AND direction = 'inbound'
   AND signature_mode = 'none'
   AND endpoint_token IS NULL;