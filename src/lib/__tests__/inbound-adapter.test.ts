import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildSiteIntakePayload, parseMetaLeadgenIds, processMetaLeadgen, normalizeMetaLead } from "../leads/inbound-adapter";
import { dedupeHash, verifySignature } from "../leads/intake.server";
import { signIntakeBody } from "../leads/intake-client.server";
import { verifyMetaSignature } from "../integrations/foundation/meta-ads.server";

describe("inbound adapter", () => {
  it("site payload keeps each click ID separate and signs compatibly", () => {
    const p = buildSiteIntakePayload({ phone: "0501234567", query: { gclid: "G", gbraid: "B", wbraid: "W", fbclid: "F", ttclid: "T", utm_source: "google" } });
    expect([p.gclid, p.gbraid, p.wbraid, p.fbclid, p.ttclid]).toEqual(["G", "B", "W", "F", "T"]);
    expect(p.utm).toEqual({ utm_source: "google" });
    const none = buildSiteIntakePayload({ phone: "1" });
    expect(none.gclid).toBeUndefined();
    const raw = JSON.stringify(p);
    expect(verifySignature(raw, signIntakeBody(raw, "k"), "k")).toBe(true);
  });

  it("Meta signature verification", () => {
    const raw = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "s").update(raw).digest("hex");
    expect(verifyMetaSignature(raw, sig, "s")).toBe(true);
    expect(verifyMetaSignature(raw, sig, "other")).toBe(false);
    expect(verifyMetaSignature(raw, null, "s")).toBe(false);
  });

  it("provider retry is idempotent (same leadgen → same dedupe key, deduped ids)", () => {
    const body = { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "L1" } }, { field: "leadgen", value: { leadgen_id: "L1" } }] }] };
    expect(parseMetaLeadgenIds(body).map((x) => x.leadgenId)).toEqual(["L1"]);
    const p = normalizeMetaLead({ id: "L1", createdTime: null, campaign: "C", formId: "F", phone: "+380501234567" });
    expect(p.external_id).toBe("meta_lead:L1");
    expect(dedupeHash(p, "+380501234567")).toBe(dedupeHash({ ...p }, "+380501234567"));
  });

  it("failed Meta detail fetch does not fabricate a lead", async () => {
    const intake = vi.fn();
    const r = await processMetaLeadgen("L2", { fetchLead: async () => { throw new Error("permission"); }, intake });
    expect(r.status).toBe("fetch_failed");
    expect(intake).not.toHaveBeenCalled();
    const r2 = await processMetaLeadgen("L3", { fetchLead: async () => ({ id: "L3", createdTime: null, campaign: null, formId: null }), intake });
    expect(r2.status).toBe("no_contact");
    expect(intake).not.toHaveBeenCalled();
  });

  it("repeated identity goes through canonical intake (not a direct CRM write)", async () => {
    const intake = vi.fn(async () => ({ status: "accepted", leadId: "lead-1" }));
    const fetchLead = async (id: string) => ({ id, createdTime: null, campaign: null, formId: null, phone: "0501234567" });
    await processMetaLeadgen("A", { fetchLead, intake });
    await processMetaLeadgen("B", { fetchLead, intake });
    expect(intake).toHaveBeenCalledTimes(2);
  });
});
