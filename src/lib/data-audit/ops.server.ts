/**
 * Хвиля 1 — цілісність даних TERZI.
 *
 * Тільки dry-run звіти + застосування за явним підтвердженням.
 * Жодного автоматичного об'єднання клієнтів або лідів.
 */

export const AUDIT_CHECKS = [
  "client_duplicates",
  "calls_to_leads",
  "leads_to_clients",
  "leads_to_orders",
  "catalog_issues",
  "estimates_price_version",
] as const;
export type AuditCheck = (typeof AUDIT_CHECKS)[number];

export const AUDIT_LABELS: Record<AuditCheck, string> = {
  client_duplicates: "Дублі клієнтів за телефоном",
  calls_to_leads: "Звінки без ліда",
  leads_to_clients: "Ліди без клієнта",
  leads_to_orders: "Ліди без замовлення",
  catalog_issues: "Каталог: без коду або з нульовою ціною",
  estimates_price_version: "Кошториси без зафіксованої версії прайсу",
};

export interface AuditRow {
  /** Ключ дії застосування (порожній = звіт тільки для читання). */
  applyKey: string | null;
  title: string;
  detail: string;
  /** Значення, які будуть записані при підтвердженні. */
  change: string | null;
}

export interface AuditReport {
  check: AuditCheck;
  label: string;
  applicable: boolean;
  total: number;
  rows: AuditRow[];
  note: string;
}

const REPORT_LIMIT = 500;

export function normPhone(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // 380XXXXXXXXX -> останні 9 цифр як стабільний ключ (0XX / +380XX / 380XX)
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Перевіряє, що актор — адміністратор або директор. */
export async function requireAuditAdmin(supabase: any, userId: string): Promise<void> {
  const [admin, director] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "director" }),
  ]);
  if (admin.data !== true && director.data !== true) {
    throw new Error("Аудит даних доступний лише адміністратору або директору");
  }
}

async function fetchAll(table: string, columns: string, filter?: (q: any) => any) {
  const client = await db();
  const out: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = client.from(table).select(columns).range(from, from + page - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`Не вдалося прочитати ${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

/* ─────────── звіти ─────────── */

async function clientDuplicates(): Promise<AuditReport> {
  const clients = await fetchAll("clients", "id,name,phone,created_at,status");
  const [orders, estimates, leads, calls] = await Promise.all([
    fetchAll("orders", "client_id"),
    fetchAll("estimates", "client_id"),
    fetchAll("crm_leads", "client_id"),
    fetchAll("crm_calls", "client_id"),
  ]);
  const usage = new Map<string, number>();
  for (const set of [orders, estimates, leads, calls]) {
    for (const r of set) {
      if (r.client_id) usage.set(r.client_id, (usage.get(r.client_id) ?? 0) + 1);
    }
  }

  const groups = new Map<string, any[]>();
  for (const c of clients) {
    const key = normPhone(c.phone);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const rows: AuditRow[] = [];
  let total = 0;
  for (const [phone, list] of groups) {
    if (list.length < 2) continue;
    total += 1;
    if (rows.length >= REPORT_LIMIT) continue;
    // Утримувач = найбільше зв'язків, далі найстаріший запис
    const sorted = [...list].sort(
      (a, b) =>
        (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );
    const keeper = sorted[0];
    const losers = sorted.slice(1);
    rows.push({
      applyKey: `merge:${keeper.id}:${losers.map((l) => l.id).join(",")}`,
      title: `+${phone} · ${list.length} записи`,
      detail: sorted
        .map((c) => `${c.name || "без назви"} (${usage.get(c.id) ?? 0} зв'язків)`)
        .join(" | "),
      change: `Залишити «${keeper.name || keeper.id}», перепривʼязати зв'язки з ${losers.length} дубл. і позначити їх архівними`,
    });
  }

  return {
    check: "client_duplicates",
    label: AUDIT_LABELS.client_duplicates,
    applicable: true,
    total,
    rows,
    note: "Об'єднання виконується лише по одній групі за окремим підтвердженням. Дублі не видаляються — отримують статус archived.",
  };
}

