/**
 * Конструктор етапів замовлення (виробничі етапи) — config kind `workflow`.
 * Коди етапів — лише з канонічного enum object_production_status; нових станів не створюємо.
 * Немає опублікованого workflow = поточна поведінка (будь-який перехід, без автоматики).
 */
import { z } from "zod";
import { PRODUCTION_STATUSES, PRODUCTION_LABELS } from "@/lib/orders.constants";

export const WORKFLOW_KEYS = ["order.production"] as const;
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];

export const WORKFLOW_ACTIONS = ["plan_from_estimate", "fact_to_payroll", "create_task"] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];
export const WORKFLOW_ACTION_LABEL: Record<WorkflowAction, string> = {
  plan_from_estimate: "План бригад із затвердженого кошторису",
  fact_to_payroll: "Підтверджений факт — у відомість",
  create_task: "Завдання менеджеру",
};

const stageCode = z.enum(PRODUCTION_STATUSES);

export const workflowSchema = z.object({
  stages: z.array(z.object({
    code: stageCode,
    label_uk: z.string().min(1).max(80).optional(),
    order: z.number().int().min(0).max(1000),
    active: z.boolean().optional(),
  }).strict()).min(1).max(PRODUCTION_STATUSES.length),
  transitions: z.array(z.object({
    from: stageCode,
    to: stageCode,
    actions: z.array(z.enum(WORKFLOW_ACTIONS)).max(WORKFLOW_ACTIONS.length),
    task_title: z.string().min(3).max(200).optional(),
  }).strict()).max(200),
}).strict();
export type Workflow = z.infer<typeof workflowSchema>;

export const isWorkflowKey = (k: string) => (WORKFLOW_KEYS as readonly string[]).includes(k);

/** Структурні помилки поверх zod: дублі, переходи між неактивними/відсутніми етапами. */
export function workflowPayloadErrors(_key: string, payload: unknown): string[] {
  const p = workflowSchema.safeParse(payload);
  if (!p.success) return [];
  const errs: string[] = [];
  const codes = p.data.stages.map((s) => s.code);
  if (new Set(codes).size !== codes.length) errs.push("Етап повторюється");
  const active = new Set(p.data.stages.filter((s) => s.active !== false).map((s) => s.code));
  const seen = new Set<string>();
  for (const t of p.data.transitions) {
    const id = `${t.from}>${t.to}`;
    if (t.from === t.to) errs.push(`Перехід у той самий етап: ${t.from}`);
    if (seen.has(id)) errs.push(`Перехід повторюється: ${id}`);
    seen.add(id);
    if (!active.has(t.from) || !active.has(t.to)) errs.push(`Перехід ${id} посилається на неактивний або відсутній етап`);
    if (new Set(t.actions).size !== t.actions.length) errs.push(`Дія повторюється в переході ${id}`);
    if (t.actions.includes("create_task") && !t.task_title) errs.push(`Для завдання в переході ${id} потрібна назва`);
  }
  return errs;
}

export type TransitionDecision =
  | { allowed: true; actions: WorkflowAction[]; taskTitle: string | null; governed: boolean }
  | { allowed: false; error: string };

/** Детерміноване рішення про перехід. Без workflow — дозволено, без автоматики. */
export function decideTransition(wf: Workflow | null | undefined, from: string | null, to: string): TransitionDecision {
  if (!(PRODUCTION_STATUSES as readonly string[]).includes(to)) return { allowed: false, error: `Невідомий етап «${to}»` };
  if (!wf) return { allowed: true, actions: [], taskTitle: null, governed: false };
  if (from === to) return { allowed: false, error: "Замовлення вже на цьому етапі" };
  const stage = wf.stages.find((s) => s.code === to);
  if (!stage || stage.active === false) return { allowed: false, error: `Етап «${label(wf, to)}» вимкнено в конструкторі` };
  const t = wf.transitions.find((x) => x.from === (from ?? "not_planned") && x.to === to);
  if (!t) return { allowed: false, error: `Перехід «${label(wf, from ?? "not_planned")}» → «${label(wf, to)}» не дозволено` };
  return { allowed: true, actions: [...t.actions], taskTitle: t.task_title ?? null, governed: true };
}

/** Дозволені наступні етапи (для селектора в картці). */
export function nextStages(wf: Workflow | null | undefined, from: string | null): string[] {
  if (!wf) return [...PRODUCTION_STATUSES];
  const f = from ?? "not_planned";
  const active = new Set(wf.stages.filter((s) => s.active !== false).map((s) => s.code));
  return wf.transitions.filter((t) => t.from === f && active.has(t.to)).map((t) => t.to);
}

export function label(wf: Workflow | null | undefined, code: string): string {
  return wf?.stages.find((s) => s.code === code)?.label_uk || PRODUCTION_LABELS[code] || code;
}

/** Стартовий шаблон для редактора (не застосовується до публікації). */
export function defaultWorkflowTemplate(): Workflow {
  const seq = ["not_planned", "preparation", "awaiting_materials", "planned", "crew_assigned", "in_progress", "works_done", "acceptance", "handed_over", "warranty"] as const;
  return {
    stages: PRODUCTION_STATUSES.map((c, i) => ({ code: c, order: i * 10, active: (seq as readonly string[]).includes(c) })),
    transitions: seq.slice(1).map((to, i) => ({
      from: seq[i], to,
      actions: to === "planned" ? ["plan_from_estimate"] : to === "acceptance" ? ["fact_to_payroll", "create_task"] : [],
      ...(to === "acceptance" ? { task_title: "Провести приймання робіт і підписати акт" } : {}),
    })) as Workflow["transitions"],
  };
}
