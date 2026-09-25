import { describe, expect, it } from "vitest";
import { matchRule, renderTemplate, selectMatchingRules } from "../schema";

const base = {
  enabled: true,
  trigger_entity: "order" as const,
  trigger_field: "commercial_status",
  trigger_from: null as string | null,
  trigger_to: "contract",
};

describe("matchRule", () => {
  it("matches entity+field+to when from is unrestricted", () => {
    expect(
      matchRule(base, { entityType: "order", field: "commercial_status", from: "negotiation", to: "contract" }),
    ).toBe(true);
    expect(
      matchRule(base, { entityType: "order", field: "commercial_status", from: null, to: "contract" }),
    ).toBe(true);
  });

  it("rejects wrong to / entity / field / disabled", () => {
    expect(matchRule(base, { entityType: "order", field: "commercial_status", to: "sold" })).toBe(false);
    expect(matchRule(base, { entityType: "lead", field: "commercial_status", to: "contract" })).toBe(false);
    expect(matchRule(base, { entityType: "order", field: "production_status", to: "contract" })).toBe(false);
    expect(matchRule({ ...base, enabled: false }, { entityType: "order", field: "commercial_status", to: "contract" })).toBe(
      false,
    );
  });

  it("honours optional trigger_from", () => {
    const r = { ...base, trigger_from: "negotiation" };
    expect(matchRule(r, { entityType: "order", field: "commercial_status", from: "negotiation", to: "contract" })).toBe(
      true,
    );
    expect(matchRule(r, { entityType: "order", field: "commercial_status", from: "estimate_sent", to: "contract" })).toBe(
      false,
    );
  });
});

describe("selectMatchingRules", () => {
  it("filters list", () => {
    const rules = [
      { ...base, id: "1", name: "a", condition: {}, actions: [], created_by: null, created_at: "", updated_at: "" },
      {
        ...base,
        id: "2",
        name: "b",
        trigger_to: "sold",
        condition: {},
        actions: [],
        created_by: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const hit = selectMatchingRules(rules, { entityType: "order", field: "commercial_status", to: "contract" });
    expect(hit).toHaveLength(1);
    expect(hit[0]!.id).toBe("1");
  });
});

describe("renderTemplate", () => {
  it("substitutes keys", () => {
    expect(renderTemplate("Статус {{to}} для {{entity_id}}", { to: "contract", entity_id: "abc" })).toBe(
      "Статус contract для abc",
    );
    expect(renderTemplate("x {{missing}} y", {})).toBe("x  y");
  });
});
