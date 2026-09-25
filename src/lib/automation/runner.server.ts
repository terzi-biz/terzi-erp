/**
 * Control Center automation runner (server-only).
 *
 * TODO(Wave 3 wire-up after Wave 2): call `runAutomationRules` from:
 *   - `updateOrderStatus` in orders.functions.ts (after successful update; pass from/to for commercial_status etc.)
 *   - `saveLead` / board.server.ts on stage_id or status change
 *   - optionally `setMeasurementStatus` in measurements.functions.ts
 * Do NOT import this module from client bundles.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AutomationAction,
  type AutomationRuleRow,
  matchRule,
  renderTemplate,
  selectMatchingRules,
} from "./schema";

export type EvaluateRulesInput = {
  entityType: "order" | "lead" | "measurement";
  entityId: string;
  field: string;
  from?: string | null;
  to: string;
  actorId: string;
  /** Extra template / snapshot fields (name, client_id, …). */
  context?: Record<string, string | null | undefined>;
};

export type EvaluateRulesResult = {
  matched: number;
  journalIds: string[];
  taskIds: string[];
  errors: string[];
};

function parseActions(raw: unknown): AutomationAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AutomationAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || !("type" in item)) continue;
    const t = (item as { type: string }).type;
    if (t === "create_task" || t === "write_journal" || t === "set_plan_fact") {
      out.push(item as AutomationAction);
    }
  }
  return out;
}

