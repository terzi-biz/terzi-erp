import { describe, it, expect } from "vitest";
import { decideTransition, nextStages, workflowPayloadErrors, defaultWorkflowTemplate, workflowSchema } from "@/lib/config-kernel/workflow";
import { validateConfig } from "@/lib/config-kernel/kinds";

const wf = defaultWorkflowTemplate();

describe("order workflow", () => {
  it("no workflow = any transition, no actions", () => {
    expect(decideTransition(null, "planned", "warranty")).toEqual({ allowed: true, actions: [], taskTitle: null, governed: false });
  });
  it("rejects unknown stage", () => {
    expect(decideTransition(null, "planned", "bogus").allowed).toBe(false);
  });
  it("allowed transition returns configured actions", () => {
    const d = decideTransition(wf, "awaiting_materials", "planned");
    expect(d).toMatchObject({ allowed: true, actions: ["plan_from_estimate"], governed: true });
    const a = decideTransition(wf, "works_done", "acceptance");
    expect(a).toMatchObject({ allowed: true, actions: ["fact_to_payroll", "create_task"] });
  });
  it("blocks undefined transition and inactive stage", () => {
    expect(decideTransition(wf, "not_planned", "handed_over").allowed).toBe(false);
    expect(decideTransition(wf, "in_progress", "paused").allowed).toBe(false);
  });
  it("next stages follow transitions", () => {
    expect(nextStages(wf, "in_progress")).toEqual(["works_done"]);
  });
  it("template is valid config", () => {
    expect(workflowSchema.safeParse(wf).success).toBe(true);
    expect(validateConfig("workflow", "order.production", wf).ok).toBe(true);
    expect(validateConfig("workflow", "order.other", wf).ok).toBe(false);
  });
  it("structural errors", () => {
    const bad = { ...wf, transitions: [...wf.transitions, { from: "in_progress", to: "paused", actions: ["create_task"] }] } as any;
    const e = workflowPayloadErrors("order.production", bad);
    expect(e.some((x) => x.includes("неактивний"))).toBe(true);
    expect(e.some((x) => x.includes("назва"))).toBe(true);
  });
});
