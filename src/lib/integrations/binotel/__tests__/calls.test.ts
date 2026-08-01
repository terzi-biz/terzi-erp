import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFakeDb } from "./fake-db";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

let db: ReturnType<typeof createFakeDb>;

vi.mock("@/lib/access.server", () => ({
  admin: async () => db,
}));
vi.mock("../../keycrm/sync.server", () => ({
  normPhone: (v: any) => {
    const digits = String(v ?? "").replace(/\D/g, "");
    if (!digits) return null;
    return digits.length >= 10 ? `+${digits.length === 10 ? "38" + digits : digits}` : null;
  },
}));

const { handleCallCompleted, handleCallSettings, parseBinotelCall } = await import("../calls.server");

function seed(extra: Record<string, any[]> = {}) {
  db = createFakeDb({
    user_roles: [{ user_id: ADMIN_ID, role: "admin", created_at: "2024-01-01" }],
    binotel_settings: [
      {
        integration_id: null,
        auto_create_lead: true,
        auto_create_contact: true,
        auto_create_missed_task: true,
        route_to_assigned_manager: true,
        missed_sla_minutes: 30,
      },
    ],
    ...extra,
  });
}

const missedInbound = {
  generalCallID: "GC-1001",
  companyID: "95560",
  callType: "0",
  externalNumber: "0671234567",
  internalNumber: "101",
  pbxNumber: "0442290000",
  pbxNumberName: "Головний номер",
  disposition: "NOANSWER",
  billsec: "0",
  waitsec: "12",
  startTime: "1717000000",
};

beforeEach(() => seed());

describe("parseBinotelCall", () => {
  it("нормалізує напрямок, статус і телефон", () => {
    const call = parseBinotelCall(missedInbound);
    expect(call.generalCallId).toBe("GC-1001");
    expect(call.direction).toBe("inbound");
    expect(call.isMissed).toBe(true);
    expect(call.durationSec).toBe(0);
    expect(call.waitSec).toBe(12);
    expect(call.phoneNorm).toBe("+380671234567");
  });

  it("відповідений дзвінок не вважається пропущеним", () => {
    const call = parseBinotelCall({ ...missedInbound, disposition: "ANSWER", billsec: "65" });
    expect(call.isMissed).toBe(false);
    expect(call.durationSec).toBe(65);
    expect(call.answeredAt).toBeTruthy();
  });
});

describe("handleCallCompleted", () => {
  it("створює контакт, лід, дзвінок і задачу по пропущеному", async () => {
    const res = await handleCallCompleted(null, missedInbound);
    expect(res.created_contact).toBe(true);
    expect(res.created_lead).toBe(true);
    expect(res.missed).toBe(true);
    expect(res.task_id).toBeTruthy();
    expect(db.rows("crm_contacts")).toHaveLength(1);
    expect(db.rows("crm_leads")).toHaveLength(1);
    expect(db.rows("crm_calls")).toHaveLength(1);
    expect(db.rows("crm_tasks")).toHaveLength(1);
    expect(db.rows("crm_tasks")[0]!.external_key).toBe("binotel:missed:GC-1001");
    expect(db.rows("crm_calls")[0]!.external_id).toBe("GC-1001");
  });

  it("є ідемпотентним за generalCallID", async () => {
    await handleCallCompleted(null, missedInbound);
    const second = await handleCallCompleted(null, missedInbound);
    expect(db.rows("crm_calls")).toHaveLength(1);
    expect(db.rows("crm_tasks")).toHaveLength(1);
    expect(db.rows("crm_contacts")).toHaveLength(1);
    expect(db.rows("crm_leads")).toHaveLength(1);
    expect(second.created_contact).toBe(false);
    expect(second.created_lead).toBe(false);
  });

  it("відповіданий дзвінок не створює задачу", async () => {
    const res = await handleCallCompleted(null, { ...missedInbound, disposition: "ANSWER", billsec: "42" });
    expect(res.task_id).toBeNull();
    expect(db.rows("crm_tasks")).toHaveLength(0);
    expect(db.rows("crm_calls")[0]!.duration_sec).toBe(42);
  });

  it("не створює лід і контакт, якщо автостворення вимкнено", async () => {
    seed({
      binotel_settings: [
        { integration_id: null, auto_create_contact: false, auto_create_lead: false, auto_create_missed_task: false, missed_sla_minutes: 30 },
      ],
    });
    const res = await handleCallCompleted(null, missedInbound);
    expect(res.created_contact).toBe(false);
    expect(res.created_lead).toBe(false);
    expect(res.task_id).toBeNull();
    expect(db.rows("crm_calls")).toHaveLength(1);
  });

  it("використовує наявний контакт замість створення нового", async () => {
    seed({
      crm_contacts: [{ owner_id: ADMIN_ID, full_name: "Петро", phone_norm: "+380671234567", created_at: "2024-01-01" }],
    });
    const res = await handleCallCompleted(null, missedInbound);
    expect(res.created_contact).toBe(false);
    expect(db.rows("crm_contacts")).toHaveLength(1);
    expect(res.contact_id).toBe(db.rows("crm_contacts")[0]!.id);
  });
});

describe("handleCallSettings", () => {
  it("повертає картку клієнта для відомого номера", async () => {
    seed({
      crm_contacts: [{ owner_id: ADMIN_ID, full_name: "Петро Іваненко", phone_norm: "+380671234567", created_at: "2024-01-01" }],
    });
    const res = await handleCallSettings(null, missedInbound);
    expect(res.matched).toBe(true);
    expect(JSON.stringify(res.response)).toContain("Петро Іваненко");
    expect(db.rows("binotel_call_sessions")).toHaveLength(1);
  });

  it("для нового номера повертає відповідь без збою і зберігає сесію", async () => {
    const res = await handleCallSettings(null, missedInbound);
    expect(res.matched).toBe(false);
    expect(res.response).toHaveProperty("customerData");
    expect(db.rows("binotel_call_sessions")).toHaveLength(1);
  });
});
