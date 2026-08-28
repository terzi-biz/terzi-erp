import { describe, expect, it } from "vitest";
import { dryRunIdentity, normalizeEmail, resolveIdentity, type IdentityCandidate } from "../identity";
import { extractAttribution, attributionToJson, hasClickId } from "@/lib/marketing/attribution-fields";
import { prepareOfflineConversion } from "@/lib/integrations/conversions";
import { FOUNDATION_CONTRACTS, contractStatus, listFoundationContracts } from "@/lib/integrations/contracts";
import { finmapIdempotencyKey, planFinmapSync } from "@/lib/integrations/foundation/finmap.server";

const clients: IdentityCandidate[] = [
  { id: "c1", externalSource: "keycrm", externalId: "777", phone: "0671234567", email: "Ivan.Petrenko@gmail.com" },
  { id: "c2", phone: "+380509998877", email: "office@terzi.com.ua" },
  { id: "c3", phone: "067 123 45 67", email: "other@terzi.com.ua" },
];

describe("CRM identity resolver", () => {
  it("external ID має найвищий пріоритет і дає exact", () => {
    const r = resolveIdentity({ externalSource: "keycrm", externalId: "777" }, clients.slice(0, 2));
    expect(r).toMatchObject({ status: "exact", matchBy: "external_id", id: "c1" });
  });

  it("телефон у різних форматах дає unique", () => {
    const r = resolveIdentity({ phone: "+380509998877" }, clients);
    expect(r).toMatchObject({ status: "unique", matchBy: "phone_e164", id: "c2" });
  });

  it("кілька записів з тим самим номером → ambiguous", () => {
    const r = resolveIdentity({ phone: "0671234567" }, clients);
    expect(r.status).toBe("ambiguous");
    expect(r.candidateIds.sort()).toEqual(["c1", "c3"]);
  });

  it("телефон і e-mail вказують на різні записи → conflict", () => {
    const r = resolveIdentity({ phone: "+380509998877", email: "other@terzi.com.ua" }, clients);
    expect(r.status).toBe("conflict");
    expect(r.id).toBeNull();
    expect(r.candidateIds.sort()).toEqual(["c2", "c3"]);
  });

  it("немає жодної ознаки → not_found", () => {
    expect(resolveIdentity({ phone: "101" }, clients).status).toBe("not_found");
  });

  it("нормалізація e-mail: регістр, крапки та +тег у gmail", () => {
    expect(normalizeEmail(" Ivan.Petrenko+erp@GMail.com ")).toBe("ivanpetrenko@gmail.com");
    expect(normalizeEmail("Office@Terzi.com.ua")).toBe("office@terzi.com.ua");
    expect(normalizeEmail("не e-mail")).toBeNull();
  });

  it("dry-run лише рахує і нічого не змінює", () => {
    const report = dryRunIdentity({
      leads: [
        { id: "l1", client_id: "c2", contact_id: "k1", external_source: null, external_id: null },
        { id: "l2", client_id: null, contact_id: "k1", external_source: null, external_id: null },
        { id: "l3", client_id: null, contact_id: null, external_source: "keycrm", external_id: "777" },
      ],
      calls: [
        { id: "call1", lead_id: null, client_id: null, contact_id: null, phone_e164: "+380509998877", phone_norm: null, external_id: null, external_source: null },
        { id: "call2", lead_id: "l1", client_id: null, contact_id: null, phone_e164: null, phone_norm: "0501112233", external_id: null, external_source: null },
      ],
      clients,
      contacts: [{ id: "k1", phone: "+380509998877", relationId: "c2", email: null }],
    });
    expect(report.mode).toBe("read_only");
    expect(report.leadToClient.total).toBe(3);
    expect(report.leadToClient.alreadyLinked).toBe(1);
    expect(report.leadToClient.exact).toBeGreaterThanOrEqual(2);
    expect(report.callToClient.unique).toBe(1);
    expect(report.callToLead.alreadyLinked).toBe(1);
  });
});

