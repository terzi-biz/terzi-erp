import { describe, expect, it } from "vitest";
import { CANONICAL_CHANNELS, acceptsSpend, getChannel, resolveChannel } from "@/lib/marketing/channels";

describe("канонічний реєстр каналів", () => {
  it("ключі унікальні", () => {
    const keys = CANONICAL_CHANNELS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("click id має пріоритет над текстовим джерелом", () => {
    expect(resolveChannel({ source: "instagram", gclid: "abc" })?.key).toBe("google_ads");
    expect(resolveChannel({ source: "olx", fbclid: "x" })?.key).toBe("meta_ads");
  });

  it("розрізняє рекламу і органіку", () => {
    expect(resolveChannel({ utm_source: "facebook ads" })?.key).toBe("meta_ads");
    expect(resolveChannel({ utm_source: "facebook" })?.key).toBe("facebook");
    expect(acceptsSpend("meta_ads")).toBe(true);
    expect(acceptsSpend("facebook")).toBe(false);
  });

  it("нормалізує месенджери й маркетплейси", () => {
    expect(resolveChannel({ source: "Вайбер" })?.key).toBe("viber");
    expect(resolveChannel({ source: "WhatsApp" })?.key).toBe("whatsapp");
    expect(resolveChannel({ source: "OLX оголошення" })?.key).toBe("olx");
    expect(resolveChannel({ source: "Телеграм" })?.key).toBe("telegram");
  });

  it("невідоме джерело не вигадується", () => {
    expect(resolveChannel({ source: "хтось порадив по радіо" })).toBeNull();
    expect(resolveChannel({})).toBeNull();
    expect(getChannel("nope")).toBeNull();
  });
});
