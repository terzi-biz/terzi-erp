# TERZI Control Plane — architecture audit and wave plan

Audit only. No code or data changes are part of this plan. Classifications come from the repository and schema as read. Items marked "verify" still need a runtime or data check in Wave 0.

## 1. Capability map

| Capability | State | Existing asset to reuse |
| --- | --- | --- |
| Configuration store + scoped overrides | PARTIAL | `config.server.ts`, `screed_config`, `roofing_config`, `finance_core_settings`, `analytics_targets`. These are per-domain JSON rows with no scope chain |
| Canonical module/capability registry | IMPLEMENTED (code-only) | `src/lib/modules.ts` + `core/module-registry.ts` + `modules-registry.test.ts`. It needs a DB overlay, not a second registry |
| Entity schema registry | MISSING | `data-exchange/registry.ts` (16 KB entity list for import/export) can be reused as the seed |
| Fields/relations metadata | PARTIAL | `input_fields`, `formulas`, `directions`, `direction_versions` (directions only); `orders.management_data` jsonb |
| Navigation builder | MISSING (static) | `components/nav-model.ts` (8 sections), `marketing/nav.ts` |
| Layouts/views builder | PARTIAL | `lib/dashboard/widgets.ts` personal layout; `CalcViewTabs` |
| Workflow builder | PARTIAL | `crm_pipelines`/`crm_stages` (configurable); order statuses are enums in `orders.constants.ts`; `entity_status_history`, `order_status_history` |
| Dictionaries/master data | REUSABLE | `ReferenceAdmin.tsx`, `reference.functions.ts`, `close_reasons`, `company_requisites`, `client_groups`, `finance_reason_codes`, `calendar-taxonomy.ts` (code) |
| Event registry | PARTIAL | `integration_events` + `claim_integration_event()`, `auto-events.server.ts`, audit triggers. No catalogue of internal domain events |
| Action registry | MISSING | Server functions exist but are not registered as named actions |
| WHEN/IF/THEN rule engine | PARTIAL | `notification_rules`, `finance_rules` + `finance/rules.ts` (effective-dated). No generic engine |
| Safe formula engine | IMPLEMENTED | `engines/formula-eval.ts` (sandboxed, used by directions); `engines/versions.ts` |
| Metrics/KPI registry | PARTIAL | `analytics.server.ts`, `crm_kpi()`, `analytics_overview()`, `payroll_kpi_templates`, `marketing/calculator.ts`. Definitions are in code |
| Dashboard configuration | PARTIAL | `dashboard/widgets.ts`, `control-center.tsx`, role dashboards |
| Calendar/scheduling configuration | PARTIAL | `calendar-taxonomy.ts`, `duration-calc.ts`, `brigade_rates`, `crew_bookings`, Operations Calendar |
| Compensation/planning configuration | PARTIAL | `compensation_scheme_versions`, `compensation_role_rules`, `finance_rules`, `payroll_*`, `FinanceRulesAdmin.tsx` (verify: several tables have RLS off) |
| Integration configuration overlay | REUSABLE | `integrations`, `integration_providers`, `integration_field_mappings`, `integration_sync_settings`, `integrations-constants.ts` |
| Permission/policy overlay | IMPLEMENTED | `access_roles`, `role_permissions`, `user_permission_overrides`, `user_access.scope`, `access.server.ts` (`loadActor`, `requirePermission`), `access-constants.ts` |
| Dependency validation | MISSING | Only registry tests and `data-audit` checks |
| Draft/validate/preview/publish/rollback | PARTIAL | `direction_versions`, estimate versions, `finance_rules` effective dates, `marketing_calculator_snapshots`. No shared lifecycle |
| Feature flags/config packages | MISSING | `modules.active` is a code constant |
| Settings Control Center/System Health | PARTIAL | `routes/settings.tsx` (tabs), `integrations.tsx` health, `data-audit.tsx`, `ReconciliationPanel` |

Rough coverage today: about 35–40% of ordinary business setup is admin-editable. The waves below target 85–90%.

## 2. Design principles

- There is one generic kernel table family, `config_*`. Each domain keeps its typed tables; the kernel stores overlays and versions, never duplicate business rows.
- Resolution order: published override (user > role > department > branch > company > system), falling back to the code default (`modules.ts`, `nav-model.ts`, enums). With no published row, behaviour is identical to today.
- All writes go through `createServerFn` with `requirePermission('settings','manage_settings')` and write to `audit_logs`.
- Payloads are validated by zod schemas per config kind (the `*.schema.ts` pattern). Payloads never contain secrets; `integration_secrets` stays separate.

## 3. Waves (6 build turns + 1 audit turn)

### Wave 0 — Evidence baseline (read-only, 1 turn)
- Check RLS status and grants on the RLS-off tables: `compensation_*`, `finance_core_settings`, `finance_monthly_snapshots`, `object_economics`, `asset_register`, `kpi_results_shadow`, `payroll_shadow_calculations`, `cash_reserve_policy`, `finance_cost_class_map`, `finance_reconciliation_issues`, `eligible_gross_profit_attribution`, `asset_depreciation_entries`.
- Inventory hardcoded business arrays (statuses, sources, calendar types, nav, KPI definitions) with file:line.
- Accept when: a P0/P1 list exists and there are no code changes. Any RLS-off P0 is fixed first as a separate safe-change turn.

### Wave 1 — Kernel: config store, versioning, audit, flags
- Additive tables:
  - `config_entries`: `kind`, `key`, `scope_type`, `scope_id`, `status` (draft/published/archived), `version`, `payload` jsonb, `schema_version`, `effective_from`, `created_by`, `published_by`
  - `config_packages`: a named bundle of entries, for export and import
  - `config_publish_log`
  - `feature_flags`, stored as `config_entries` with `kind='flag'`
