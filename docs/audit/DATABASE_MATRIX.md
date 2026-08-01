# DATABASE_MATRIX.md — інвентаризація схеми `public`

Джерело: read-only запити до `pg_class` / `pg_policies` / `pg_stat_user_tables` / `pg_index`, 01.08.2026.
64 таблиці, 0 view, 0 materialized view, 138 індексів, 53 тригери, 29 enum-типів, 33 міграції.
RLS увімкнено на **64/64** таблицях.

`Код` = кількість файлів у `src/` (без `types.ts`), що звертаються до таблиці.

| Таблиця | Рядків | RLS | Політик | Індексів | Код | Примітка |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| access_permissions | 276 | так | 1 | 2 | 0 | читається лише з SQL-функції `has_permission` |
| access_requests | 6 | так | 3 | 1 | 1 | |
| access_roles | 6 | так | 3 | 1 | 1 | друга система ролей |
| additional_services | 1 | так | 2 | 2 | **0** | **мертва** |
| archived_records | 0 | так | 3 | 1 | **0** | **мертва**, задумувалась як архів |
| audit_logs | 119 | так | 1 | 4 | 3 | |
| calendar_events | 17 | так | 4 | 6 | 2 | 7 FK без індексу |
| catalog_items | 192 | так | 2 | 2 | 1 | ядро прайсу |
| catalog_tier_margins | 4 | так | 4 | 2 | 1 | |
| client_groups | 10 | так | 2 | 2 | **0** | **мертва** |
| clients | 7 | так | 4 | 2 | 8 | |
| coefficients | 32 | так | 2 | 2 | 2 | |
| crew_bookings | 5 | так | 4 | 4 | 2 | |
| crm_calls | 1 | так | 4 | 2 | 2 | |
| crm_contacts | 1 | так | 4 | 4 | 4 | |
| crm_lead_activities | 20 | так | 2 | 2 | 1 | |
| crm_leads | 3 | так | 4 | 5 | 4 | |
| crm_pipelines | 6 | так | 4 | 2 | 3 | |
| crm_requests | 1 | так | 4 | 2 | 1 | |
| crm_stages | 71 | так | 4 | 2 | 3 | |
| crm_tasks | 1 | так | 4 | 3 | 2 | |
| directions | 3 | так | 2 | 1 | 1 | |
| estimate_audit_log | 40 | так | 2 | 2 | 1 | |
| estimate_sections | 4 | так | 2 | 2 | **0** | **мертва** (двигун `directions`) |
| estimate_versions | 3 | так | 3 | 3 | 1 | 51 кошторис — лише 3 версії |
| estimates | 51 | так | 4 | 7 | 15 | усі `client_id`/`object_id` = NULL |
| formulas | 2 | так | 2 | 2 | **0** | **мертва** (двигун `directions`) |
| input_fields | 48 | так | 2 | 2 | 2 | |
| integration_conflicts | 0 | так | 1 | 1 | 2 | |
| integration_event_logs | 677 | так | 1 | 2 | 2 | |
| integration_events | 2 | так | 2 | 4 | 2 | |
| integration_field_mappings | 2 | так | 1 | 1 | 1 | |
| integration_import_runs | 0 | так | 1 | 2 | 1 | імпорт keyCRM ще не виконувався |
| integration_line_map | 0 | так | 1 | 2 | 2 | |
| integration_oauth_states | 0 | так | **0** | 1 | 2 | RLS без політик (fail-closed) |
| integration_providers | 7 | так | 1 | 2 | 2 | |
| integration_rate_limits | 1 | так | 1 | 2 | 1 | |
| integration_secrets | 1 | так | 1 | 2 | 2 | |
| integration_sync_links | 274 | так | 1 | 3 | 1 | |
| integration_sync_settings | 12 | так | 1 | 2 | 2 | |
| integration_sync_state | 10 | так | 1 | 2 | 2 | |
| integration_tokens | 0 | так | **0** | 2 | 1 | RLS без політик (fail-closed) |
| integration_webhooks | 1 | так | 1 | 2 | 2 | |
| integrations | 2 | так | 4 | 2 | 8 | |
| logistics_items | 8 | так | 2 | 2 | 2 | |
| material_items | 32 | так | 2 | 2 | 2 | |
| notification_rules | 11 | так | 3 | 2 | 1 | |
| object_assignments | 0 | так | 2 | 1 | 2 | ключова для RLS `objects`, але порожня |
| object_comments | 1 | так | 4 | 1 | 1 | |
| object_files | 0 | так | 4 | 1 | 1 | **немає storage-бакета і upload-коду** |
| object_measurements | 2 | так | 2 | 1 | 1 | |
| object_services | 5 | так | 2 | 2 | 1 | |
| object_status_history | 9 | так | 2 | 1 | 1 | |
| object_zones | 0 | так | 2 | 1 | 1 | |
| objects | 5 | так | 5 | 4 | 5 | |
| price_history | 0 | так | 2 | 1 | **0** | **мертва** — вимога «зберігати історію цін» не реалізована |
| profiles | 6 | так | 3 | 2 | 6 | |
| registration_approvals | 6 | так | 2 | 2 | 3 | |
| role_permissions | 1656 | так | 4 | 2 | 2 | |
| user_access | 6 | так | 3 | 2 | 2 | |
| user_invitations | 0 | так | 3 | 2 | 1 | |
| user_permission_overrides | 0 | так | 4 | 2 | 2 | |
| user_roles | 8 | так | 5 | 2 | 3 | джерело для RLS |
| work_items | 14 | так | 2 | 2 | 2 | |

## Enum-типи (29)

Ключові: `app_role` = **admin, director, finance, manager**. Окремо існує таблиця `access_roles` зі значеннями **owner, ops_admin, sales_manager, surveyor, foreman, finance** — це різні набори (див. RLS_ROLE_MATRIX.md).

## Функції схеми `public` (12)

| Функція | SECURITY | search_path | EXECUTE для |
| --- | --- | --- | --- |
| can_manage_access(uuid) | DEFINER | public | authenticated, service_role |
| can_manage_object(uuid) | DEFINER | public | authenticated, service_role |
| can_view_object(uuid) | DEFINER | public | authenticated, service_role |
| crm_is_manager() | DEFINER | public | authenticated, service_role |
| has_permission(uuid,text,text) | DEFINER | public | authenticated, service_role |
| is_access_owner(uuid) | DEFINER | public | authenticated, service_role |
| handle_new_user() | DEFINER | public | лише service_role (тригер) |
| has_role(uuid, app_role) | INVOKER | public | authenticated, service_role |
| crm_normalize_phone(), log_object_status_change(), set_object_number(), update_updated_at_column() | INVOKER | public | тригерні |

Усі DEFINER-функції мають зафіксований `search_path=public` — це правильно.

## Індекси, яких бракує

46 зовнішніх ключів **не мають індексу по першій колонці**. Найгірші таблиці: `calendar_events` (7 FK без індексу), `crm_tasks` (4), `crm_leads` (4), `object_files` (3), `crm_calls` (2), `crm_requests` (2). Повний перелік — у DATABASE_AUDIT.md, розділ 4.
