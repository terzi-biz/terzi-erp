import { describe, expect, it, vi, beforeEach } from "vitest";

let token: string | null = "s3cret-token";

vi.mock("../ops.server", () => ({
  binotelCreds: async () => ({ key: "k", secret: "s", companyId: "1", webhookToken: token }),
}));

const { verifyBinotelToken, parseBinotelBody } = await import("../webhook.server");

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

beforeEach(() => {
  token = "s3cret-token";
});

describe("verifyBinotelToken", () => {
  it("приймає токен у query", async () => {
    expect(await verifyBinotelToken(req("https://erp.test/hook?token=s3cret-token"), null)).toBe(true);
  });

  it("приймає токен у заголовку", async () => {
    expect(await verifyBinotelToken(req("https://erp.test/hook", { "x-endpoint-token": "s3cret-token" }), null)).toBe(true);
  });

  it("відхиляє невірний токен", async () => {
    expect(await verifyBinotelToken(req("https://erp.test/hook?token=wrong"), null)).toBe(false);
  });

  it("відхиляє запит без токена", async () => {
    expect(await verifyBinotelToken(req("https://erp.test/hook"), null)).toBe(false);
  });

  it("відхиляє токен іншої довжини (без витоку через порівняння)", async () => {
    expect(await verifyBinotelToken(req("https://erp.test/hook?token=s3cret"), null)).toBe(false);
  });

  it("забороняє доступ, якщо токен не налаштовано", async () => {
    token = null;
    expect(await verifyBinotelToken(req("https://erp.test/hook?token="), null)).toBe(false);
  });
});

describe("parseBinotelBody", () => {
  it("розбирає JSON", () => {
    expect(parseBinotelBody('{"generalCallID":"1"}', "application/json")).toEqual({ generalCallID: "1" });
  });

  it("розбирає form-urlencoded", () => {
    expect(parseBinotelBody("generalCallID=1&disposition=ANSWER", "application/x-www-form-urlencoded")).toEqual({
      generalCallID: "1",
      disposition: "ANSWER",
    });
  });

  it("не падає на порожньому чи некоректному тілі", () => {
    expect(parseBinotelBody("", null)).toEqual({});
    expect(parseBinotelBody("<<broken>>", "application/json")).toHaveProperty("raw");
  });
});