- `src/lib/config/` files:
  - `resolve.server.ts`: scope resolution + code fallback
  - `lifecycle.functions.ts`: draft → validate → preview diff → publish → rollback, where rollback republishes the prior version
  - `schemas.ts`: zod schemas per kind
- Reuse: `engines/versions.ts`, the `audit_logs` writer, `has_role`/`private.*` helpers.
- Accept when: an empty store yields identical runtime, proven by tests; publishing and rolling back are audited; RLS lets admins and directors write and authenticated users read only published non-sensitive kinds.

### Wave 2 — Registries: modules/capabilities, entities, fields, dictionaries
- Module overlay: `kind='module'` can override label, active, order and roles only. `modules.ts` stays the canonical id set, and unknown ids are rejected by the validator.
- Entity registry, generated from `data-exchange/registry.ts` in code and extended with metadata.
- Custom fields: `custom_field_defs` (entity, key, type, dictionary ref, required, visibility role) and `custom_field_values` (entity, record_id, field_id, value jsonb). No runtime DDL. `orders` typed columns stay untouched.
- Dictionaries: generalise `ReferenceAdmin` onto a `dictionaries`/`dictionary_items` pair with versions. Existing tables (`close_reasons`, `client_groups`, CRM sources) stay authoritative and are registered, not copied.
- Accept when: an admin can add a field to orders or leads and fill it on the card, archive a dictionary item without breaking history, and rename or hide a module without breaking routes or tests.

### Wave 3 — Navigation, layouts/views, dashboards, metrics
- `kind='nav'` overlays on `nav-model.ts`: order, hide, rename, role visibility. Routes stay in code.
- `kind='view'`: list columns, filters and card section order for orders, leads, clients and measurements.
- `metric_definitions` registry: key, source function (whitelisted from `analytics.server.ts`), filters, unit, sensitivity (finance-protected). Dashboards reference metric keys; `dashboard/widgets.ts` reads role layouts from config.
- Accept when: KPIs still aggregate server-side over the full dataset; protected metrics are hidden by `canViewInternalPrices`; a missing metric shows "Немає даних".

### Wave 4 — Workflows, events, actions, rules
- `workflow_definitions`: status set, transitions, required fields and guard rule per entity. It is seeded from `orders.constants.ts` and CRM stages. Enum-backed statuses stay valid, and new statuses map to existing enums or go to custom-field status (no enum edits).
- Event registry in code (`src/lib/config/events.ts`), emitted from the existing triggers/`auto-events.server.ts` into `integration_events`-style queue, direction `internal`.
- Action registry: a whitelist of named server actions (create task, notify, assign, set field, create calendar event), each with a permission check.
- Rule engine: WHEN event IF condition (`formula-eval.ts`, boolean) THEN actions. Idempotent, logged, supports dry-run. It extends `notification_rules`.
- Excluded: no AI mutations and no finance or estimate writes from rules.
- Accept when: a sample rule ("measurement completed → task for estimator") runs through dry-run, publish and log; a transition guard blocks invalid moves server-side.

### Wave 5 — Domain overlays: calendar, compensation/planning, integrations, permissions
- Calendar: event types and durations from `calendar-taxonomy.ts`/`duration-calc.ts` become `kind='calendar'` config, and the Operations Calendar reads the resolver.
- Compensation/planning: builder UI on `finance_rules` + `compensation_*` with effective dates and shadow preview through the existing `compensation.ts`/`waterfall.ts`.
- Integrations: field mapping and sync settings UI on the existing `integration_*` tables; secrets stay write-only.
- Permissions: the matrix editor on `role_permissions`/`user_permission_overrides` gains a preview ("what can role X see").
- Accept when: changes need no React edits, shadow results reconcile with current payroll and finance outputs, and no secret appears in exports.

### Wave 6 — Dependency validation, Control Center, System Health
- `validate.server.ts`: checks references (module → catalog → direction → formula; nav → route exists; rule → action/event exists; metric → source; field → dictionary) and blocks publishing when errors are found.
- `/settings` becomes a Control Center with builder cards, draft counts, last publish, validation status, plus a System Health view (integrations freshness, data-audit, reconciliation, RLS-off count).
- Config package export/import runs as a dry-run diff and strips secrets.
- Accept when: publishing with a broken reference is refused with a readable reason, the full e2e smoke passes, and removing all config rows restores current behaviour.

## 4. Migration risks

- Every change is additive: new tables only, no enum edits and no column type changes. Each migration includes GRANT, RLS and policies.
- An override read added to hot paths (nav, calculators) needs caching: a per-request resolver plus a TanStack Query cache.
- Custom fields in jsonb must not shadow typed `orders` columns; the validator rejects colliding keys.
- Rules must not create loops. Guard with a depth limit, idempotency key and per-entity rate limit.
- Existing estimate snapshots must stay immutable, so config changes never recalculate saved estimates.
- Confidential metrics and fields need a sensitivity flag enforced server-side, not only in the UI.

## 5. Verification per wave
Each wave runs focused vitest (resolver fallback, schema validation, lifecycle), `tsgo`, build, the registry tests, and a Playwright check of `/settings` plus one affected runtime page. Nothing is published without explicit approval.

## 6. Open decisions
- Which scopes Wave 1 needs: company + role only, with branch/department/user added later. Assumed yes.
- Whether custom order statuses are allowed, or overlays may only relabel and reorder existing enum statuses. Assumed relabel and reorder only.
- Who can publish: admin + director. Assumed yes.
