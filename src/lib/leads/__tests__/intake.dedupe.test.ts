import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/marketing/touchpoints.server", () => ({ recordIntakeTouchpoint: vi.fn(async () => ({})) }));
vi.mock("@/lib/marketing/conversion-events.server", () => ({ safeEmitConversion: vi.fn(async () => ({})) }));

import { handleLeadIntake } from "../intake.server";

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

function getPath(row: Row, col: string) {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) return row[m[1]]?.[m[2]];
  return row[col];
}

function fakeAdmin(db: DB) {
  let seq = 0;
  return {
    from(table: string) {
      db[table] ??= [];
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Row | null = null;
      let head = false;
      let order: { col: string; asc: boolean } | null = null;
      let lim: number | null = null;
      const run = () => {
        if (op === "insert") {
          const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...payload };
          db[table].push(row);
          return { data: row, error: null };
        }
        let rows = db[table].filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          rows.forEach((r) => Object.assign(r, payload));
          return { data: null, error: null };
        }
        if (order) {
          const { col, asc } = order;
          rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        if (lim != null) rows = rows.slice(0, lim);
        if (head) return { count: rows.length, data: null, error: null };
        return { data: rows, error: null };
      };
      const q: any = {
        select(_c?: string, o?: { head?: boolean }) { if (o?.head) head = true; return q; },
        insert(p: Row) { op = "insert"; payload = p; return q; },
        update(p: Row) { op = "update"; payload = p; return q; },
        eq(c: string, v: unknown) { filters.push((r) => getPath(r, c) === v); return q; },
        in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return q; },
        gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return q; },
        ilike(c: string, v: string) {
          const plain = v.replace(/\\(.)/g, "$1").toLowerCase();
          filters.push((r) => String(r[c] ?? "").toLowerCase() === plain); return q;
        },
        order(c: string, o?: { ascending?: boolean }) { order ??= { col: c, asc: o?.ascending !== false }; return q; },
        limit(n: number) { lim = n; return q; },
        maybeSingle() { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); },
        then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
  };
}

const ctx = { ipHash: null, signatureOk: true };
const recent = new Date().toISOString();
let db: DB;
beforeEach(() => {
  db = { crm_pipelines: [{ id: "p1", is_active: true, is_default: true, sort_order: 1 }], crm_stages: [{ id: "s1", pipeline_id: "p1", sort_order: 1 }] };
});

describe("handleLeadIntake dedupe", () => {
  it("reuses keyCRM contact by phone_e164", async () => {
    db.crm_contacts = [{ id: "c-k", phone_norm: "380501234567", phone_e164: "+380501234567", created_at: recent }];
    const r = await handleLeadIntake(fakeAdmin(db), { phone: "050 123 45 67", name: "A" }, ctx);
    expect(r.status).toBe("accepted");
    expect(r.contactId).toBe("c-k");
    expect(db.crm_contacts).toHaveLength(1);
    expect(db.crm_requests[0].payload.dedupe.contact_match).toBe("phone_e164");
  });

  it("reuses open keyCRM lead by phone_e164 without contact_id", async () => {
    db.crm_leads = [{ id: "l-k", phone_e164: "+380501234567", status: "open", contact_id: null, created_at: recent }];
    const r = await handleLeadIntake(fakeAdmin(db), { phone: "0501234567" }, ctx);
    expect(r.leadId).toBe("l-k");
    expect(db.crm_leads).toHaveLength(1);
    expect(db.crm_requests[0].payload.dedupe.lead_match).toBe("phone_e164_open");
  });

  it("returns duplicate for repeated external_id", async () => {
    const admin = fakeAdmin(db);
    const first = await handleLeadIntake(admin, { provider: "meta", external_id: "X1", phone: "0671112233" }, ctx);
    expect(first.status).toBe("accepted");
    const second = await handleLeadIntake(admin, { provider: "meta", external_id: " X1 ", phone: "0679998877" }, ctx);
    expect(second.status).toBe("duplicate");
    expect(second.leadId).toBe(first.leadId);
  });

  it("stores attribution and phone_e164 on new lead", async () => {
    const r = await handleLeadIntake(fakeAdmin(db), {
      phone: "0931234567",
      utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "c", utm_content: "ct", utm_term: "t" },
      gclid: "G", gbraid: "GB", wbraid: "WB", fbclid: "F", ttclid: "T",
      landing_url: "https://terzi.ua/l", referrer: "https://google.com",
    }, ctx);
    const lead = db.crm_leads.find((l) => l.id === r.leadId)!;
    expect(lead.phone_e164).toBe("+380931234567");
    expect(lead.utm).toMatchObject({
      utm_source: "google", utm_medium: "cpc", utm_campaign: "c", utm_content: "ct", utm_term: "t",
      gclid: "G", gbraid: "GB", wbraid: "WB", fbclid: "F", ttclid: "T",
      landing_url: "https://terzi.ua/l", referrer: "https://google.com",
    });
  });
});
