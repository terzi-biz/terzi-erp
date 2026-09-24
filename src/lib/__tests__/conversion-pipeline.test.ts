import { describe, it, expect, vi } from "vitest";
import { buildConversionDraft, conversionIdempotencyKey, pickGoogleClickId, type ConversionKind } from "../integrations/conversions";
import { isQualifyingTransition } from "../crm/qualification";
import { emitConversionEvent, safeEmitConversion, classifyCandidates, resolveSendMode } from "../marketing/conversion-events.server";

const sha = (s: string) => `h(${s})`;
const base = { sourceType: "crm_leads", sourceId: "L1", occurredAt: "2026-09-24T10:00:00Z", adUserDataConsent: "unknown" as const, origin: "crm" as const, sha256: sha };

describe("conversion pipeline W2.1", () => {
  it("idempotency key stable and distinct", () => {
    const k = conversionIdempotencyKey("google_ads", "lead_created", "crm_leads", "L1");
    expect(k).toBe(conversionIdempotencyKey("google_ads", "lead_created", "crm_leads", "L1"));
    expect(k).not.toBe(conversionIdempotencyKey("meta_ads", "lead_created", "crm_leads", "L1"));
    expect(k).not.toBe(conversionIdempotencyKey("google_ads", "order_created", "crm_leads", "L1"));
    expect(k).not.toBe(conversionIdempotencyKey("google_ads", "lead_created", "crm_leads", "L2"));
  });
  it("google click id priority, none invented", () => {
    expect(pickGoogleClickId({ gclid: "G", gbraid: "B", wbraid: "W" })).toEqual({ type: "gclid", value: "G" });
    expect(pickGoogleClickId({ gbraid: "B", wbraid: "W" })).toEqual({ type: "gbraid", value: "B" });
    expect(pickGoogleClickId({ wbraid: "W" })).toEqual({ type: "wbraid", value: "W" });
    expect(pickGoogleClickId({})).toBeNull();
    const d = buildConversionDraft({ ...base, provider: "google_ads", kind: "lead_created", click: { gbraid: "B", wbraid: "W" } });
    expect(d.payload).toMatchObject({ click_id_type: "gbraid", gbraid: "B" });
    expect(d.payload).not.toHaveProperty("wbraid");
    expect(buildConversionDraft({ ...base, provider: "google_ads", kind: "lead_created", click: {} }).ready).toBe(false);
  });
  it("no consent => no hashed identity", () => {
    const d = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", click: { fbclid: "F" }, phoneE164: "+380501234567", email: "a@b.c" });
    expect((d.payload as any).user_data).not.toHaveProperty("ph");
    expect((d.payload as any).user_data).not.toHaveProperty("em");
    expect(buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", click: {}, phoneE164: "+380501234567" }).ready).toBe(false);
    const ok = buildConversionDraft({ ...base, adUserDataConsent: "granted" as const, provider: "meta_ads", kind: "lead_created", click: {}, phoneE164: "+380501234567", metaLeadId: "M1" });
    expect((ok.payload as any).user_data).toMatchObject({ ph: ["h(380501234567)"], lead_id: "M1" });
    expect((ok.payload as any).event_id).toBe(ok.key);
    expect((ok.payload as any).action_source).toBe("system_generated");
  });
  it("only payment carries value", () => {
    const kinds: ConversionKind[] = ["lead_created", "lead_qualified", "measurement_completed", "estimate_created", "order_created", "lead_lost"];
    for (const kind of kinds) {
      const g = buildConversionDraft({ ...base, provider: "google_ads", kind, click: { gclid: "G" }, paymentAmount: 999 });
      const m = buildConversionDraft({ ...base, provider: "meta_ads", kind, click: { fbclid: "F" }, paymentAmount: 999 });
      expect(g.payload?.conversion_value).toBeUndefined();
      expect(m.payload?.custom_data).toBeUndefined();
    }
    const p = buildConversionDraft({ ...base, provider: "google_ads", kind: "payment_received", click: { gclid: "G" }, paymentAmount: 1500 });
    expect(p.payload).toMatchObject({ conversion_value: 1500, currency_code: "UAH" });
    expect(buildConversionDraft({ ...base, provider: "google_ads", kind: "payment_received", click: { gclid: "G" } }).ready).toBe(false);
  });
  it("qualified rule", () => {
    const newS = { id: "n", sort_order: 1 }; const work = { id: "w", sort_order: 2 }; const lost = { id: "l", sort_order: 9, is_lost: true };
    expect(isQualifyingTransition(newS, work, "n")).toBe(true);
    expect(isQualifyingTransition(newS, lost, "n")).toBe(false);
    expect(isQualifyingTransition(work, { id: "x", sort_order: 3 }, "n")).toBe(false);
    expect(isQualifyingTransition(newS, { id: "i", sort_order: 5, is_active: false }, "n")).toBe(false);
  });
  it("not configured => nothing enqueued; duplicate lifecycle event not re-queued", async () => {
    const fake = (rows: any[]) => {
      const q: any = { select: () => q, in: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: { id: "L1", phone_e164: null, utm: { gclid: "G" }, external_id: null, contact_id: null } }),
        then: (r: any) => r({ data: rows }) };
      return { from: (t: string) => (t === "integrations" ? { ...q, then: (r: any) => r({ data: rows }) } : { ...q, then: (r: any) => r({ data: [] }) }) } as any;
    };
    const enqueue = vi.fn();
    expect((await emitConversionEvent(fake([]), { kind: "lead_created", leadId: "L1", sourceType: "crm_leads", sourceId: "L1" }, { enqueue, complete: vi.fn() })).status).toBe("not_configured");
    expect(enqueue).not.toHaveBeenCalled();
    const seen = new Set<string>();
    const enq = vi.fn(async (i: any) => { const dup = seen.has(i.idempotencyKey); seen.add(i.idempotencyKey); return { id: dup ? null : "e1", duplicate: dup }; });
    const complete = vi.fn(async () => {});
    const db = fake([{ id: "I1", provider_key: "google_ads", enabled: true, config: {} }]);
    const input = { kind: "lead_created" as const, leadId: "L1", sourceType: "crm_leads", sourceId: "L1" };
    const r1 = await emitConversionEvent(db, input, { enqueue: enq, complete });
    const r2 = await emitConversionEvent(db, input, { enqueue: enq, complete });
    expect(r1.providers[0].outcome).toBe("queued_dry_run");
    expect(r2.providers[0].outcome).toBe("duplicate");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(enq.mock.calls[0][0].payload.send_mode).toBe("dry_run");
    expect(resolveSendMode({ send_mode: "live" })).toBe("dry_run");
  });
  it("helper failure never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(safeEmitConversion({ kind: "lead_created", leadId: "L", sourceType: "crm_leads", sourceId: "L" }, async () => { throw new Error("boom"); })).resolves.toBeUndefined();
    spy.mockRestore();
  });
  it("dry-run scan rejects records without identity", () => {
    const r = classifyCandidates([{ crm_lead_id: "a", gclid: "G" }, { crm_lead_id: "b" }, { crm_lead_id: "c", fbclid: "F" }], [{ id: "m" }]);
    expect(r).toEqual({ dryRun: true, googleCandidates: 1, metaCandidates: 2, rejectedNoIdentity: 1 });
  });
});
