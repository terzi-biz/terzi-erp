import { describe, it, expect } from "vitest";
import { touchAttrFromUtm, missingAttrPatch, googleClickSignal } from "../marketing/touchpoint-row";
import { buildIntakeTouchRow } from "../marketing/touchpoints.server";

const base = { leadId: "l1", contactId: "c1", occurredAt: "2026-09-24T10:00:00Z", channelId: null, campaignId: null };

describe("attribution touchpoints", () => {
  it("gclid/gbraid/wbraid stay separate", () => {
    const a = touchAttrFromUtm({ gclid: "G1", gbraid: "B1", wbraid: "W1" });
    const row = buildIntakeTouchRow({ ...base, attr: a, isFirst: true }) as any;
    expect([row.gclid, row.gbraid, row.wbraid]).toEqual(["G1", "B1", "W1"]);
    const only = buildIntakeTouchRow({ ...base, attr: touchAttrFromUtm({ gbraid: "B2" }), isFirst: true }) as any;
    expect(only.gclid).toBeNull();
    expect(only.gbraid).toBe("B2");
    expect(googleClickSignal(touchAttrFromUtm({ wbraid: "W" }))).toBe("W");
  });
  it("repeat touch on existing lead is last touch, not first", () => {
    const row = buildIntakeTouchRow({ ...base, attr: touchAttrFromUtm({ utm_source: "facebook", fbclid: "F" }), isFirst: false }) as any;
    expect(row.is_first_touch).toBe(false);
    expect(row.is_last_touch).toBe(true);
    expect(row.fbclid).toBe("F");
  });
  it("backfill patches only missing fields and reports conflicts", () => {
    const { patch, conflicts } = missingAttrPatch(
      { gclid: "OLD", campaign: "c" },
      touchAttrFromUtm({ gclid: "NEW", gbraid: "B", utm_campaign: "c" }),
    );
    expect(patch).toEqual({ gbraid: "B" });
    expect(conflicts).toEqual(["gclid"]);
  });
  it("no click id → none invented", () => {
    const row = buildIntakeTouchRow({ ...base, attr: touchAttrFromUtm({ utm_source: "site" }), isFirst: true }) as any;
    for (const k of ["gclid", "gbraid", "wbraid", "fbclid", "ttclid"]) expect(row[k]).toBeNull();
    expect(missingAttrPatch({}, touchAttrFromUtm({})).patch).toEqual({});
  });
});
