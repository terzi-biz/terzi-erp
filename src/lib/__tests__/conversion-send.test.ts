import { describe, it, expect, vi } from "vitest";
import { buildConversionDraft } from "../integrations/conversions";
import { sendGoogleConversion, sendMetaConversion, normalizeConversionAction, toGoogleDateTime, redact } from "../integrations/foundation/conversion-send.server";
import { contractStatus, FOUNDATION_CONTRACTS } from "../integrations/contracts";

const sha = (s: string) => `h(${s})`;
const base = { sourceType: "crm_leads", sourceId: "L1", occurredAt: "2026-09-24T10:00:00+03:00", origin: "crm" as const, sha256: sha, phoneE164: "+380501234567", email: "a@b.c" };
const gEnv = { clientId: "c", clientSecret: "s", refreshToken: "r", developerToken: "DEVTOKEN123", customerId: "1234567890", loginCustomerId: null };
const gDraft = () => buildConversionDraft({ ...base, provider: "google_ads", kind: "lead_created", adUserDataConsent: "unknown", click: { gclid: "GCLIDSECRET" }, clickAt: { gclid: "2026-09-20T00:00:00Z" } }).payload!;
const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ results: [{}], events_received: 1 }), { status: 200 }));

describe("W2.2 consent", () => {
  it("unknown ≠ denied, no hashes, no Google consent", () => {
    const g = gDraft(); expect(g).not.toHaveProperty("ad_user_data_consent");
    const m = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", adUserDataConsent: "unknown", click: {}, metaLeadId: "M" });
    expect((m.payload as any).user_data).toEqual({ lead_id: "M" });
  });
  it("denied: no hashes, Google consent DENIED", () => {
    const g = buildConversionDraft({ ...base, provider: "google_ads", kind: "lead_created", adUserDataConsent: "denied", click: { gclid: "G" } });
    expect(g.payload).toMatchObject({ ad_user_data_consent: "DENIED" });
    const m = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", adUserDataConsent: "denied", click: {}, metaLeadId: "M" });
    expect((m.payload as any).user_data).not.toHaveProperty("ph");
  });
  it("granted hashes", () => {
    const m = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", adUserDataConsent: "granted", click: {} });
    expect((m.payload as any).user_data).toMatchObject({ ph: ["h(380501234567)"], em: ["h(a@b.c)"] });
  });
  it("fbclid without real touch time: no fbc, blocked", () => {
    const m = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", adUserDataConsent: "unknown", click: { fbclid: "F" } });
    expect(m.ready).toBe(false);
    const ok = buildConversionDraft({ ...base, provider: "meta_ads", kind: "lead_created", adUserDataConsent: "unknown", click: { fbclid: "F" }, fbclidAt: "2026-09-20T08:00:00Z" });
    expect((ok.payload as any).user_data.fbc).toBe(`fb.1.${Date.parse("2026-09-20T08:00:00Z")}.F`);
  });
});

