import { describe, expect, it, vi, beforeEach } from "vitest";

/** Мінімальний in-memory supabase для аудиту: eq / is / not / in / range / select. */
type Row = Record<string, any>;

class Q {
  private op: "select" | "update" = "select";
  private payload: Row | null = null;
  private preds: Array<(r: Row) => boolean> = [];
  constructor(private tables: Record<string, Row[]>, private table: string) {
    this.tables[table] ??= [];
  }
  private get rows() {
    return this.tables[this.table]!;
  }
  select() {
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  eq(c: string, v: any) {
    this.preds.push((r) => r[c] === v);
    return this;
  }
  is(c: string, v: any) {
    this.preds.push((r) => (r[c] ?? null) === v);
    return this;
  }
  not(c: string, _op: string, v: any) {
    this.preds.push((r) => (r[c] ?? null) !== v);
    return this;
  }
  in(c: string, vals: any[]) {
    this.preds.push((r) => vals.includes(r[c]));
    return this;
  }
  range() {
    return this;
  }
  private run() {
    const hit = this.rows.filter((r) => this.preds.every((p) => p(r)));
    if (this.op === "update") for (const r of hit) Object.assign(r, this.payload);
    return hit;
  }
  then(res: (v: any) => any) {
    return Promise.resolve(res({ data: this.run(), error: null }));
  }
}

let tables: Record<string, Row[]> = {};
const db = { from: (t: string) => new Q(tables, t) as any };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const { applyAuditAction, buildAuditReport, normPhone } = await import("@/lib/data-audit/ops.server");

const USER = "u-1";

beforeEach(() => {
  tables = {
    clients: [{ id: "c-1", name: "Клієнт", phone: "+380671112233", status: "active" }],
    orders: [
      { id: "o-1", number: "TRZ-2026-0001", name: "Дах", client_id: "c-1", amount_total: 1000, created_at: "2026-01-01" },
    ],
    crm_leads: [
      { id: "l-1", title: "Лід", contact_id: "ct-1", client_id: "c-1", order_id: null, status: "open", created_at: "2026-01-01" },
    ],
    crm_contacts: [{ id: "ct-1", full_name: "Іван", phone_norm: "380671112233" }],
    estimates: [],
    crm_calls: [],
  };
});

describe("нормалізація телефону", () => {
  it("зводить різні формати до 9 цифр", () => {
    expect(normPhone("+38 (067) 111-22-33")).toBe("671112233");
    expect(normPhone("0671112233")).toBe("671112233");
    expect(normPhone("380671112233")).toBe("671112233");
    expect(normPhone(null)).toBe("");
  });
});

describe("Ліди без замовлення", () => {
  it("пропонує однозначний звʼязок лід → клієнт → замовлення", async () => {
    const rep = await buildAuditReport("leads_to_orders");
    expect(rep.total).toBe(1);
    expect(rep.rows[0]!.applyKey).toBe("leadorder:l-1:o-1");
    expect(rep.rows[0]!.change).toContain("TRZ-2026-0001");
  });

  it("не пропонує нічого, коли в клієнта декілька замовлень", async () => {
    tables.orders!.push({ id: "o-2", number: "TRZ-2026-0002", name: "Стяжка", client_id: "c-1", amount_total: 500, created_at: "2026-02-01" });
    const rep = await buildAuditReport("leads_to_orders");
    expect(rep.total).toBe(0);
  });

  it("не пропонує лід, який уже привʼязаний до замовлення", async () => {
    tables.crm_leads![0]!.order_id = "o-1";
    const rep = await buildAuditReport("leads_to_orders");
    expect(rep.total).toBe(0);
  });

  it("не пропонує лід без клієнта", async () => {
    tables.crm_leads![0]!.client_id = null;
    const rep = await buildAuditReport("leads_to_orders");
    expect(rep.total).toBe(0);
  });
});

describe("Ідемпотентність застосування", () => {
  it("повторне звʼязування ліда із замовленням не дублює зв'язок", async () => {
    const first = await applyAuditAction("leadorder:l-1:o-1", USER);
    expect(first.applied).toBe(1);
    expect(tables.crm_leads![0]!.order_id).toBe("o-1");

    const again = await applyAuditAction("leadorder:l-1:o-2", USER);
    expect(again.applied).toBe(1);
    // Захист `.is(order_id, null)` не дає перезаписати вже наявний зв'язок.
    expect(tables.crm_leads![0]!.order_id).toBe("o-1");
    expect(tables.crm_leads!.length).toBe(1);

    const rep = await buildAuditReport("leads_to_orders");
    expect(rep.total).toBe(0);
  });

  it("повторне звʼязування ліда з клієнтом не змінює вже проставленого клієнта", async () => {
    tables.crm_leads![0]!.client_id = null;
    await applyAuditAction("lead:l-1:c-1", USER);
    expect(tables.crm_leads![0]!.client_id).toBe("c-1");
    await applyAuditAction("lead:l-1:c-2", USER);
    expect(tables.crm_leads![0]!.client_id).toBe("c-1");
  });

  it("повторне звʼязування дзвінка з лідом не перезаписує зв'язок", async () => {
    tables.crm_calls!.push({ id: "call-1", lead_id: null, contact_id: null, phone_norm: "380671112233", direction: "inbound", started_at: "2026-01-01" });
    await applyAuditAction("call:call-1:l-1:ct-1", USER);
    expect(tables.crm_calls![0]!.lead_id).toBe("l-1");
    await applyAuditAction("call:call-1:l-2:ct-2", USER);
    expect(tables.crm_calls![0]!.lead_id).toBe("l-1");
    expect(tables.crm_calls![0]!.contact_id).toBe("ct-1");
  });

  it("невідомий ключ дії відхиляється", async () => {
    await expect(applyAuditAction("bogus:1", USER)).rejects.toThrow("Невідома дія аудиту");
  });
});