async function callsToLeads(): Promise<AuditReport> {
  const calls = await fetchAll("crm_calls", "id,phone_norm,started_at,direction", (q) =>
    q.is("lead_id", null),
  );
  const contacts = await fetchAll("crm_contacts", "id,phone_norm,full_name");
  const leads = await fetchAll("crm_leads", "id,title,contact_id,created_at");

  const leadByContact = new Map<string, any[]>();
  for (const l of leads) {
    if (!l.contact_id) continue;
    const arr = leadByContact.get(l.contact_id) ?? [];
    arr.push(l);
    leadByContact.set(l.contact_id, arr);
  }
  const contactByPhone = new Map<string, any[]>();
  for (const c of contacts) {
    const key = normPhone(c.phone_norm);
    if (!key) continue;
    const arr = contactByPhone.get(key) ?? [];
    arr.push(c);
    contactByPhone.set(key, arr);
  }

  const rows: AuditRow[] = [];
  let total = 0;
  for (const call of calls) {
    const key = normPhone(call.phone_norm);
    if (!key) continue;
    const cts = contactByPhone.get(key) ?? [];
    if (cts.length !== 1) continue;
    const candidates = leadByContact.get(cts[0].id) ?? [];
    if (candidates.length !== 1) continue;
    total += 1;
    if (rows.length >= REPORT_LIMIT) continue;
    rows.push({
      applyKey: `call:${call.id}:${candidates[0].id}:${cts[0].id}`,
      title: `${call.direction === "inbound" ? "Вхідний" : "Вихідний"} +${key} · ${new Date(call.started_at).toLocaleString("uk-UA")}`,
      detail: `Контакт: ${cts[0].full_name || "—"}`,
      change: `Привʼязати до ліда «${candidates[0].title}»`,
    });
  }

  return {
    check: "calls_to_leads",
    label: AUDIT_LABELS.calls_to_leads,
    applicable: true,
    total,
    rows,
    note: "Показані тільки однозначні відповідності: один контакт і один лід на номер. Неоднозначні випадки не пропонуються.",
  };
}

async function leadsToClients(): Promise<AuditReport> {
  const leads = await fetchAll(
    "crm_leads",
    "id,title,contact_id,client_id,created_at,status,source,external_source",
    (q) => q.is("client_id", null),
  );
  const contacts = await fetchAll("crm_contacts", "id,phone_norm,full_name");
  const clients = await fetchAll("clients", "id,name,phone,status");

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const clientByPhone = new Map<string, any[]>();
  for (const c of clients) {
    if (c.status === "archived") continue;
    const key = normPhone(c.phone);
    if (!key) continue;
    const arr = clientByPhone.get(key) ?? [];
    arr.push(c);
    clientByPhone.set(key, arr);
  }

  const rows: AuditRow[] = [];
  let total = 0;
  for (const l of leads) {
    if (!l.contact_id) continue;
    const ct = contactById.get(l.contact_id);
    const key = normPhone(ct?.phone_norm);
    if (!key) continue;
    const cands = clientByPhone.get(key) ?? [];
    if (cands.length !== 1) continue;
    total += 1;
    if (rows.length >= REPORT_LIMIT) continue;
    rows.push({
      applyKey: `lead:${l.id}:${cands[0].id}`,
      title: l.title,
      detail: [
        `Контакт: ${ct?.full_name || "—"}`,
        `+${key}`,
        `статус ліда: ${l.status || "—"}`,
        `джерело: ${l.source || l.external_source || "—"}`,
        `клієнт: ${cands[0].name || "без назви"} (тел. збігається)`,
      ].join(" · "),
      change: `Привʼязати до клієнта «${cands[0].name || cands[0].id}»`,
    });
  }

  return {
    check: "leads_to_clients",
    label: AUDIT_LABELS.leads_to_clients,
    applicable: true,
    total,
    rows,
    note: "Пропонуються лише однозначні відповідності телефону контакту й активного клієнта.",
  };
}

async function leadsToOrders(): Promise<AuditReport> {
  const leads = await fetchAll(
    "crm_leads",
    "id,title,contact_id,client_id,order_id,status,created_at",
    (q) => q.is("order_id", null).not("client_id", "is", null),
  );
  const orders = await fetchAll("orders", "id,number,name,client_id,amount_total,created_at");
  const clients = await fetchAll("clients", "id,name,phone");

  const ordersByClient = new Map<string, any[]>();
  for (const o of orders) {
    if (!o.client_id) continue;
    const arr = ordersByClient.get(o.client_id) ?? [];
    arr.push(o);
    ordersByClient.set(o.client_id, arr);
  }
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const rows: AuditRow[] = [];
  let total = 0;
  for (const l of leads) {
    const cands = ordersByClient.get(l.client_id) ?? [];
    if (cands.length !== 1) continue;
    const order = cands[0];
    const client = clientById.get(l.client_id);
    total += 1;
    if (rows.length >= REPORT_LIMIT) continue;
    rows.push({
      applyKey: `leadorder:${l.id}:${order.id}`,
      title: l.title,
      detail: [
        `клієнт: ${client?.name || "—"}`,
        `замовлення: ${order.number} «${order.name}»`,
        `сума: ${Number(order.amount_total) || 0} грн`,
        `створене ${new Date(order.created_at).toLocaleDateString("uk-UA")}`,
        `статус ліда: ${l.status || "—"}`,
      ].join(" · "),
      change: `Привʼязати лід до замовлення ${order.number}`,
    });
  }

  return {
    check: "leads_to_orders",
    label: AUDIT_LABELS.leads_to_orders,
    applicable: true,
    total,
    rows,
    note: "Пропонуються лише однозначні випадки: лід уже привʼязаний до клієнта, а в клієнта рівно одне замовлення. Ланцюг лід → клієнт → замовлення закривається вручну за підтвердженням.",
  };
}

