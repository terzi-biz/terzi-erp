import { describe, expect, it } from "vitest";
import {
  buildIdempotencyKey,
  checkReplayWindow,
  classifyError,
  effectiveStatus,
} from "../webhook-core";
import { classifyBinotelEvent } from "../binotel/events";
import { normalizePhone, toE164, samePhone } from "@/lib/phone";

describe("idempotency", () => {
  const base = { providerKey: "binotel", integrationId: "i1", eventType: "binotel.call_completed", payloadHash: "h1" };

  it("надає пріоритет provider_event_id", () => {
    const a = buildIdempotencyKey({ ...base, providerEventId: "call:42", adapterKey: "binotel:x" });
    expect(a).toEqual({ key: "binotel:call:42", source: "provider_event_id" });
  });

  it("повторна доставка тієї самої події дає той самий ключ", () => {
    const a = buildIdempotencyKey({ ...base, providerEventId: "call:42" });
    const b = buildIdempotencyKey({ ...base, providerEventId: "call:42" });
    expect(a.key).toBe(b.key);
  });

  it("різні події не колізують", () => {
    const a = buildIdempotencyKey({ ...base, payloadHash: "h1" });
    const b = buildIdempotencyKey({ ...base, payloadHash: "h2" });
    expect(a.key).not.toBe(b.key);
    expect(a.source).toBe("payload_hash");
  });

  it("використовує ключ адаптера, коли немає provider_event_id", () => {
    expect(buildIdempotencyKey({ ...base, adapterKey: "binotel:manual" })).toEqual({
      key: "binotel:manual",
      source: "adapter_key",
    });
  });
});

describe("replay-захист", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");

  it("свіжа подія проходить", () => {
    expect(checkReplayWindow("binotel", "2026-08-28T11:59:00.000Z", now).replay).toBe(false);
  });

  it("стара подія поза вікном провайдера відхиляється", () => {
    const res = checkReplayWindow("binotel", "2026-08-28T02:00:00.000Z", now);
    expect(res.replay).toBe(true);
    expect(res.windowMin).toBe(360);
  });

  it("подія з майбутнього відхиляється", () => {
    expect(checkReplayWindow("binotel", "2026-08-28T13:00:00.000Z", now).replay).toBe(true);
  });

  it("відсутній час події не блокує обробку", () => {
    expect(checkReplayWindow("binotel", null, now).replay).toBe(false);
  });
});

describe("класифікація помилок", () => {
  it("5xx і 429 повторюємо", () => {
    expect(classifyError({ httpStatus: 503 })).toBe("retryable");
    expect(classifyError({ httpStatus: 429 })).toBe("retryable");
  });

  it("4xx та відомі постійні помилки не повторюємо", () => {
    expect(classifyError({ httpStatus: 401 })).toBe("permanent");
    expect(classifyError({ message: "Підключення не знайдено" })).toBe("permanent");
    expect(classifyError({ message: "Invalid signature" })).toBe("permanent");
  });

  it("unsupported — окремий термінальний клас", () => {
    expect(classifyError({ unsupported: true, message: "echo.ping" })).toBe("unsupported");
  });

  it("похідний статус для UI", () => {
    expect(effectiveStatus({ status: "dead", unsupported: true })).toBe("unsupported_event");
    expect(effectiveStatus({ status: "failed" })).toBe("failed");
  });
});

describe("події Binotel", () => {
  it("розпізнає завершений дзвінок", () => {
    const c = classifyBinotelEvent({ event: "callCompleted", generalCallID: "77", billsec: 42 });
    expect(c.supported).toBe(true);
    expect(c.eventType).toBe("binotel.call_completed");
    expect(c.providerEventId).toBe("binotel.call_completed:77");
  });

  it("розпізнає налаштування дзвінка", () => {
    expect(classifyBinotelEvent({ event: "callSettings", generalCallID: "9" }).eventType).toBe("binotel.call_settings");
  });

  it("echo.ping не підтримується і не є успіхом", () => {
    const c = classifyBinotelEvent({ event: "echo.ping" });
    expect(c.supported).toBe(false);
    expect(c.eventType).toBe("binotel.echo.ping");
    expect(c.reason).toContain("не підтримується");
  });

  it("невідома подія не підтримується", () => {
    expect(classifyBinotelEvent({ event: "someNewEvent", generalCallID: "5" }).supported).toBe(false);
  });

  it("подія без назви, але з ознаками дзвінка, приймається", () => {
    expect(classifyBinotelEvent({ generalCallID: "5", disposition: "ANSWERED" }).supported).toBe(true);
  });

  it("витягує час події для replay-вікна", () => {
    expect(classifyBinotelEvent({ event: "callCompleted", generalCallID: "1", startTime: "1756382400" }).eventTs)
      .toBe(new Date(1756382400000).toISOString());
  });
});

describe("E.164", () => {
  it("нормалізує українські формати до одного значення", () => {
    const variants = ["0671234567", "+380671234567", "380671234567", "(067) 123-45-67"];
    const e164 = variants.map((v) => toE164(v));
    expect(new Set(e164).size).toBe(1);
    expect(e164[0]).toBe("+380671234567");
  });

  it("не ламає короткі та невалідні номери", () => {
    expect(toE164("101")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("порівняння номерів не залежить від форматування", () => {
    expect(samePhone("067 123 45 67", "+380671234567")).toBe(true);
    expect(samePhone("0671234567", "0671234568")).toBe(false);
  });
});
