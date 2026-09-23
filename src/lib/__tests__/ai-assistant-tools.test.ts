import { describe, expect, it } from "vitest";
import { planTools } from "../ai-assistant.tools";

describe("TZI AI tool planning", () => {
  it("no rights → no tools", () => {
    expect(planTools({ reports: false, integrations: false, finance: false })).toEqual([]);
  });
  it("reports without finance never exposes finance", () => {
    expect(planTools({ reports: true, integrations: false, finance: false })).not.toContain("finance");
  });
  it("finance only when authorized", () => {
    expect(planTools({ reports: true, integrations: true, finance: true })).toContain("finance");
  });
});