async function catalogIssues(): Promise<AuditReport> {
  const items = await fetchAll(
    "catalog_items",
    "id,module,kind,code,name,unit,buy_price,sell_price,is_active",
  );
  const bad = items.filter(
    (i) =>
      i.is_active !== false &&
      (!i.code || String(i.code).trim() === "" || !(Number(i.buy_price) > 0) || !(Number(i.sell_price) > 0)),
  );
  return {
    check: "catalog_issues",
    label: AUDIT_LABELS.catalog_issues,
    applicable: false,
    total: bad.length,
    rows: bad.slice(0, REPORT_LIMIT).map((i) => ({
      applyKey: null,
      title: `${i.name} (${i.module}/${i.kind})`,
      detail: `код: ${i.code || "—"} · закупка: ${Number(i.buy_price) || 0} · продаж: ${Number(i.sell_price) || 0} ${i.unit ?? ""}`,
      change: null,
    })),
    note: "Ціни й коди виправляються вручну у довіднику — автоматично нічого не підставляється.",
  };
}

async function estimatesPriceVersion(): Promise<AuditReport> {
  const est = await fetchAll(
    "estimates",
    "id,number,module,created_at,price_book_version,engine_version,calculation_json",
  );
  const bad = est.filter((e) => !e.price_book_version || !e.engine_version);
  return {
    check: "estimates_price_version",
    label: AUDIT_LABELS.estimates_price_version,
    applicable: false,
    total: bad.length,
    rows: bad.slice(0, REPORT_LIMIT).map((e) => {
      const snap = (e.calculation_json ?? {}) as any;
      return {
        applyKey: null,
        title: `${e.number} · ${e.module}`,
        detail: `створено ${new Date(e.created_at).toLocaleDateString("uk-UA")} · знімок: ${
          snap?.engineVersion ? `engine ${snap.engineVersion}` : "немає"
        }${snap?.priceBookVersion ? `, прайс ${snap.priceBookVersion}` : ""}`,
        change: null,
      };
    }),
    note: "Історичні кошториси не перераховуються і не змінюються. Нові збереження фіксують версію прайсу та рушія автоматично.",
  };
}

export async function buildAuditReport(check: AuditCheck): Promise<AuditReport> {
  switch (check) {
    case "client_duplicates":
      return clientDuplicates();
    case "calls_to_leads":
      return callsToLeads();
    case "leads_to_clients":
      return leadsToClients();
    case "catalog_issues":
      return catalogIssues();
    case "estimates_price_version":
      return estimatesPriceVersion();
  }
}

/* ─────────── застосування за підтвердженням ─────────── */

export async function applyAuditAction(
  applyKey: string,
  userId: string,
): Promise<{ applied: number; message: string }> {
  const client = await db();
  const parts = applyKey.split(":");

  if (parts[0] === "call") {
    const [, callId, leadId, contactId] = parts;
    const { error } = await client
      .from("crm_calls")
      .update({ lead_id: leadId, contact_id: contactId })
      .eq("id", callId)
      .is("lead_id", null);
    if (error) throw new Error(`Не вдалося привʼязати звінок: ${error.message}`);
    return { applied: 1, message: "Звінок привʼязано до ліда" };
  }

  if (parts[0] === "lead") {
    const [, leadId, clientId] = parts;
    const { error } = await client
      .from("crm_leads")
      .update({ client_id: clientId })
      .eq("id", leadId)
      .is("client_id", null);
    if (error) throw new Error(`Не вдалося привʼязати лід: ${error.message}`);
    return { applied: 1, message: "Лід привʼязано до клієнта" };
  }

  if (parts[0] === "merge") {
    const keeper = parts[1];
    const losers = (parts[2] ?? "").split(",").filter(Boolean);
    if (!keeper || losers.length === 0) throw new Error("Некоректна група для об'єднання");
    let applied = 0;
    for (const table of ["orders", "estimates", "crm_leads", "crm_calls"] as const) {
      for (const loser of losers) {
        const { data, error } = await client
          .from(table)
          .update({ client_id: keeper })
          .eq("client_id", loser)
          .select("id");
        if (error) throw new Error(`Не вдалося перенести ${table}: ${error.message}`);
        applied += (data ?? []).length;
      }
    }
    const { error: archErr } = await client
      .from("clients")
      .update({ status: "archived", notes: `Обʼєднано з клієнтом ${keeper} (аудит даних, ${userId})` })
      .in("id", losers);
    if (archErr) throw new Error(`Не вдалося архівувати дублі: ${archErr.message}`);
    return {
      applied,
      message: `Перенесено ${applied} звʼязків, архівовано дублів: ${losers.length}`,
    };
  }

  throw new Error("Невідома дія аудиту");
}
