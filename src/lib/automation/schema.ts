/** Zod schemas + pure match helpers for Control Center automation rules. */
import { z } from "zod";

export const TRIGGER_ENTITIES = ["order", "lead", "measurement"] as const;
export type TriggerEntity = (typeof TRIGGER_ENTITIES)[number];

export const JOURNAL_STATUSES = ["pending", "done", "failed", "cancelled"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const ACTION_TYPES = ["create_task", "write_journal", "set_plan_fact"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const createTaskActionSchema = z.object({
  type: z.literal("create_task"),
  title: z.string().min(1).max(500),
  kind: z.string().min(1).max(64).default("follow_up"),
  due_offset_hours: z.number().int().min(0).max(24 * 90).default(24),
});

export const writeJournalActionSchema = z.object({
  type: z.literal("write_journal"),
  note: z.string().max(2000).optional(),
});

export const setPlanFactActionSchema = z.object({
  type: z.literal("set_plan_fact"),
  /** ISO timestamptz string; if omitted, plan_at = now. */
  plan_at: z.string().max(40).optional().nullable(),
  /** If true, also set fact_at = now (mark executed). Default false. */
  mark_fact: z.boolean().optional().default(false),
});

export const automationActionSchema = z.discriminatedUnion("type", [
  createTaskActionSchema,
  writeJournalActionSchema,
  setPlanFactActionSchema,
]);

export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  trigger_entity: z.enum(TRIGGER_ENTITIES),
  trigger_field: z.string().min(1).max(64),
  trigger_from: z.string().max(128).nullable().optional(),
  trigger_to: z.string().min(1).max(128),
  condition: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(automationActionSchema).min(1).max(20),
});

export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;

export type AutomationRuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_entity: TriggerEntity;
  trigger_field: string;
  trigger_from: string | null;
  trigger_to: string;
  condition: Record<string, unknown>;
  actions: AutomationAction[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationJournalRow = {
  id: string;
  rule_id: string | null;
  entity_type: string;
  entity_id: string;
  trigger_snapshot: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
  plan_at: string | null;
  fact_at: string | null;
  status: JournalStatus;
  error: string | null;
  created_at: string;
};

export type RuleMatchEvent = {
  entityType: string;
  field: string;
  from?: string | null;
  to: string;
};

/** Pure: does a stored rule match this field change? */
export function matchRule(
  rule: Pick<
    AutomationRuleRow,
    "enabled" | "trigger_entity" | "trigger_field" | "trigger_from" | "trigger_to"
  >,
  event: RuleMatchEvent,
): boolean {
  if (!rule.enabled) return false;
  if (rule.trigger_entity !== event.entityType) return false;
  if (rule.trigger_field !== event.field) return false;
  if (rule.trigger_to !== event.to) return false;
  if (rule.trigger_from != null && rule.trigger_from !== "" && rule.trigger_from !== (event.from ?? null)) {
    return false;
  }
  return true;
}

/** Filter enabled matching rules (pure). */
export function selectMatchingRules<T extends AutomationRuleRow>(
  rules: T[],
  event: RuleMatchEvent,
): T[] {
  return rules.filter((r) => matchRule(r, event));
}

/** Render simple {{key}} templates from a context map. */
export function renderTemplate(template: string, ctx: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = ctx[key];
    return v == null || v === "" ? "" : String(v);
  });
}
