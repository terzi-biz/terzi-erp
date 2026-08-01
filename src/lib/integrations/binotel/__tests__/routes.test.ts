import { describe, expect, it, vi, beforeEach } from "vitest";

const handleCallSettings = vi.fn();
const handleCallCompleted = vi.fn();
const enqueueEvent = vi.fn(async () => ({ id: "evt-1" }));
const logAttempt = vi.fn(async () => {});
let tokenOk = true;

vi.mock("@/lib/integrations/binotel/webhook.server", () => ({
  verifyBinotelToken: async () => tokenOk,
  parseBinotelBody: (raw: string) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@/lib/integrations/binotel/calls.server", () => ({ handleCallSettings, handleCallCompleted }));
vi.mock("@/lib/integrations/binotel/ops.server", () => ({ getBinotelIntegration: async () => ({ id: "int-1" }) }));
vi.mock("@/lib/integrations/core.server", () => ({ enqueueEvent, logAttempt }));

const settingsRoute = (await import("@/routes/api/public/integrations/binotel/call-settings")).Route as any;
const completedRoute = (await import("@/routes/api/public/integrations/binotel/call-completed")).Route as any;

const settingsPost = settingsRoute.options.server.handlers.POST;
const completedPost = completedRoute.options.server.handlers.POST;

function post(body: unknown) {
  return new Request("https://erp.test/api/public/integrations/binotel/call-completed?token=x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  tokenOk = true;
  vi.clearAllMocks();
  handleCallSettings.mockResolvedValue({ response: { customerData: { name: "Клієнт" } }, matched: true });
  handleCallCompleted.mockResolvedValue({ call_id: "c1", status: "missed", created_lead: true, task_id: "t1" });
});

describe("call-settings route", () => {
  it("повертає 401 без валідного токена і не викликає обробник", async () => {
    tokenOk = false;
    const res = await settingsPost({ request: post({ generalCallID: "1" }) });
    expect(res.status).toBe(401);
    expect(handleCallSettings).not.toHaveBeenCalled();
  });

  it("повертає картку клієнта при валідному токені", async () => {
    const res = await settingsPost({ request: post({ generalCallID: "1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customerData: { name: "Клієнт" } });
  });

  it("при помилці обробки не ламає маршрутизацію дзвінка", async () => {
    handleCallSettings.mockRejectedValue(new Error("db down"));
    const res = await settingsPost({ request: post({ generalCallID: "1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customerData: {} });
  });

  it("GET не дозволено", async () => {
    const res = await settingsRoute.options.server.handlers.GET();
    expect(res.status).toBe(405);
  });
});

describe("call-completed route", () => {
  it("повертає 401 без валідного токена", async () => {
    tokenOk = false;
    const res = await completedPost({ request: post({ generalCallID: "1" }) });
    expect(res.status).toBe(401);
    expect(handleCallCompleted).not.toHaveBeenCalled();
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it("реєструє подію з ключем ідемпотентності за generalCallID", async () => {
    const res = await completedPost({ request: post({ generalCallID: "GC-77" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, call_id: "c1" });
    expect(enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "binotel:call_completed:GC-77", entityId: "GC-77", eventType: "binotel.call_completed" }),
    );
  });

  it("повторний виклик використовує той самий ключ ідемпотентності", async () => {
    await completedPost({ request: post({ generalCallID: "GC-77" }) });
    await completedPost({ request: post({ generalCallID: "GC-77" }) });
    const keys = enqueueEvent.mock.calls.map((c: any[]) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("повертає 500 при помилці обробки", async () => {
    handleCallCompleted.mockRejectedValue(new Error("boom"));
    const res = await completedPost({ request: post({ generalCallID: "GC-9" }) });
    expect(res.status).toBe(500);
  });
});
