# Wave 3 — Control Center «коли / якщо / то»

**Date:** 2026-09-25 (Europe/Kyiv)  
**Local root:** `/workspace/terzi-erp`  
**Constraint:** no deploy, no Lovable `send_message`. Did not touch warehouse / measurements / `nav-model` / `routeTree.gen.ts`.

## Files created (local)

| Path | Role |
| --- | --- |
| `supabase/migrations/20260925030000_automation_rules.sql` | `automation_rules` + `automation_journal` + RLS |
| `src/lib/automation/schema.ts` | Zod + `matchRule` / `selectMatchingRules` / `renderTemplate` |
| `src/lib/automation/runner.server.ts` | `evaluateRules` / `runAutomationRules` |
| `src/lib/automation/automation.functions.ts` | `listRules`, `saveRule`, `setRuleEnabled`, `listJournal`, `controlCenterKpis` |
| `src/lib/automation/__tests__/match-rule.test.ts` | Vitest pure matching |
| `src/components/automation/RulesEditor.tsx` | Rules table + create form |
| `src/components/automation/JournalPanel.tsx` | Journal last-N table |
| `src/routes/settings.control-center.tsx` | UI `/settings/control-center` |
| `ROUTE_TREE_PATCH.md` (repo root) | Exact routeTree snippets — do **not** regen while Wave 1 owns `routeTree.gen.ts` |

This folder is a package copy of the same artifacts.

## Actions supported by runner

1. **`create_task`** — insert into `crm_tasks` (title template `{{to}}` / `{{entity_id}}`, `kind`, `due_offset_hours`); journal row with `task_id` or `status=pending` + error if insert fails.
2. **`write_journal`** — always-style trail row (`status=done`, plan=fact=now).
3. **`set_plan_fact`** — journal with `plan_at` (now or payload) and optional `mark_fact` → `fact_at`.

Every matched rule also ensures at least one journal row.

## Apply migration on Live (later)

Via Lovable `query_database` (or Supabase SQL) run the contents of `20260925030000_automation_rules.sql`.  
Do **not** apply from this agent session unless explicitly asked.

## Hook points (NOT wired yet — after Wave 2)

Leave call sites as TODO. Export ready: `runAutomationRules` from `runner.server.ts`.

### `updateOrderStatus` (`src/lib/orders.functions.ts`)

After successful update, for each changed status field:

```ts
// TODO(Wave 3): wire Control Center rules
// import { runAutomationRules } from "@/lib/automation/runner.server";
// await runAutomationRules(context.supabase, {
//   entityType: "order",
//   entityId: id,
//   field: "commercial_status", // or production_status / financial_status
//   from: previousValue ?? null,
//   to: cleaned.commercial_status,
//   actorId: context.userId,
//   context: { client_id: base.client_id, name: (obj as any)?.name },
// });
```

Fetch previous values **before** update (select current row) so `from` is accurate.

### `saveLead` / board stage change

```ts
// TODO(Wave 3): when stage_id or status changes
// await runAutomationRules(sb, {
//   entityType: "lead",
//   entityId: leadId,
//   field: "stage_id", // or "status"
//   from: oldStage,
//   to: newStage,
//   actorId: userId,
// });
```

### Optional: `setMeasurementStatus`

Same pattern with `entityType: "measurement"`, `field: "status"`.

## Route / nav still needed

1. Apply `ROUTE_TREE_PATCH.md` (or `tsr generate`) after Wave 1 releases `routeTree.gen.ts`.
2. Optional nav child under Settings: `{ to: "/settings/control-center", label: "Правила (коли / якщо / то)" }` — not edited in Wave 3.

## RLS summary

- **Rules:** SELECT all authenticated; INSERT/UPDATE/DELETE admin|director (`has_role`).
- **Journal:** SELECT all authenticated; INSERT any authenticated (runner); UPDATE admin|director.
