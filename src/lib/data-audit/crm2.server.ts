/**
 * CRM-2 — операційна звірка ланцюга
 * Джерело → Лід → Менеджер → Дзвінки → Задачі → Замір → Кошторис → Замовлення.
 *
 * Тільки детерміновані звʼязки. Жодних здогадок: якщо кандидатів більше одного —
 * запис лишається «потребує перевірки». Нічого не видаляється, сильніші наявні
 * дані (атрибуція, ручні поля) не перетираються.
 */

export type Crm2Pass = "calls" | "sources" | "orders" | "measurements" | "callbacks";

export interface Crm2Result {
  pass: Crm2Pass;
  label: string;
  /** Скільки записів розглянуто. */
  scanned: number;
  /** Скільки звʼязків буде встановлено (dry-run) або встановлено (apply). */
  planned: number;
  applied: number;
  /** Неоднозначні випадки — лишаються в «потребує перевірки». */
  ambiguous: number;
  details: Record<string, number>;
  samples: string[];
}

const PAGE = 1000;
const SAMPLES = 10;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function fetchAll(table: string, columns: string, filter?: (q: any) => any) {
  const client = await db();
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`Не вдалося прочитати ${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Мапа «ключ → рівно один запис»; неоднозначні ключі відкидаються. */
function uniqueBy<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const map = new Map<string, T>();
  const dup = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    if (map.has(k)) dup.add(k);
    else map.set(k, r);
  }
  for (const k of dup) map.delete(k);
  return { map, ambiguousKeys: dup };
}

async function applyPatches(
  table: string,
  patches: { id: string; patch: Record<string, unknown> }[],
  dryRun: boolean,
) {
  if (dryRun || !patches.length) return 0;
  const client = await db();
  let applied = 0;
  for (const p of patches) {
    const { error } = await client.from(table).update(p.patch).eq("id", p.id);
    if (error) throw new Error(`Не вдалося оновити ${table}: ${error.message}`);
    applied += 1;
  }
  return applied;
}

/* ─────────── 1. Дзвінки: контакт → клієнт → лід → замовлення → замір ─────────── */

export async function reconcileCalls(dryRun: boolean): Promise<Crm2Result> {
  const calls = await fetchAll(
    "crm_calls",
    "id,phone_e164,contact_id,client_id,lead_id,order_id,measurement_id,started_at,direction",
  );
  const contacts = await fetchAll("crm_contacts", "id,phone_e164,client_id");
  const clients = await fetchAll("clients", "id,phone_e164,status");
  const leads = await fetchAll("crm_leads", "id,phone_e164,client_id,order_id,created_at");
  const measurements = await fetchAll("order_measurements", "id,order_id,lead_id,client_id");

  const contactByPhone = uniqueBy(contacts, (c: any) => c.phone_e164);
  const clientByPhone = uniqueBy(
    clients.filter((c: any) => c.status !== "archived"),
    (c: any) => c.phone_e164,
  );
  const leadByPhone = uniqueBy(leads, (l: any) => l.phone_e164);
  const leadById = new Map(leads.map((l: any) => [l.id, l]));
  const measurementByOrder = uniqueBy(measurements, (m: any) => m.order_id);

  const details = { contact: 0, client: 0, lead: 0, order: 0, measurement: 0 };
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  const samples: string[] = [];
  let ambiguous = 0;

  for (const call of calls) {
    const phone = call.phone_e164 as string | null;
    if (!phone) continue;
    const patch: Record<string, unknown> = {};

    const contact = call.contact_id ? null : contactByPhone.map.get(phone);
    if (contact) {
      patch.contact_id = (contact as any).id;
      details.contact += 1;
    }

    const clientId =
      call.client_id ??
      ((contact as any)?.client_id ?? null) ??
      ((contactByPhone.map.get(phone) as any)?.client_id ?? null) ??
      ((clientByPhone.map.get(phone) as any)?.id ?? null);
    if (!call.client_id && clientId) {
      patch.client_id = clientId;
      details.client += 1;
    }

    const lead = call.lead_id ? leadById.get(call.lead_id) : leadByPhone.map.get(phone);
    if (!call.lead_id && lead) {
      patch.lead_id = (lead as any).id;
      details.lead += 1;
    }
    if (!call.lead_id && !lead && leadByPhone.ambiguousKeys.has(phone)) ambiguous += 1;

    const orderId = call.order_id ?? ((lead as any)?.order_id ?? null);
    if (!call.order_id && orderId) {
      patch.order_id = orderId;
      details.order += 1;
    }

    if (!call.measurement_id && orderId) {
      const m = measurementByOrder.map.get(orderId);
      if (m) {
        patch.measurement_id = (m as any).id;
        details.measurement += 1;
      }
    }

    if (Object.keys(patch).length) {
      patches.push({ id: call.id, patch });
      if (samples.length < SAMPLES) samples.push(`${phone} → ${Object.keys(patch).join(", ")}`);
    }
  }

  const applied = await applyPatches("crm_calls", patches, dryRun);
  return {
    pass: "calls",
    label: "Дзвінки: контакт / клієнт / лід / замовлення / замір",
    scanned: calls.length,
    planned: patches.length,
    applied,
    ambiguous,
    details,
    samples,
  };
}

/* ─────────── 2. Джерело ліда: відновлення без вигадок ─────────── */

export const UNCLASSIFIED_SOURCE = "Не класифіковано";

export async function recoverLeadSources(dryRun: boolean): Promise<Crm2Result> {
  const leads = await fetchAll(
    "crm_leads",
    "id,source,utm,marketing_channel_id,campaign,external_source,first_touch_at,created_at",
  );
  const channels = await fetchAll("marketing_channels", "id,name");
  const channelName = new Map(channels.map((c: any) => [c.id, c.name as string]));

  const details = { utm: 0, channel: 0, unclassified: 0, kept: 0 };
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  const samples: string[] = [];

  for (const l of leads) {
    if (l.source && String(l.source).trim()) {
      details.kept += 1;
      continue;
    }
    const utm = (l.utm ?? {}) as Record<string, unknown>;
    const utmSource = typeof utm.utm_source === "string" && utm.utm_source ? String(utm.utm_source) : null;
    const channel = l.marketing_channel_id ? (channelName.get(l.marketing_channel_id) ?? null) : null;

    let source: string;
    if (utmSource) {
      source = utmSource;
      details.utm += 1;
    } else if (channel) {
      source = channel;
      details.channel += 1;
    } else {
      source = UNCLASSIFIED_SOURCE;
      details.unclassified += 1;
    }
    const patch: Record<string, unknown> = { source };
    // First touch не перетираємо; фіксуємо лише якщо його взагалі немає.
    if (!l.first_touch_at && l.created_at) patch.first_touch_at = l.created_at;
    patches.push({ id: l.id, patch });
    if (samples.length < SAMPLES) samples.push(`${l.id.slice(0, 8)} → ${source}`);
  }

  const applied = await applyPatches("crm_leads", patches, dryRun);
  return {
    pass: "sources",
    label: "Джерело ліда: відновлення або явне «Не класифіковано»",
    scanned: leads.length,
    planned: patches.length,
    applied,
    ambiguous: details.unclassified,
    details,
    samples,
  };
}

/* ─────────── 3. Лід ↔ замовлення ─────────── */

export async function reconcileOrders(dryRun: boolean): Promise<Crm2Result> {
  const leads = await fetchAll("crm_leads", "id,client_id,order_id,status,phone_e164,created_at");
  const orders = await fetchAll("orders", "id,client_id,number,created_at,external_source,external_id");

  const ordersByClient = new Map<string, any[]>();
  for (const o of orders) {
    if (!o.client_id) continue;
    const arr = ordersByClient.get(o.client_id) ?? [];
    arr.push(o);
    ordersByClient.set(o.client_id, arr);
  }
  const takenOrders = new Set(leads.map((l: any) => l.order_id).filter(Boolean));

  const details = { by_single_order: 0 };
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  const samples: string[] = [];
  let ambiguous = 0;

  for (const l of leads) {
    if (l.order_id || !l.client_id) continue;
    const cands = (ordersByClient.get(l.client_id) ?? []).filter((o) => !takenOrders.has(o.id));
    if (cands.length !== 1) {
      if (cands.length > 1) ambiguous += 1;
      continue;
    }
    takenOrders.add(cands[0].id);
    details.by_single_order += 1;
    patches.push({ id: l.id, patch: { order_id: cands[0].id } });
    if (samples.length < SAMPLES) samples.push(`лід ${l.id.slice(0, 8)} → замовлення ${cands[0].number}`);
  }

  const applied = await applyPatches("crm_leads", patches, dryRun);
  return {
    pass: "orders",
    label: "Лід ↔ замовлення (детерміновано за канонічним клієнтом)",
    scanned: leads.length,
    planned: patches.length,
    applied,
    ambiguous,
    details,
    samples,
  };
}

/* ─────────── 4. Замір ↔ лід / клієнт ─────────── */

export async function reconcileMeasurements(dryRun: boolean): Promise<Crm2Result> {
  const measurements = await fetchAll("order_measurements", "id,order_id,lead_id,client_id");
  const leads = await fetchAll("crm_leads", "id,order_id,client_id");
  const orders = await fetchAll("orders", "id,client_id");

  const leadByOrder = uniqueBy(
    leads.filter((l: any) => l.order_id),
    (l: any) => l.order_id,
  );
  const clientByOrder = new Map(orders.map((o: any) => [o.id, o.client_id]));

  const details = { lead: 0, client: 0 };
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  const samples: string[] = [];
  let ambiguous = 0;

  for (const m of measurements) {
    const patch: Record<string, unknown> = {};
    if (!m.lead_id && m.order_id) {
      const lead = leadByOrder.map.get(m.order_id);
      if (lead) {
        patch.lead_id = (lead as any).id;
        details.lead += 1;
      } else if (leadByOrder.ambiguousKeys.has(m.order_id)) ambiguous += 1;
    }
    if (!m.client_id && m.order_id) {
      const cid = clientByOrder.get(m.order_id);
      if (cid) {
        patch.client_id = cid;
        details.client += 1;
      }
    }
    if (Object.keys(patch).length) {
      patches.push({ id: m.id, patch });
      if (samples.length < SAMPLES) samples.push(`замір ${m.id.slice(0, 8)} → ${Object.keys(patch).join(", ")}`);
    }
  }

  const applied = await applyPatches("order_measurements", patches, dryRun);
  return {
    pass: "measurements",
    label: "Замір ↔ лід / клієнт",
    scanned: measurements.length,
    planned: patches.length,
    applied,
    ambiguous,
    details,
    samples,
  };
}

/* ─────────── 5. Пропущений дзвінок → задача «передзвонити» ─────────── */

const CALLBACK_SLA_MIN = 60;

export async function missedCallCallbacks(dryRun: boolean, ownerId: string, days = 14): Promise<Crm2Result> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const calls = await fetchAll(
    "crm_calls",
    "id,phone_e164,client_id,lead_id,contact_id,started_at,direction,is_missed,duration_sec",
    (q: any) => q.gte("started_at", since),
  );
  const leads = await fetchAll("crm_leads", "id,assigned_to,phone_e164");
  const leadById = new Map(leads.map((l: any) => [l.id, l]));
  const existing = await fetchAll("crm_tasks", "id,external_key,status", (q: any) =>
    q.like("external_key", "callback:%"),
  );
  const haveTask = new Set(existing.map((t: any) => String(t.external_key)));

  // Успішний контакт після пропущеного: будь-який відповіданий дзвінок на цей номер пізніше.
  const successAfter = new Map<string, number[]>();
  for (const c of calls) {
    if (!c.phone_e164 || !c.started_at) continue;
    const ok = c.direction === "outbound" || (!c.is_missed && Number(c.duration_sec ?? 0) > 0);
    if (!ok) continue;
    const arr = successAfter.get(c.phone_e164) ?? [];
    arr.push(new Date(c.started_at).getTime());
    successAfter.set(c.phone_e164, arr);
  }

  const client = await db();
  const rows: any[] = [];
  const samples: string[] = [];
  let scanned = 0;

  for (const c of calls) {
    if (!c.is_missed || c.direction !== "inbound" || !c.started_at) continue;
    scanned += 1;
    const at = new Date(c.started_at).getTime();
    const covered = (successAfter.get(c.phone_e164 ?? "") ?? []).some((t) => t > at);
    if (covered) continue;
    const key = `callback:${c.id}`;
    if (haveTask.has(key)) continue;
    haveTask.add(key);
    const lead = c.lead_id ? leadById.get(c.lead_id) : null;
    rows.push({
      kind: "call",
      title: `Передзвонити: пропущений дзвінок ${c.phone_e164 ?? ""}`.trim(),
      description: `Пропущений вхідний ${new Date(c.started_at).toLocaleString("uk-UA")}`,
      due_at: new Date(at + CALLBACK_SLA_MIN * 60_000).toISOString(),
      status: "open",
      priority: "high",
      lead_id: c.lead_id ?? null,
      client_id: c.client_id ?? null,
      contact_id: c.contact_id ?? null,
      assigned_to: (lead as any)?.assigned_to ?? null,
      owner_id: (lead as any)?.assigned_to ?? ownerId,
      external_key: key,
    });
    if (samples.length < SAMPLES) samples.push(`${c.phone_e164} · ${new Date(c.started_at).toLocaleString("uk-UA")}`);
  }

  let applied = 0;
  if (!dryRun && rows.length) {
    // Ідемпотентність: external_key унікальний, дублікати просто пропускаємо.
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200);
      const { error } = await client.from("crm_tasks").insert(part);
      if (!error) {
        applied += part.length;
        continue;
      }
      for (const row of part) {
        const res = await client.from("crm_tasks").insert(row);
        if (!res.error) applied += 1;
        else if (res.error.code !== "23505") throw new Error(`Не вдалося створити задачу передзвону: ${res.error.message}`);
      }
    }
  }

  return {
    pass: "callbacks",
    label: "Пропущені дзвінки без передзвону → задача",
    scanned,
    planned: rows.length,
    applied,
    ambiguous: 0,
    details: { window_days: days, sla_minutes: CALLBACK_SLA_MIN },
    samples,
  };
}

export async function runCrm2Pass(pass: Crm2Pass, dryRun: boolean): Promise<Crm2Result> {
  switch (pass) {
    case "calls":
      return reconcileCalls(dryRun);
    case "sources":
      return recoverLeadSources(dryRun);
    case "orders":
      return reconcileOrders(dryRun);
    case "measurements":
      return reconcileMeasurements(dryRun);
    case "callbacks":
      return missedCallCallbacks(dryRun);
  }
}
