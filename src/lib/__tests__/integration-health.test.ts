import { describe, it, expect } from "vitest";
import { PROVIDERS, normalizeHealth } from "../integrations/health";

const meta = PROVIDERS.find((p) => p.id === "meta_ads")!;
const now = Date.parse("2026-09-24T00:00:00Z");

describe("integration health", () => {
  it("one record per provider, all required covered", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["finmap","binotel","keycrm","google_ads","meta_ads","ga4","site_forms","gtm","tiktok_ads","whatsapp","telegram","viber","olx"]) expect(ids).toContain(id);
  });
  it("env presence alone is not connected", () => {
    expect(normalizeHealth(meta, { envConfigured: true }, now).state).toBe("configured");
  });
  it("legacy connected is labelled legacy, not connected", () => {
    expect(normalizeHealth(meta, { legacy: { status: "connected" } }, now).state).toBe("legacy");
  });
  it("recent successful test → connected", () => {
    expect(normalizeHealth(meta, { canonical: { lastTestAt: "2026-09-23T00:00:00Z", lastTestOk: true } }, now).state).toBe("connected");
  });
  it("newer failure → error", () => {
    const h = normalizeHealth(meta, { lastSyncAt: "2026-09-20T00:00:00Z", canonical: { lastErrorAt: "2026-09-22T00:00:00Z", lastError: "401" } }, now);
    expect(h.state).toBe("error");
    expect(h.lastError).toBe("401");
  });
  it("old success → degraded", () => {
    expect(normalizeHealth(meta, { lastSyncAt: "2026-08-01T00:00:00Z" }, now).state).toBe("degraded");
  });
  it("nothing → not_configured", () => {
    expect(normalizeHealth(meta, {}, now).state).toBe("not_configured");
  });
});

describe("event evidence is informational only", () => {
  it("recent inbound event alone is not connected", () => {
    const h = normalizeHealth(meta, { lastEventAt: "2026-09-23T00:00:00Z", envConfigured: true }, now);
    expect(h.state).toBe("configured");
    expect(h.lastEventAt).toBe("2026-09-23T00:00:00Z");
  });
  it("recent event cannot mask a failed test", () => {
    expect(normalizeHealth(meta, { lastEventAt: "2026-09-23T12:00:00Z", canonical: { lastTestAt: "2026-09-23T00:00:00Z", lastTestOk: false } }, now).state).toBe("error");
  });
  it("recent successful sync with event → connected", () => {
    expect(normalizeHealth(meta, { lastEventAt: "2026-09-23T00:00:00Z", lastSyncAt: "2026-09-22T00:00:00Z" }, now).state).toBe("connected");
  });
});
