/**
 * Хвиля 1 — цілісність даних TERZI.
 *
 * Тільки dry-run звіти + застосування за явним підтвердженням.
 * Жодного автоматичного об'єднання клієнтів або лідів.
 */

export const AUDIT_CHECKS = [
  "crm_quality",
  "client_duplicates",
  "calls_to_leads",
  "leads_to_clients",
  "leads_to_orders",
  "leads_without_contact",
  "leads_without_manager",
  "leads_without_source",
  "stage_status_conflicts",
  "duplicate_leads",
  "unlinked_keycrm_orders",
  "won_leads_without_order",
  "catalog_issues",
  "estimates_price_version",
  "crm2_calls",
  "crm2_sources",
  "crm2_orders",
  "crm2_measurements",
  "crm2_callbacks",
] as const;
export type AuditCheck = (typeof AUDIT_CHECKS)[number];

export const AUDIT_LABELS: Record<AuditCheck, string> = {
  crm_quality: "Якість даних CRM — лічильники",
  client_duplicates: "Дублі клієнтів (телефон / e-mail / keyCRM)",
  calls_to_leads: "Звінки без ліда",
  leads_to_clients: "Ліди без клієнта",
  leads_to_orders: "Ліди без замовлення",
  leads_without_contact: "Ліди без контакту",
  leads_without_manager: "Ліди без відповідального",
  leads_without_source: "Ліди без джерела",
  stage_status_conflicts: "Конфлікти етап / статус",
  duplicate_leads: "Дублі лідів",
  unlinked_keycrm_orders: "Замовлення keyCRM без звʼязку",
  won_leads_without_order: "Виграні ліди без замовлення",
  catalog_issues: "Каталог: без коду або з нульовою ціною",
  estimates_price_version: "Кошториси без зафіксованої версії прайсу",
  crm2_calls: "Звірка дзвінків: контакт / клієнт / лід / замовлення / замір",
  crm2_sources: "Звірка джерел лідів (або явне «Не класифіковано»)",
  crm2_orders: "Звірка лід ↔ замовлення",
  crm2_measurements: "Звірка замір ↔ лід / клієнт",
  crm2_callbacks: "Пропущені дзвінки без передзвону → задачі",
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

/** Таблиці з посиланням на клієнта, які переносяться при об'єднанні дублів. */
export const CLIENT_RELATION_TABLES = [
  "crm_contacts",
  "crm_leads",
  "crm_calls",
  "crm_tasks",
  "calendar_events",
  "estimates",
  "orders",
  "order_measurements",
  "invoices",
  "binotel_call_sessions",
  "finance_transactions",
  "finance_counterparties",
  "finance_projects",
] as const;

/** Детерміновані групи дублів клієнтів: точний E.164, точний e-mail, той самий покупець keyCRM. */
export async function clientDuplicateGroups() {
  const { buildDuplicateGroups } = await import("../integrations/keycrm/mapping");
  const { toE164 } = await import("../phone");
  const { normalizeEmail } = await import("../crm/identity");
  const clients = await fetchAll(
    "clients",
    "id,name,phone,phone_e164,email,address,created_at,status,external_source,external_id",
  );
  const usage = new Map<string, number>();
  for (const table of CLIENT_RELATION_TABLES) {
    const rows = await fetchAll(table, "client_id");
    for (const r of rows) if (r.client_id) usage.set(r.client_id, (usage.get(r.client_id) ?? 0) + 1);
  }
  const records = clients.map((c) => ({
    id: c.id as string,
    name: c.name as string | null,
    phoneE164: (c.phone_e164 as string | null) ?? toE164(c.phone),
    email: normalizeEmail(c.email),
    externalSource: c.external_source as string | null,
    externalId: c.external_id as string | null,
    createdAt: c.created_at as string | null,
    status: c.status as string | null,
    relations: usage.get(c.id) ?? 0,
    completeness: ["name", "phone", "email", "address"].filter((k) => c[k]).length,
  }));
  return { groups: buildDuplicateGroups(records), usage };
}

async function clientDuplicates(): Promise<AuditReport> {
  const { groups } = await clientDuplicateGroups();
  const safe = groups.filter((g) => g.safe);
  const ambiguous = groups.filter((g) => !g.safe);
  const excess = safe.reduce((s, g) => s + g.losers.length, 0);

  const rows: AuditRow[] = [];
  if (safe.length) {
    rows.push({
      applyKey: "mergesafe:all",
      title: `Безпечні групи: ${safe.length} (зайвих записів ${excess})`,
      detail: "Ознаки: той самий покупець keyCRM, точний E.164 або точний e-mail. Нечіткого злиття за іменем немає.",
      change: `Об'єднати всі ${safe.length} безпечні групи: перенести звʼязки на канонічних клієнтів, дублі — в архів (merged_into)`,
    });
  }
  for (const g of groups.slice(0, REPORT_LIMIT)) {
    rows.push({
      applyKey: g.safe ? `merge:${g.survivor.id}:${g.losers.map((l) => l.id).join(",")}` : null,
      title: `${g.safe ? "SAFE" : "ПЕРЕВІРИТИ"} · ${g.key} · ${g.losers.length + 1} записи`,
      detail: [g.survivor, ...g.losers]
        .map((c) => `${c.name || "без назви"} (${c.relations ?? 0} зв'язків)`)
        .join(" | "),
      change: g.safe
        ? `Залишити «${g.survivor.name || g.survivor.id}», перенести звʼязки з ${g.losers.length} дубл., дублі — в архів`
        : (g.reason ?? "Потребує перевірки"),
    });
  }

  return {
    check: "client_duplicates",
    label: AUDIT_LABELS.client_duplicates,
    applicable: true,
    total: groups.length,
    rows,
    note: `Безпечних груп: ${safe.length} (зайвих ${excess}); неоднозначних: ${ambiguous.length} — вони залишаються без змін у «потребує перевірки». Дублі не видаляються — переходять у статус archived із посиланням merged_into.`,
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

/* ─────────── якість даних CRM ─────────── */

type LeadRow = Record<string, any>;

async function leadsForQuality(): Promise<LeadRow[]> {
  return fetchAll(
    "crm_leads",
    "id,title,contact_id,client_id,assigned_to,order_id,source,utm,status,stage_id,phone_e164,created_at,external_source,external_id",
  );
}

function leadTitle(l: LeadRow) {
  return `${l.title || "без назви"} · ${new Date(l.created_at).toLocaleDateString("uk-UA")}`;
}

function simpleReport(check: AuditCheck, rows: LeadRow[], detail: (l: LeadRow) => string, note: string): AuditReport {
  return {
    check,
    label: AUDIT_LABELS[check],
    applicable: false,
    total: rows.length,
    rows: rows.slice(0, REPORT_LIMIT).map((l) => ({
      applyKey: null,
      title: leadTitle(l),
      detail: detail(l),
      change: null,
    })),
    note,
  };
}

const hasUtm = (l: LeadRow) => Object.values((l.utm ?? {}) as Record<string, unknown>).some((v) => v);

async function stageConflicts(): Promise<AuditReport> {
  const { canonicalLeadStatus } = await import("../integrations/keycrm/mapping");
  const leads = await leadsForQuality();

  const stages = await fetchAll("crm_stages", "id,name,key,pipeline_id,is_won,is_lost");
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const bad = leads.filter((l) => {
    const stage = l.stage_id ? stageById.get(l.stage_id) : null;
    if (!stage) return Boolean(l.stage_id);
    const expected = canonicalLeadStatus({
      title: String(stage.name ?? ""),
      alias: String(stage.key ?? ""),
      is_final: Boolean(stage.is_won) || Boolean(stage.is_lost),
    });
    if (expected.status === "won") return l.status !== "won";
    if (expected.status === "open") return l.status === "won" || l.status === "lost";
    // фінальні етапи відмови: postponed і lost — обидва прийнятні (причина відмови ≠ активний етап)
    return l.status === "open" || l.status === "won";
  });

  return simpleReport(
    "stage_status_conflicts",
    bad,
    (l) => `етап: ${stageById.get(l.stage_id)?.name ?? "—"} · статус: ${l.status}`,
    "Етап keyCRM — джерело істини. Конфлікти зникають після наступної синхронізації картки.",
  );
}

async function duplicateLeads(): Promise<AuditReport> {
  const leads = await leadsForQuality();
  const groups = new Map<string, LeadRow[]>();
  for (const l of leads) {
    const key = l.external_id ? `keycrm:${l.external_id}` : l.phone_e164 ? `tel:${l.phone_e164}` : null;
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(l);
    groups.set(key, arr);
  }
  const dup = [...groups.entries()].filter(([, list]) => list.length > 1);
  return {
    check: "duplicate_leads",
    label: AUDIT_LABELS.duplicate_leads,
    applicable: false,
    total: dup.length,
    rows: dup.slice(0, REPORT_LIMIT).map(([key, list]) => ({
      applyKey: null,
      title: `${key} · ${list.length} лідів`,
      detail: list.map((l) => leadTitle(l)).join(" | "),
      change: null,
    })),
    note: "Ліди не об'єднуються автоматично: повторні звернення того самого номера — нормальна ситуація. Дублі за зовнішнім ID keyCRM потребують перевірки.",
  };
}

async function unlinkedKeycrmOrders(): Promise<AuditReport> {
  const orders = await fetchAll("orders", "id,number,name,client_id,external_source,external_id,created_at", (q) =>
    q.eq("external_source", "keycrm"),
  );
  const leads = await fetchAll("crm_leads", "id,order_id");
  const linked = new Set(leads.map((l) => l.order_id).filter(Boolean));
  const bad = orders.filter((o) => !o.client_id || !linked.has(o.id));
  return {
    check: "unlinked_keycrm_orders",
    label: AUDIT_LABELS.unlinked_keycrm_orders,
    applicable: false,
    total: bad.length,
    rows: bad.slice(0, REPORT_LIMIT).map((o) => ({
      applyKey: null,
      title: `${o.number} · ${o.name || "без назви"}`,
      detail: `${o.client_id ? "клієнт є" : "без клієнта"} · ${linked.has(o.id) ? "лід є" : "без ліда"}`,
      change: null,
    })),
    note: "Замовлення keyCRM без клієнта або без зв'язку з лідом. Зв'язок встановлюється синхронізацією за зовнішнім ID.",
  };
}

async function wonLeadsWithoutOrder(): Promise<AuditReport> {
  const leads = await leadsForQuality();
  const bad = leads.filter((l) => l.status === "won" && !l.order_id);
  return simpleReport(
    "won_leads_without_order",
    bad,
    (l) => `клієнт: ${l.client_id ? "є" : "—"} · відповідальний: ${l.assigned_to ? "є" : "—"}`,
    "Виграний лід без замовлення: замовлення keyCRM ще не створене або не зіставлене.",
  );
}

async function crmQuality(): Promise<AuditReport> {
  const leads = await leadsForQuality();
  const [dupClients, stage, dupLeads, unlinked] = await Promise.all([
    clientDuplicateGroups(),
    stageConflicts(),
    duplicateLeads(),
    unlinkedKeycrmOrders(),
  ]);
  const counters: { check: AuditCheck; label: string; total: number }[] = [
    { check: "leads_without_contact", label: AUDIT_LABELS.leads_without_contact, total: leads.filter((l) => !l.contact_id).length },
    { check: "leads_to_clients", label: "Ліди без клієнта", total: leads.filter((l) => !l.client_id).length },
    { check: "leads_without_manager", label: AUDIT_LABELS.leads_without_manager, total: leads.filter((l) => !l.assigned_to).length },
    { check: "leads_without_source", label: AUDIT_LABELS.leads_without_source, total: leads.filter((l) => !l.source && !hasUtm(l)).length },
    { check: "stage_status_conflicts", label: AUDIT_LABELS.stage_status_conflicts, total: stage.total },
    { check: "client_duplicates", label: "Дублі клієнтів (групи)", total: dupClients.groups.length },
    { check: "duplicate_leads", label: AUDIT_LABELS.duplicate_leads, total: dupLeads.total },
    { check: "unlinked_keycrm_orders", label: AUDIT_LABELS.unlinked_keycrm_orders, total: unlinked.total },
    { check: "won_leads_without_order", label: AUDIT_LABELS.won_leads_without_order, total: leads.filter((l) => l.status === "won" && !l.order_id).length },
    { check: "leads_to_orders", label: "Неоднозначні зіставлення (лід без замовлення при клієнті)", total: leads.filter((l) => l.client_id && !l.order_id).length },
  ];
  return {
    check: "crm_quality",
    label: AUDIT_LABELS.crm_quality,
    applicable: false,
    total: counters.reduce((s, c) => s + c.total, 0),
    rows: counters.map((c) => ({
      applyKey: `open:${c.check}`,
      title: `${c.label}: ${c.total}`,
      detail: `Усього лідів: ${leads.length}`,
      change: "Відкрити перелік",
    })),
    note: "Натисніть «Відкрити перелік», щоб побачити точні записи за лічильником.",
  };
}

export async function buildAuditReport(check: AuditCheck): Promise<AuditReport> {
  switch (check) {
    case "crm_quality":
      return crmQuality();
    case "client_duplicates":
      return clientDuplicates();
    case "calls_to_leads":
      return callsToLeads();
    case "leads_to_clients":
      return leadsToClients();
    case "leads_to_orders":
      return leadsToOrders();
    case "leads_without_contact": {
      const leads = await leadsForQuality();
      return simpleReport(
        "leads_without_contact",
        leads.filter((l) => !l.contact_id),
        (l) => `джерело: ${l.source || "—"} · статус: ${l.status}`,
        "Контакт створюється синхронізацією картки keyCRM (include=contact).",
      );
    }
    case "leads_without_manager": {
      const leads = await leadsForQuality();
      return simpleReport(
        "leads_without_manager",
        leads.filter((l) => !l.assigned_to),
        (l) => `статус: ${l.status} · клієнт: ${l.client_id ? "є" : "—"}`,
        "Відповідальний підтягується з keyCRM за e-mail або телефоном користувача. Без надійного збігу — потребує перевірки.",
      );
    }
    case "leads_without_source": {
      const leads = await leadsForQuality();
      return simpleReport(
        "leads_without_source",
        leads.filter((l) => !l.source && !hasUtm(l)),
        (l) => `статус: ${l.status} · створено ${new Date(l.created_at).toLocaleDateString("uk-UA")}`,
        "Джерело або UTM не визначені — «Не класифіковано / потребує перевірки». Історична атрибуція не вигадується.",
      );
    }
    case "stage_status_conflicts":
      return stageConflicts();
    case "duplicate_leads":
      return duplicateLeads();
    case "unlinked_keycrm_orders":
      return unlinkedKeycrmOrders();
    case "won_leads_without_order":
      return wonLeadsWithoutOrder();
    case "catalog_issues":
      return catalogIssues();
    case "estimates_price_version":
      return estimatesPriceVersion();
    case "crm2_calls":
      return crm2Report(check, "calls");
    case "crm2_sources":
      return crm2Report(check, "sources");
    case "crm2_orders":
      return crm2Report(check, "orders");
    case "crm2_measurements":
      return crm2Report(check, "measurements");
    case "crm2_callbacks":
      return crm2Report(check, "callbacks");
  }
}

/** Сухий прогін операційної звірки CRM-2: показує, що саме буде звʼязано. */
async function crm2Report(check: AuditCheck, pass: string): Promise<AuditReport> {
  const { runCrm2Pass } = await import("./crm2.server");
  const res = await runCrm2Pass(pass as any, true, "00000000-0000-0000-0000-000000000000");
  const rows: AuditRow[] = [
    {
      applyKey: res.planned > 0 ? `crm2:${pass}` : null,
      title: `${res.label}: ${res.planned} записів`,
      detail: Object.entries(res.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
      change: res.planned > 0 ? `Застосувати ${res.planned} детермінованих звʼязків` : null,
    },
    ...res.samples.map((s) => ({ applyKey: null, title: s, detail: "приклад", change: null })),
  ];
  return {
    check,
    label: AUDIT_LABELS[check],
    applicable: res.planned > 0,
    total: res.planned,
    rows,
    note: `Переглянуто записів: ${res.scanned}. Неоднозначних (потребує перевірки): ${res.ambiguous}. Застосовуються лише однозначні відповідності, наявні звʼязки не перетираються.`,
  };
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

  if (parts[0] === "leadorder") {
    const [, leadId, orderId] = parts;
    const { error } = await client
      .from("crm_leads")
      .update({ order_id: orderId })
      .eq("id", leadId)
      .is("order_id", null);
    if (error) throw new Error(`Не вдалося привʼязати лід до замовлення: ${error.message}`);
    return { applied: 1, message: "Лід привʼязано до замовлення" };
  }

  if (parts[0] === "merge") {
    const keeper = parts[1];
    const losers = (parts[2] ?? "").split(",").filter(Boolean);
    if (!keeper || losers.length === 0) throw new Error("Некоректна група для об'єднання");
    const res = await mergeClientGroup(keeper, losers, userId);
    return { applied: res.applied, message: `Перенесено ${res.applied} звʼязків, архівовано дублів: ${losers.length}` };
  }

  if (parts[0] === "mergesafe") {
    const { groups } = await clientDuplicateGroups();
    const all = groups.filter((g) => g.safe);
    // Обробляємо порціями, щоб один запит не виходив за ліміт часу.
    const limit = Number(parts[1] && parts[1] !== "all" ? parts[1] : 120);
    const safe = all.slice(0, Math.max(1, limit));
    const remaining = all.length - safe.length;
    let applied = 0;
    for (const g of safe) {
      const res = await mergeClientGroup(
        g.survivor.id,
        g.losers.map((l) => l.id),
        userId,
      );
      applied += res.applied;
    }
    const excess = safe.reduce((s, g) => s + g.losers.length, 0);
    return {
      applied,
      message: `Обʼєднано безпечних груп: ${safe.length}, архівовано дублів: ${excess}, перенесено звʼязків: ${applied}.${remaining > 0 ? ` Залишилось безпечних груп: ${remaining} — натисніть «Застосувати» ще раз.` : ""} Неоднозначні групи не змінювалися.`,
    };
  }

  throw new Error("Невідома дія аудиту");
}

/**
 * Обʼєднання однієї групи клієнтів: усі звʼязки переходять на канонічного клієнта,
 * дублі архівуються з посиланням merged_into. Фізичного видалення немає,
 * фінансові розрахунки не змінюються — переносяться лише посилання client_id.
 */
async function mergeClientGroup(
  keeper: string,
  losers: string[],
  userId: string,
): Promise<{ applied: number }> {
  const client = await db();
  let applied = 0;
  for (const table of CLIENT_RELATION_TABLES) {
    for (const loser of losers) {
      if (loser === keeper) continue;
      const { data, error } = await client.from(table).update({ client_id: keeper }).eq("client_id", loser).select("id");
      if (error) throw new Error(`Не вдалося перенести ${table}: ${error.message}`);
      applied += (data ?? []).length;
    }
  }
  const { data: keeperRow } = await client.from("clients").select("name").eq("id", keeper).maybeSingle();
  for (const loser of losers) {
    if (loser === keeper) continue;
    const { data: cur } = await client.from("clients").select("notes").eq("id", loser).maybeSingle();
    const note = `merged_into:${keeper} (${keeperRow?.name ?? "канонічний клієнт"}) · аудит даних ${new Date().toISOString()} · ${userId}`;
    const { error } = await client
      .from("clients")
      .update({ status: "archived", notes: [cur?.notes, note].filter(Boolean).join("\n") })
      .eq("id", loser);
    if (error) throw new Error(`Не вдалося архівувати дубль: ${error.message}`);
  }
  return { applied };
}