describe("атрибуція вебформи", () => {
  it("зчитує utm, click id, GA4 і landing_url", () => {
    const a = extractAttribution({
      landing_url: "https://terzi.com.ua/screed?utm_source=google&utm_medium=cpc&gclid=abc123&gbraid=gb1",
      utm: { campaign: "screed-odesa", content: "banner-1", term: "стяжка" },
      ga4: { client_id: "GA1.1.55", session_id: "1756382400" },
      form_id: "hero-form",
      wbraid: "wb9",
      fbclid: "fb77",
      ttclid: "tt5",
      first_touch: "2026-08-01T10:00:00Z",
      last_touch: "2026-08-28T09:00:00Z",
    });
    expect(a).toMatchObject({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "screed-odesa",
      utm_content: "banner-1",
      utm_term: "стяжка",
      gclid: "abc123",
      gbraid: "gb1",
      wbraid: "wb9",
      fbclid: "fb77",
      ttclid: "tt5",
      form_id: "hero-form",
      ga_client_id: "GA1.1.55",
      ga_session_id: "1756382400",
    });
    expect(a.landing_url).toContain("terzi.com.ua");
    expect(a.first_touch_at).toBe("2026-08-01T10:00:00.000Z");
    expect(hasClickId(a)).toBe(true);
  });

  it("порожні поля не вигадуються", () => {
    const a = extractAttribution({ name: "Іван" });
    expect(attributionToJson(a)).toEqual({});
    expect(hasClickId(a)).toBe(false);
  });
});

describe("офлайн-конверсії (лише підготовка)", () => {
  it("Google без click id не готовий", () => {
    const r = prepareOfflineConversion({ provider: "google_ads", stage: "lead", attribution: {}, occurredAt: "2026-08-28T10:00:00Z" });
    expect(r.ready).toBe(false);
    expect(r.blocked).toContain("gclid");
  });

  it("Google lead з gbraid готовий і без грошей", () => {
    const r = prepareOfflineConversion({ provider: "google_ads", stage: "lead", attribution: { gbraid: "gb1" }, occurredAt: "2026-08-28T10:00:00Z" });
    expect(r.ready).toBe(true);
    expect(r.payload).toMatchObject({ gbraid: "gb1" });
    expect((r.payload as any).conversion_value).toBeUndefined();
  });

  it("оплата без фактичної суми не відправляється", () => {
    const r = prepareOfflineConversion({ provider: "meta_ads", stage: "payment", attribution: { fbclid: "fb1" }, occurredAt: "2026-08-28T10:00:00Z" });
    expect(r.ready).toBe(false);
    expect(r.blocked).toBe("Немає фактичної оплати");
  });

  it("оплата з фактичною сумою формує value", () => {
    const r = prepareOfflineConversion({ provider: "meta_ads", stage: "payment", attribution: { fbclid: "fb1" }, occurredAt: "2026-08-28T10:00:00Z", paidAmount: 15000 });
    expect(r.ready).toBe(true);
    expect((r.payload as any).custom_data).toEqual({ value: 15000, currency: "UAH" });
  });
});

describe("контракти Integration Foundation", () => {
  it("описано п'ять провайдерів, Binotel/keyCRM не переписуються", () => {
    const keys = listFoundationContracts().map((c) => c.key).sort();
    expect(keys).toEqual(["finmap", "ga4", "google_ads", "meta_ads", "website"]);
  });

  it("без credentials стан blocked, без імітації підключення", () => {
    const s = contractStatus(FOUNDATION_CONTRACTS.google_ads!, {});
    expect(s.state).toBe("blocked");
    expect(s.missing.length).toBeGreaterThan(0);
    expect(s.message).not.toMatch(/підключено|connected/i);
  });

  it("з ключами стан ready, але виклики вимкнено", () => {
    const s = contractStatus(FOUNDATION_CONTRACTS.website!, { LEAD_INTAKE_SECRET: "x" });
    expect(s).toMatchObject({ state: "ready", missing: [] });
  });

  it("Finmap: idempotency-ключ і план дзеркалення без дублів", () => {
    const key = finmapIdempotencyKey({ entity: "operation", externalId: 42, updatedAt: "2026-08-28T10:00:00Z" });
    expect(key).toBe("finmap:operation:42:2026-08-28T10:00:00Z");
    const plan = planFinmapSync({ last_sync_at: "2026-08-27T00:00:00Z" }, { id: 42 }, "finmap.operation");
    expect(plan).toMatchObject({ entity: "operation", state: "blocked", mirrorOnly: true, lastSyncAt: "2026-08-27T00:00:00Z", error: null });
  });
});
