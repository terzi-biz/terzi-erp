/**
 * Мінімальний in-memory замінник supabase-js для тестів серверної логіки.
 * Підтримує ланцюжки, які реально використовує код Binotel:
 * from().select().eq().order().limit().maybeSingle()/single(), insert(), update(), count.
 */
type Row = Record<string, any>;

/** Значення DEFAULT з міграцій, які in-memory сховище не знає саме. */
const TABLE_DEFAULTS: Record<string, Row> = {
  crm_leads: { status: "open" },
  crm_tasks: { status: "open", priority: "normal" },
};

class Query {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<[string, any]> = [];
  private payload: Row | Row[] | null = null;
  private limitN: number | null = null;
  private head = false;
  private wantCount = false;

  constructor(private tables: Record<string, Row[]>, private table: string) {
    this.tables[table] ??= [];
  }

  private get rows() {
    return this.tables[this.table]!;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.wantCount = Boolean(opts?.count);
      this.head = Boolean(opts?.head);
    }
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push([col, val]);
    return this;
  }
  order(_col: string, _o?: any) {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private match(r: Row) {
    return this.filters.every(([c, v]) => r[c] === v);
  }

  private run(): { data: Row[]; count: number } {
    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const created = items.map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(TABLE_DEFAULTS[this.table] ?? {}),
        ...r,
      }));
      this.rows.push(...created);
      return { data: created, count: created.length };
    }
    if (this.op === "update") {
      const hit = this.rows.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.payload);
      return { data: hit, count: hit.length };
    }
    if (this.op === "delete") {
      const hit = this.rows.filter((r) => this.match(r));
      this.tables[this.table] = this.rows.filter((r) => !this.match(r));
      return { data: hit, count: hit.length };
    }
    let data = this.rows.filter((r) => this.match(r));
    const count = data.length;
    if (this.limitN != null) data = data.slice(0, this.limitN);
    return { data, count };
  }

  async maybeSingle() {
    const { data } = this.run();
    return { data: data[0] ?? null, error: null };
  }
  async single() {
    const { data } = this.run();
    return data[0] ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
  }
  then(resolve: (v: any) => any, reject?: (e: any) => any) {
    try {
      const { data, count } = this.run();
      return Promise.resolve(resolve({ data: this.head ? null : data, count: this.wantCount ? count : null, error: null }));
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
    }
  }
}

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ id: crypto.randomUUID(), ...r }));
  return {
    tables,
    rows: (name: string) => tables[name] ?? [],
    from: (name: string) => new Query(tables, name) as any,
  };
}
