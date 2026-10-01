# Інтеграції

- Патерн: Integration Core → Provider Adapter → Event → Mapping → Action → Log; черга/ідемпотентність — `integration_events` + `claim_integration_event()`. Вебхуки перевіряють підпис/токен ДО обробки. Деталі — `docs/INTEGRATIONS.md`.
- Ключі з «Налаштування → Інтеграції» шифруються AES-GCM у `integration_credentials` (лише service_role); request-middleware підставляє їх у `process.env`, секрети середовища мають пріоритет — адаптери читають `process.env` без змін.