function normalizeRule(row: Record<string, unknown>): AutomationRuleRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    enabled: Boolean(row.enabled),
    trigger_entity: row.trigger_entity as AutomationRuleRow["trigger_entity"],
    trigger_field: String(row.trigger_field),
    trigger_from: (row.trigger_from as string | null) ?? null,
    trigger_to: String(row.trigger_to),
    condition: (row.condition as Record<string, unknown>) ?? {},
    actions: parseActions(row.actions),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function insertJournal(
  sb: SupabaseClient,
  row: {
    rule_id: string;
    entity_type: string;
    entity_id: string;
    trigger_snapshot: Record<string, unknown>;
    action_type: string;
    action_payload: Record<string, unknown>;
    plan_at?: string | null;
    fact_at?: string | null;
    status: "pending" | "done" | "failed" | "cancelled";
    error?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await sb
    .from("automation_journal")
    .insert({
      rule_id: row.rule_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      trigger_snapshot: row.trigger_snapshot,
      action_type: row.action_type,
      action_payload: row.action_payload,
      plan_at: row.plan_at ?? null,
      fact_at: row.fact_at ?? null,
      status: row.status,
      error: row.error ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("automation_journal insert", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

async function tryCreateTask(
  sb: SupabaseClient,
  input: EvaluateRulesInput,
  action: Extract<AutomationAction, { type: "create_task" }>,
  templateCtx: Record<string, string | null | undefined>,
): Promise<{ taskId: string | null; error: string | null; payload: Record<string, unknown> }> {
  const title = renderTemplate(action.title, templateCtx) || action.title;
  const due = new Date(Date.now() + (action.due_offset_hours ?? 24) * 3600_000).toISOString();
  const payload: Record<string, unknown> = {
    title,
    kind: action.kind ?? "follow_up",
    due_offset_hours: action.due_offset_hours ?? 24,
    due_at: due,
  };

  const row: Record<string, unknown> = {
    title,
    kind: action.kind ?? "follow_up",
    status: "open",
    priority: "normal",
    due_at: due,
    owner_id: input.actorId,
    assigned_to: input.actorId,
  };
  if (input.entityType === "order") row.order_id = input.entityId;
  if (input.entityType === "lead") row.lead_id = input.entityId;
  if (input.context?.client_id) row.client_id = input.context.client_id;

  try {
    const { data, error } = await sb.from("crm_tasks").insert(row).select("id").single();
    if (error) {
      console.error("automation create_task", error);
      return { taskId: null, error: error.message, payload };
    }
    const taskId = (data as { id: string } | null)?.id ?? null;
    return { taskId, error: null, payload: { ...payload, task_id: taskId } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { taskId: null, error: msg, payload };
  }
}

/**
 * Load enabled rules matching entity+field+to (and optional from), execute actions.
 * Always writes journal rows (write_journal implicit per action + explicit action).
 */
export async function evaluateRules(
  sb: SupabaseClient,
  input: EvaluateRulesInput,
): Promise<EvaluateRulesResult> {
  const result: EvaluateRulesResult = { matched: 0, journalIds: [], taskIds: [], errors: [] };

  const { data: rows, error } = await sb
    .from("automation_rules")
    .select("*")
    .eq("enabled", true)
    .eq("trigger_entity", input.entityType)
    .eq("trigger_field", input.field)
    .eq("trigger_to", input.to);

  if (error) {
    console.error("evaluateRules load", error);
    result.errors.push(error.message);
    return result;
  }

  const rules = (rows ?? []).map((r) => normalizeRule(r as Record<string, unknown>));
  const matched = selectMatchingRules(rules, {
    entityType: input.entityType,
    field: input.field,
    from: input.from ?? null,
    to: input.to,
  });
  // Extra filter for optional from when DB didn't narrow (nullable column)
  const filtered = matched.filter((r) => matchRule(r, {
    entityType: input.entityType,
    field: input.field,
    from: input.from ?? null,
    to: input.to,
  }));

  result.matched = filtered.length;
  const nowIso = new Date().toISOString();
  const triggerSnapshot: Record<string, unknown> = {
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    from: input.from ?? null,
    to: input.to,
    actorId: input.actorId,
    at: nowIso,
    ...(input.context ?? {}),
  };
  const templateCtx: Record<string, string | null | undefined> = {
    entity_id: input.entityId,
    entity_type: input.entityType,
    field: input.field,
    from: input.from ?? "",
    to: input.to,
    actor_id: input.actorId,
    ...(input.context ?? {}),
  };

  for (const rule of filtered) {
    const actions = rule.actions.length ? rule.actions : ([{ type: "write_journal" }] as AutomationAction[]);
    // Ensure at least one journal trail even if rule only has create_task
    let wroteJournal = false;

    for (const action of actions) {
      if (action.type === "create_task") {
        const { taskId, error: taskErr, payload } = await tryCreateTask(sb, input, action, templateCtx);
        if (taskId) result.taskIds.push(taskId);
        const jid = await insertJournal(sb, {
          rule_id: rule.id,
          entity_type: input.entityType,
          entity_id: input.entityId,
          trigger_snapshot: triggerSnapshot,
          action_type: "create_task",
          action_payload: payload,
          plan_at: (payload.due_at as string) ?? nowIso,
          fact_at: taskId ? nowIso : null,
          status: taskId ? "done" : "pending",
          error: taskErr,
        });
        if (jid) result.journalIds.push(jid);
        wroteJournal = true;
        if (taskErr) result.errors.push(taskErr);
      } else if (action.type === "set_plan_fact") {
        const planAt = action.plan_at ?? nowIso;
        const factAt = action.mark_fact ? nowIso : null;
        const jid = await insertJournal(sb, {
          rule_id: rule.id,
          entity_type: input.entityType,
          entity_id: input.entityId,
          trigger_snapshot: triggerSnapshot,
          action_type: "set_plan_fact",
          action_payload: { plan_at: planAt, mark_fact: action.mark_fact ?? false },
          plan_at: planAt,
          fact_at: factAt,
          status: factAt ? "done" : "pending",
        });
        if (jid) result.journalIds.push(jid);
        wroteJournal = true;
      } else if (action.type === "write_journal") {
        const jid = await insertJournal(sb, {
          rule_id: rule.id,
          entity_type: input.entityType,
          entity_id: input.entityId,
          trigger_snapshot: triggerSnapshot,
          action_type: "write_journal",
          action_payload: { note: action.note ?? null, rule_name: rule.name },
          plan_at: nowIso,
          fact_at: nowIso,
          status: "done",
        });
        if (jid) result.journalIds.push(jid);
        wroteJournal = true;
      }
    }

    if (!wroteJournal) {
      const jid = await insertJournal(sb, {
        rule_id: rule.id,
        entity_type: input.entityType,
        entity_id: input.entityId,
        trigger_snapshot: triggerSnapshot,
        action_type: "write_journal",
        action_payload: { rule_name: rule.name, note: "auto" },
        plan_at: nowIso,
        fact_at: nowIso,
        status: "done",
      });
      if (jid) result.journalIds.push(jid);
    }
  }

  return result;
}

/** Alias ready for call sites — same as evaluateRules. */
export async function runAutomationRules(
  sb: SupabaseClient,
  input: EvaluateRulesInput,
): Promise<EvaluateRulesResult> {
  return evaluateRules(sb, input);
}