describe("W2.2 Google", () => {
  it("action normalization + date", () => {
    expect(normalizeConversionAction("987", "123-456-7890")).toBe("customers/1234567890/conversionActions/987");
    expect(normalizeConversionAction("customers/1234567890/conversionActions/987", "1234567890")).toBe("customers/1234567890/conversionActions/987");
    expect(normalizeConversionAction("customers/999/conversionActions/987", "1234567890")).toBe("customers/1234567890/conversionActions/987");
    expect(normalizeConversionAction("customers/999/conversionActions/x", "1234567890")).toBeNull();
    expect(normalizeConversionAction("TERZI Lead", "1234567890")).toBeNull();
    expect(toGoogleDateTime("2026-09-24T10:00:00+03:00")).toBe("2026-09-24 07:00:00+00:00");
  });
  it("off/dry_run/live never fetch", async () => {
    const f = okFetch();
    for (const [p, c] of [["off", "test"], ["dry_run", "test"], ["test", "dry_run"], ["live", "live"], ["test", "live"], [undefined, undefined]]) {
      const r = await sendGoogleConversion({ draft: gDraft(), kind: "lead_created", config: { send_mode: c, conversion_actions: { lead_created: "1" } }, payloadMode: p }, { fetch: f as any, env: gEnv, accessToken: async () => "T" });
      if (p === "live" || c === "live") expect(r.state).toBe("blocked");
      const m = await sendMetaConversion({ draft: {}, config: { send_mode: c, dataset_id: "D", test_event_code: "X" }, payloadMode: p }, { fetch: f as any, env: { META_ADS_ACCESS_TOKEN: "t" } });
      expect(m.state === "skipped" || m.state === "blocked").toBe(true);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("test mode = validateOnly + partialFailure, v25", async () => {
    const f = okFetch();
    const r = await sendGoogleConversion({ draft: gDraft(), kind: "lead_created", config: { send_mode: "test", conversion_actions: { lead_created: "55" } }, payloadMode: "test" }, { fetch: f as any, env: gEnv, accessToken: async () => "T" });
    expect(r.state).toBe("validated");
    const [url, init] = (f.mock.calls[0] as any[]);
    expect(url).toBe("https://googleads.googleapis.com/v25/customers/1234567890:uploadClickConversions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ validateOnly: true, partialFailure: true });
    expect(body.conversions[0]).toMatchObject({ conversionAction: "customers/1234567890/conversionActions/55", gclid: "GCLIDSECRET", conversionDateTime: "2026-09-24 07:00:00+00:00" });
    expect(body.conversions[0].orderId).toMatch(/^conv:google_ads:lead_created:crm_leads:L1$/);
    expect(body.conversions[0]).not.toHaveProperty("consent");
  });
  it("missing config/credentials: blocked, no fetch; errors redacted", async () => {
    const f = okFetch();
    const r = await sendGoogleConversion({ draft: gDraft(), kind: "lead_created", config: { send_mode: "test" }, payloadMode: "test" }, { fetch: f as any, env: gEnv, accessToken: async () => "T" });
    expect(r.state).toBe("blocked");
    const r2 = await sendGoogleConversion({ draft: gDraft(), kind: "lead_created", config: { send_mode: "test", conversion_actions: { lead_created: "1" } }, payloadMode: "test" }, { fetch: f as any, env: { ...gEnv, developerToken: null } as any });
    expect(r2.message).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
    expect(f).not.toHaveBeenCalled();
    const bad = vi.fn(async () => new Response(JSON.stringify({ partialFailureError: { message: "bad gclid GCLIDSECRET token=TKN DEVTOKEN123" } }), { status: 200 }));
    const r3 = await sendGoogleConversion({ draft: gDraft(), kind: "lead_created", config: { send_mode: "test", conversion_actions: { lead_created: "1" } }, payloadMode: "test" }, { fetch: bad as any, env: gEnv, accessToken: async () => "TKN" });
    expect(r3.message).not.toMatch(/GCLIDSECRET|TKN|DEVTOKEN123/);
    expect(redact("x a@b.com +380 50 123 45 67")).not.toMatch(/a@b|380/);
  });
  it("contract readiness accepts gateway or OAuth env", () => {
    const c = FOUNDATION_CONTRACTS.google_ads;
    expect(contractStatus(c, { LOVABLE_API_KEY: "a", GOOGLE_ADS_API_KEY: "b", GOOGLE_ADS_CUSTOMER_ID: "1" }).state).toBe("ready");
    expect(contractStatus(c, {}).missing).toContain("GOOGLE_OAUTH_CLIENT_ID");
  });
});

describe("W2.2 Meta", () => {
  const draft = { event_name: "Lead", event_time: 1, event_id: "conv:x", action_source: "system_generated", user_data: { lead_id: "M" } };
  it("requires test_event_code + dataset", async () => {
    const f = okFetch();
    const a = await sendMetaConversion({ draft, config: { send_mode: "test", dataset_id: "D" }, payloadMode: "test" }, { fetch: f as any, env: { META_ADS_ACCESS_TOKEN: "t" } });
    expect(a.message).toContain("test_event_code");
    const b = await sendMetaConversion({ draft, config: { send_mode: "test", test_event_code: "X" }, payloadMode: "test" }, { fetch: f as any, env: { META_ADS_ACCESS_TOKEN: "t" } });
    expect(b.message).toContain("META_DATASET_ID");
    expect(f).not.toHaveBeenCalled();
    const c = await sendMetaConversion({ draft, config: { send_mode: "test", test_event_code: "X" }, payloadMode: "test" }, { fetch: f as any, env: { META_ADS_ACCESS_TOKEN: "SECRETTOKEN", META_PIXEL_ID: "P1" } });
    expect(c.state).toBe("test_sent");
    const body = JSON.parse((f.mock.calls[0] as any[])[1].body);
    expect(body).toMatchObject({ test_event_code: "X", data: [{ event_id: "conv:x", action_source: "system_generated" }] });
    expect(String((f.mock.calls[0] as any[])[0])).not.toContain("SECRETTOKEN");
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid SECRETTOKEN" } }), { status: 400 }));
    const d = await sendMetaConversion({ draft, config: { send_mode: "test", test_event_code: "X", dataset_id: "D" }, payloadMode: "test" }, { fetch: bad as any, env: { META_ADS_ACCESS_TOKEN: "SECRETTOKEN" } });
    expect(d.message).not.toContain("SECRETTOKEN");
  });
});

describe("W2.2 Google corrections", () => {
  const g = (o: any) => buildConversionDraft({ ...base, provider: "google_ads", kind: "lead_created", adUserDataConsent: "unknown", click: { gclid: "G" }, clickAt: { gclid: "2026-09-20T00:00:00Z" }, ...o });
  it("click time required and before conversion", () => {
    expect(g({ clickAt: {} }).blocked).toContain("часу кліку");
    expect(g({ clickAt: { gclid: "2026-09-24T07:00:00Z" } }).ready).toBe(false);
    expect(g({ clickAt: { gclid: "2026-09-25T00:00:00Z" } }).ready).toBe(false);
    expect(g({}).payload).toMatchObject({ click_at: "2026-09-20T00:00:00Z" });
    // selected id's own time is used (wbraid chosen on WEB)
    expect(g({ click: { gbraid: "B", wbraid: "W" }, clickAt: { gbraid: "2026-09-20T00:00:00Z" } }).ready).toBe(false);
  });
  it("WEB environment only when known", () => {
    expect(g({ environment: "WEB" }).payload).toMatchObject({ conversion_environment: "WEB" });
    expect(g({}).payload).not.toHaveProperty("conversion_environment");
  });
  it("userIdentifiers only when granted", async () => {
    expect(g({ adUserDataConsent: "granted" }).payload!.user_identifiers).toEqual([{ hashedPhoneNumber: "h(+380501234567)" }, { hashedEmail: "h(a@b.c)" }]);
    expect(g({ adUserDataConsent: "denied" }).payload).not.toHaveProperty("user_identifiers");
    expect(g({}).payload).not.toHaveProperty("user_identifiers");
    const f = okFetch();
    await sendGoogleConversion({ draft: g({ adUserDataConsent: "granted", environment: "WEB" }).payload, kind: "lead_created", config: { send_mode: "test", conversion_actions: { lead_created: "1" } }, payloadMode: "test" }, { fetch: f as any, env: gEnv, accessToken: async () => "T" });
    const c = JSON.parse((f.mock.calls[0] as any[])[1].body).conversions[0];
    expect(c).toMatchObject({ conversionEnvironment: "WEB", consent: { adUserData: "GRANTED" } });
    expect(c.userIdentifiers).toHaveLength(2);
  });
  it("payment requires finance_transactions, distinct orderId", () => {
    expect(g({ kind: "payment_received", paymentAmount: 10 }).ready).toBe(false);
    const a = g({ kind: "payment_received", sourceType: "finance_transactions", sourceId: "T1", paymentAmount: 10 });
    const b = g({ kind: "payment_received", sourceType: "finance_transactions", sourceId: "T2", paymentAmount: 10 });
    expect(a.ready && b.ready).toBe(true);
    expect(a.payload!.transaction_id).not.toBe(b.payload!.transaction_id);
  });
});
