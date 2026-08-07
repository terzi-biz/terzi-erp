/**
 * Синхронізація keyCRM ↔ ERP TERZI.
 * Дедуплікація і захист від циклів — через таблицю integration_sync_links
 * (зберігаємо хеші зовнішнього та внутрішнього стану). Конфлікти — в чергу.
 */
import { admin } from "../../access.server";
import { sha256Hex } from "../signature.server";
import { logAttempt } from "../core.server";
import type { AdapterContext } from "../adapter.server";
import { KEYCRM_BASE_URL, KEYCRM_ENTITIES, KEYCRM_RPM, type SyncMode } from "../keycrm-constants";
import { createKeyCrmClient, type KeyCrmClient } from "./client.server";

/* --------------------------------- utils --------------------------------- */

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${k}:${stable(o[k])}`).join(",")}}`;
  }
  return String(value);
}

export const hashOf = (v: unknown) => sha256Hex(stable(v));

export function normPhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.length === 10 && digits.startsWith("0")) return `38${digits}`;
  if (digits.length === 9) return `380${digits}`;
  return digits;
}

function firstPhone(entry: any): string | null {
  if (!entry) return null;
  if (Array.isArray(entry)) return firstPhone(entry[0]);
  if (typeof entry === "object") return firstPhone(entry.value ?? entry.phone ?? entry.number);
  return String(entry);
}

export function entityPath(ctx: AdapterContext, key: string): string {
  const def = KEYCRM_ENTITIES.find((e) => e.key === key);
  const overrides = ((ctx.config as any)?.endpoints ?? {}) as Record<string, string>;
  return overrides[key] ?? def?.path ?? `/${key}`;
}

export function apiClient(ctx: AdapterContext): KeyCrmClient {
  const apiKey = ctx.secret("api_key");
  if (!apiKey) throw new Error("Не задано секрет api_key для keyCRM");
  return createKeyCrmClient({
    integrationId: ctx.integration.id,
    apiKey,
    baseUrl: String((ctx.config as any)?.base_url ?? KEYCRM_BASE_URL),
    rpm: Number((ctx.config as any)?.rpm ?? KEYCRM_RPM),
  });
}

/* ------------------------------- sync state ------------------------------ */

export async function getSyncModes(integrationId: string): Promise<Record<string, { mode: SyncMode; poll: boolean; intervalMin: number }>> {
  const db = await admin();
  const { data } = await db.from("integration_sync_settings").select("*").eq("integration_id", integrationId);
  const out: Record<string, { mode: SyncMode; poll: boolean; intervalMin: number }> = {};
  for (const r of (data ?? []) as any[]) {
    out[r.entity] = { mode: r.mode as SyncMode, poll: r.poll_enabled, intervalMin: r.poll_interval_min };
  }
  return out;
}

async function getState(integrationId: string, entity: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_sync_state")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("entity", entity)
    .maybeSingle();
  return (data as any) ?? null;
}

async function setState(integrationId: string, entity: string, patch: Record<string, unknown>) {
  const db = await admin();
  await db
    .from("integration_sync_state")
    .upsert({ integration_id: integrationId, entity, ...patch }, { onConflict: "integration_id,entity" });
}

export async function getLink(integrationId: string, entity: string, externalId: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_sync_links")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("entity", entity)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function getLinkByInternal(integrationId: string, entity: string, internalId: string) {
  const db = await admin();
  const { data } = await db
    .from("integration_sync_links")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("entity", entity)
    .eq("internal_id", internalId)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function upsertLink(row: {
  integrationId: string;
  entity: string;
  externalId: string;
  internalId?: string | null;
  internalTable?: string | null;
  externalHash?: string | null;
  internalHash?: string | null;
  direction: "inbound" | "outbound";
  externalUpdatedAt?: string | null;
  payload?: Record<string, unknown>;
}) {
  const db = await admin();
  await db.from("integration_sync_links").upsert(
    {
      integration_id: row.integrationId,
      entity: row.entity,
      external_id: row.externalId,
      internal_id: row.internalId ?? null,
      internal_table: row.internalTable ?? null,
      external_hash: row.externalHash ?? null,
      internal_hash: row.internalHash ?? null,
      last_direction: row.direction,
      last_synced_at: new Date().toISOString(),
      external_updated_at: row.externalUpdatedAt ?? null,
      payload: (row.payload ?? {}) as any,
    },
    { onConflict: "integration_id,entity,external_id" },
  );
}

async function raiseConflict(input: {
  integrationId: string;
  entity: string;
  externalId: string;
  internalId?: string | null;
  reason: string;
  external: unknown;
  internal: unknown;
}) {
  const db = await admin();
  const { data: existing } = await db
    .from("integration_conflicts")
    .select("id")
    .eq("integration_id", input.integrationId)
    .eq("entity", input.entity)
    .eq("external_id", input.externalId)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return;
  await db.from("integration_conflicts").insert({
    integration_id: input.integrationId,
    entity: input.entity,
    external_id: input.externalId,
    internal_id: input.internalId ?? null,
    reason: input.reason,
    external_value: (input.external ?? {}) as any,
    internal_value: (input.internal ?? {}) as any,
  });
}

async function ownerFor(ctx: AdapterContext): Promise<string | null> {
  const cfgOwner = (ctx.config as any)?.default_owner_id;
  if (cfgOwner) return String(cfgOwner);
  const db = await admin();
  const { data } = await db.from("integrations").select("created_by").eq("id", ctx.integration.id).maybeSingle();
  const creator = ((data as any)?.created_by as string) ?? null;
  if (creator) return creator;
  const { data: adminRole } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return ((adminRole as any)?.user_id as string) ?? null;
}

/** Аудит змін, зроблених синхронізацією (актор — системний, без користувача). */
async function auditSync(
  ctx: AdapterContext,
  input: { action: string; entity: string; externalId: string | null; internalId: string | null; table: string | null; payload?: unknown },
) {
  try {
    const db = await admin();
    await db.from("audit_logs").insert({
      actor_id: null,
      actor_name: "keyCRM sync",
      actor_role: "system",
      module: "integrations",
      action: input.action,
      entity_type: input.table ?? input.entity,
      entity_id: input.internalId ?? input.externalId,
      entity_label: `${input.entity} · keyCRM #${input.externalId ?? "—"}`,
      new_value: { integration_id: ctx.integration.id, entity: input.entity, external_id: input.externalId, internal_id: input.internalId, payload: input.payload ?? null } as any,
    });
  } catch {
    // Аудит не повинен зупиняти синхронізацію
  }
}

/* ------------------------------ ERP writers ------------------------------ */

async function applyPipeline(ctx: AdapterContext, ext: any) {
  const db = await admin();
  const externalId = String(ext.id);
  const link = await getLink(ctx.integration.id, "pipelines", externalId);
  const row = { key: `keycrm_${externalId}`, name: String(ext.title ?? ext.name ?? `Воронка ${externalId}`), is_active: ext.active !== false };
  let internalId = link?.internal_id ?? null;
  if (internalId) {
    await db.from("crm_pipelines").update(row).eq("id", internalId);
  } else {
    const { data: byKey } = await db.from("crm_pipelines").select("id").eq("key", row.key).maybeSingle();
    if (byKey) internalId = (byKey as any).id;
    else {
      const { data, error } = await db.from("crm_pipelines").insert(row).select("id").maybeSingle();
      if (error) throw error;
      internalId = (data as any).id;
    }
  }
  return { internalId, table: "crm_pipelines" };
}

async function applyStage(ctx: AdapterContext, ext: any) {
  const db = await admin();
  const externalId = String(ext.id);
  const pipeExt = ext.pipeline_id ?? ext.funnel_id ?? null;
  let pipelineId: string | null = null;
  if (pipeExt != null) {
    const pl = await getLink(ctx.integration.id, "pipelines", String(pipeExt));
    pipelineId = pl?.internal_id ?? null;
  }
  if (!pipelineId) {
    const { data: def } = await db.from("crm_pipelines").select("id").eq("is_default", true).maybeSingle();
    pipelineId = (def as any)?.id ?? null;
  }
  if (!pipelineId) throw new Error("Не знайдено воронку для статусу — спочатку синхронізуйте воронки");

  const link = await getLink(ctx.integration.id, "pipeline_statuses", externalId);
  const row = {
    pipeline_id: pipelineId,
    key: `keycrm_${externalId}`,
    name: String(ext.name ?? ext.title ?? `Статус ${externalId}`),
    sort_order: Number(ext.position ?? ext.sort ?? 0),
  };
  let internalId = link?.internal_id ?? null;
  if (internalId) await db.from("crm_stages").update(row).eq("id", internalId);
  else {
    const { data: byKey } = await db.from("crm_stages").select("id").eq("key", row.key).maybeSingle();
    if (byKey) internalId = (byKey as any).id;
    else {
      const { data, error } = await db.from("crm_stages").insert(row).select("id").maybeSingle();
      if (error) throw error;
      internalId = (data as any).id;
    }
  }
  return { internalId, table: "crm_stages" };
}

async function applyBuyer(ctx: AdapterContext, ext: any) {
  const db = await admin();
  const owner = await ownerFor(ctx);
  if (!owner) throw new Error("Не визначено власника записів — задайте default_owner_id у налаштуваннях");
  const externalId = String(ext.id);
  const phone = firstPhone(ext.phone ?? ext.phones);
  const phoneNorm = normPhone(phone);
  const email = Array.isArray(ext.email) ? ext.email[0] : (ext.email ?? null);
  const fullName = String(ext.full_name ?? ext.name ?? `Покупець ${externalId}`);

  const link = await getLink(ctx.integration.id, "buyers", externalId);
  let contactId: string | null = link?.internal_id ?? null;
  let clientId: string | null = null;

  const { data: existingClient } = await db
    .from("clients")
    .select("id")
    .eq("external_source", "keycrm")
    .eq("external_id", externalId)
    .maybeSingle();
  clientId = (existingClient as any)?.id ?? null;
  const clientRow = {
    name: fullName,
    phone: phone ?? null,
    email: email ?? null,
    external_source: "keycrm",
    external_id: externalId,
  };
  if (clientId) {
    const { error } = await db.from("clients").update(clientRow as any).eq("id", clientId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("clients").insert({ ...clientRow, owner_id: owner } as any).select("id").maybeSingle();
    if (error) throw error;
    clientId = (data as any)?.id ?? null;
  }

  if (!contactId) {
    const { data: byExt } = await db
      .from("crm_contacts")
      .select("id")
      .eq("external_source", "keycrm")
      .eq("external_id", externalId)
      .maybeSingle();
    contactId = (byExt as any)?.id ?? null;
  }
  if (!contactId && phoneNorm) {
    const { data: byPhone } = await db.from("crm_contacts").select("id").eq("phone_norm", phoneNorm).limit(1).maybeSingle();
    contactId = (byPhone as any)?.id ?? null;
  }

  const row: Record<string, unknown> = {
    full_name: fullName,
    phone: phone ?? null,
    email: email ?? null,
    company: ext.company?.name ?? ext.company_name ?? null,
    external_source: "keycrm",
    external_id: externalId,
    client_id: clientId,
  };
  if (contactId) {
    const { error } = await db.from("crm_contacts").update(row as any).eq("id", contactId);
    if (error) throw error;
  }
  else {
    const { data, error } = await db.from("crm_contacts").insert({ ...row, owner_id: owner } as any).select("id").maybeSingle();
    if (error) throw error;
    contactId = (data as any).id;
  }
  return { internalId: contactId, table: "crm_contacts" };
}

async function applyOrder(ctx: AdapterContext, ext: any) {
  const db = await admin();
  const owner = await ownerFor(ctx);
  if (!owner) throw new Error("Не визначено власника записів");
  const externalId = String(ext.id);
  const link = await getLink(ctx.integration.id, "orders", externalId);
  let internalId: string | null = link?.internal_id ?? null;
  const buyerExt = ext.buyer?.id ?? ext.buyer_id ?? ext.client_id ?? null;
  let clientId: string | null = null;
  if (buyerExt != null) {
    const buyerLink = await getLink(ctx.integration.id, "buyers", String(buyerExt));
    if (buyerLink?.internal_id) {
      const { data: contact } = await db.from("crm_contacts").select("client_id").eq("id", buyerLink.internal_id).maybeSingle();
      clientId = (contact as any)?.client_id ?? null;
    }
  }
  const row = {
    number: `KCRM-${externalId}`,
    name: String(ext.title ?? ext.name ?? `Замовлення keyCRM #${externalId}`),
    client_id: clientId,
    source: ext.source?.name ?? ext.source_name ?? ext.source ?? "keyCRM",
    address: ext.shipping?.address ?? ext.delivery_address ?? ext.address ?? null,
    crm_link: `keycrm:order:${externalId}`,
    notes: ext.manager_comment ?? ext.comment ?? null,
  };
  if (!internalId) {
    const { data: byNumber } = await db.from("orders").select("id").eq("number", row.number).maybeSingle();
    internalId = (byNumber as any)?.id ?? null;
  }
  if (internalId) {
    const { error } = await db.from("orders").update(row as any).eq("id", internalId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("orders").insert({ ...row, owner_id: owner } as any).select("id").maybeSingle();
    if (error) throw error;
    internalId = (data as any)?.id ?? null;
  }
  return { internalId, table: "orders" };
}

async function applyLeadCard(ctx: AdapterContext, ext: any) {
  const db = await admin();
  const owner = await ownerFor(ctx);
  if (!owner) throw new Error("Не визначено власника записів — задайте default_owner_id у налаштуваннях");
  const externalId = String(ext.id);

  let stageId: string | null = null;
  let pipelineId: string | null = null;
  const statusExt = ext.status_id ?? ext.pipeline_status_id ?? null;
  if (statusExt != null) {
    const sl = await getLink(ctx.integration.id, "pipeline_statuses", String(statusExt));
    stageId = sl?.internal_id ?? null;
  }
  if (stageId) {
    const { data: st } = await db.from("crm_stages").select("pipeline_id").eq("id", stageId).maybeSingle();
    pipelineId = (st as any)?.pipeline_id ?? null;
  }
  if (!pipelineId) {
    const pipeExt = ext.pipeline_id ?? null;
    if (pipeExt != null) {
      const pl = await getLink(ctx.integration.id, "pipelines", String(pipeExt));
      pipelineId = pl?.internal_id ?? null;
    }
  }
  if (!pipelineId) {
    const { data: def } = await db.from("crm_pipelines").select("id").eq("is_default", true).maybeSingle();
    pipelineId = (def as any)?.id ?? null;
  }
  if (!stageId && pipelineId) {
    const { data: st } = await db.from("crm_stages").select("id").eq("pipeline_id", pipelineId).order("sort_order").limit(1).maybeSingle();
    stageId = (st as any)?.id ?? null;
  }

  // Контакт ліда — через покупця або контактні дані картки.
  let contactId: string | null = null;
  const buyerExt = ext.buyer?.id ?? ext.buyer_id ?? ext.client_id ?? null;
  if (buyerExt != null) {
    const bl = await getLink(ctx.integration.id, "buyers", String(buyerExt));
    contactId = bl?.internal_id ?? null;
    if (!contactId && ext.buyer) {
      const applied = await applyBuyer(ctx, ext.buyer);
      contactId = applied.internalId;
      await upsertLink({
        integrationId: ctx.integration.id,
        entity: "buyers",
        externalId: String(buyerExt),
        internalId: contactId,
        internalTable: "crm_contacts",
        externalHash: await hashOf(ext.buyer),
        direction: "inbound",
      });
    }
  }

  const utm = ext.utm_source || ext.utm
    ? {
        source: ext.utm_source ?? ext.utm?.source ?? null,
        medium: ext.utm_medium ?? ext.utm?.medium ?? null,
        campaign: ext.utm_campaign ?? ext.utm?.campaign ?? null,
        content: ext.utm_content ?? ext.utm?.content ?? null,
        term: ext.utm_term ?? ext.utm?.term ?? null,
      }
    : {};

  // Джерело: назва з довідника keyCRM (імпортується раніше як reference).
  let sourceName: string | null = ext.source?.name ?? ext.source_name ?? (typeof ext.source === "string" ? ext.source : null);
  if (!sourceName && ext.source_id != null) {
    const sl = await getLink(ctx.integration.id, "sources", String(ext.source_id));
    const p = (sl?.payload ?? {}) as Record<string, unknown>;
    sourceName = (p.name as string) ?? (p.title as string) ?? null;
  }

  const createdAt = ext.created_at ?? ext.createdAt ?? null;

  const row: Record<string, unknown> = {
    title: String(ext.title ?? ext.name ?? `Лід keyCRM #${externalId}`),
    pipeline_id: pipelineId,
    stage_id: stageId,
    contact_id: contactId,
    source: sourceName,
    budget: ext.total_price ?? ext.amount ?? null,
    notes: ext.comment ?? ext.manager_comment ?? null,
    utm: utm as any,
    external_source: "keycrm",
    external_id: externalId,
    ...(createdAt ? { created_at: new Date(String(createdAt).replace(" ", "T") + (String(createdAt).includes("Z") || String(createdAt).includes("+") ? "" : "Z")).toISOString() } : {}),
  };


  const link = await getLink(ctx.integration.id, "lead_cards", externalId);
  let leadId: string | null = link?.internal_id ?? null;
  if (!leadId) {
    const { data: byExt } = await db
      .from("crm_leads")
      .select("id")
      .eq("external_source", "keycrm")
      .eq("external_id", externalId)
      .maybeSingle();
    leadId = (byExt as any)?.id ?? null;
  }
  if (leadId) await db.from("crm_leads").update(row as any).eq("id", leadId);
  else {
    const { data, error } = await db.from("crm_leads").insert({ ...row, owner_id: owner } as any).select("id").maybeSingle();
    if (error) throw error;
    leadId = (data as any).id;
  }
  return { internalId: leadId, table: "crm_leads" };
}

/** Довідники (замовлення, оплати, компанії, джерела, відповідальні, коментарі, поля). */
async function applyReference(ctx: AdapterContext, entity: string, ext: any) {
  await upsertLink({
    integrationId: ctx.integration.id,
    entity,
    externalId: String(ext.id ?? ext.uuid ?? ext.key ?? JSON.stringify(ext).slice(0, 40)),
    internalId: null,
    internalTable: null,
    externalHash: await hashOf(ext),
    direction: "inbound",
    externalUpdatedAt: ext.updated_at ?? null,
    payload: ext,
  });
  return { internalId: null, table: null };
}

/** Запис однієї зовнішньої сутності в ERP із захистом від дублів і циклів. */
export async function applyExternal(ctx: AdapterContext, entity: string, ext: any, mode: SyncMode) {
  const externalId = String(ext?.id ?? "");
  if (!externalId) return { skipped: true, reason: "no_external_id" };
  const link = await getLink(ctx.integration.id, entity, externalId);
  const externalUpdatedAt = ext?.updated_at ?? ext?.modified_at ?? ext?.created_at ?? null;

  if (link?.external_updated_at && externalUpdatedAt) {
    const storedTime = new Date(link.external_updated_at).getTime();
    const incomingTime = new Date(externalUpdatedAt).getTime();
    if (Number.isFinite(storedTime) && Number.isFinite(incomingTime) && incomingTime <= storedTime) {
      return { skipped: true, reason: "not_newer" };
    }
  }

  const extHash = await hashOf(ext);

  const materializedEntities = new Set(["pipelines", "pipeline_statuses", "buyers", "lead_cards", "orders", "comments"]);
  if (link?.external_hash === extHash && (!materializedEntities.has(entity) || link.internal_id)) {
    return { skipped: true, reason: "unchanged" };
  }

  if (mode === "bidirectional" && link?.internal_id && link.internal_table) {
    const db = await admin();
    const { data: current } = await db.from(link.internal_table as any).select("*").eq("id", link.internal_id).maybeSingle();
    if (current) {
      const curHash = await hashOf(current);
      if (link.internal_hash && curHash !== link.internal_hash) {
        await raiseConflict({
          integrationId: ctx.integration.id,
          entity,
          externalId,
          internalId: link.internal_id,
          reason: "Запис змінено з обох боків",
          external: ext,
          internal: current,
        });
        return { skipped: true, reason: "conflict" };
      }
    }
  }

  let result: { internalId: string | null; table: string | null };
  switch (entity) {
    case "pipelines": result = await applyPipeline(ctx, ext); break;
    case "pipeline_statuses": result = await applyStage(ctx, ext); break;
    case "buyers": result = await applyBuyer(ctx, ext); break;
    case "lead_cards": result = await applyLeadCard(ctx, ext); break;
    case "orders": result = await applyOrder(ctx, ext); break;
    default: result = await applyReference(ctx, entity, ext); break;
  }

  let internalHash: string | null = null;
  if (result.internalId && result.table) {
    const db = await admin();
    const { data: saved } = await db.from(result.table as any).select("*").eq("id", result.internalId).maybeSingle();
    internalHash = saved ? await hashOf(saved) : null;
  }

  await upsertLink({
    integrationId: ctx.integration.id,
    entity,
    externalId,
    internalId: result.internalId,
    internalTable: result.table,
    externalHash: extHash,
    internalHash,
    direction: "inbound",
    externalUpdatedAt,
    payload: entity === "orders" || entity === "payments" ? ext : {},
  });

  await auditSync(ctx, { action: "sync_inbound_apply", entity, externalId, internalId: result.internalId, table: result.table, payload: ext });
  return { skipped: false, internalId: result.internalId };
}

/* ------------------------------- outbound -------------------------------- */

/** Надсилання запису ERP у keyCRM. Захист від циклу: хеш не змінився → пропуск. */
export async function pushInternal(ctx: AdapterContext, entity: string, internalId: string) {
  const db = await admin();
  const table = entity === "lead_cards" ? "crm_leads" : entity === "buyers" ? "crm_contacts" : null;
  if (!table) throw new Error(`Вихідна синхронізація для «${entity}» не підтримується`);
  const { data: row } = await db.from(table as any).select("*").eq("id", internalId).maybeSingle();
  if (!row) throw new Error("Запис ERP не знайдено");
  const current = row as any;
  const curHash = await hashOf(current);

  const link = await getLinkByInternal(ctx.integration.id, entity, internalId);
  if (link?.internal_hash === curHash) return { ok: true, message: "Без змін — пропущено (захист від циклу)" };

  const client = apiClient(ctx);
  const path = entityPath(ctx, entity);

  let body: Record<string, unknown>;
  if (entity === "buyers") {
    body = {
      full_name: current.full_name,
      email: current.email ? [current.email] : undefined,
      phone: current.phone ? [current.phone] : undefined,
    };
  } else {
    body = {
      title: current.title,
      source_id: (ctx.config as any)?.default_source_id ?? undefined,
      manager_comment: current.notes ?? undefined,
      contact: current.contact_id ? undefined : undefined,
    };
  }

  const externalId = link?.external_id ?? null;
  const res = externalId ? await client.put(`${path}/${externalId}`, body) : await client.post(path, body);
  const newExternalId = String(res?.id ?? res?.data?.id ?? externalId ?? "");
  if (!newExternalId) throw new Error("keyCRM не повернув ідентифікатор запису");

  await upsertLink({
    integrationId: ctx.integration.id,
    entity,
    externalId: newExternalId,
    internalId,
    internalTable: table,
    externalHash: await hashOf(res?.data ?? res ?? {}),
    internalHash: curHash,
    direction: "outbound",
  });
  await auditSync(ctx, { action: "sync_outbound_push", entity, externalId: newExternalId, internalId, table, payload: body });
  return { ok: true, message: externalId ? `Оновлено в keyCRM (#${newExternalId})` : `Створено в keyCRM (#${newExternalId})`, data: res };
}

/* -------------------------------- polling -------------------------------- */

/** Опитування змін за updated_at із збереженням last_sync_at і пагінацією. */
export async function pollEntity(
  ctx: AdapterContext,
  entity: string,
  opts: { mode: SyncMode; full?: boolean; maxPages?: number; dryRun?: boolean },
) {
  const client = apiClient(ctx);
  const path = entityPath(ctx, entity);
  const state = await getState(ctx.integration.id, entity);
  const since = opts.full ? null : (state?.last_sync_at ?? null);
  const startedAt = new Date().toISOString();

  const query: Record<string, unknown> = { limit: Number((ctx.config as any)?.page_size ?? 50) };
  const filterParam = ((ctx.config as any)?.updated_filter_param ?? null) as string | null;
  if (since && filterParam) query[filterParam] = since;
  if (entity === "lead_cards" || entity === "orders") query.include = (ctx.config as any)?.[`include_${entity}`] ?? undefined;

  let items: any[] = [];
  try {
    if (entity === "pipeline_statuses") {
      // keyCRM віддає статуси лише в межах конкретної воронки.
      const pipelines = await client.paginate(entityPath(ctx, "pipelines"), { limit: 50 }, 3);
      for (const p of pipelines) {
        const rows = await client.paginate(`${entityPath(ctx, "pipelines")}/${p.id}/statuses`, { limit: 50 }, 3);
        items.push(...rows.map((r: any) => ({ ...r, pipeline_id: r.pipeline_id ?? p.id })));
      }
    } else {
      items = await client.paginate(path, query, opts.maxPages ?? 5);
    }
  } catch (e: any) {
    if (!opts.dryRun) {
      await setState(ctx.integration.id, entity, { last_run_at: startedAt, last_status: "error", last_error: e?.message ?? String(e) });
    }
    throw e;
  }

  if (since && !filterParam) {
    items = items.filter((i) => {
      const u = i?.updated_at ?? i?.created_at ?? null;
      return !u || new Date(u).getTime() >= new Date(since).getTime() - 60_000;
    });
  }

  // Пробний прогін: лише читання з keyCRM, без жодного запису в ERP.
  if (opts.dryRun) {
    return {
      entity,
      dryRun: true,
      received: items.length,
      applied: 0,
      skipped: items.length,
      failed: 0,
      sample: items.slice(0, 3).map((i: any) => ({ id: i?.id ?? null, title: i?.title ?? i?.name ?? i?.full_name ?? null })),
    };
  }

  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await applyExternal(ctx, entity, item, opts.mode);
      if (res.skipped) skipped += 1;
      else applied += 1;
      if (!res.skipped && entity === "orders") await extractOrderChildren(ctx, item);
      if (!res.skipped && entity === "lead_cards") await extractLeadComments(ctx, item);
    } catch (e: any) {
      failed += 1;
      await logAttempt({
        integrationId: ctx.integration.id,
        level: "warn",
        message: `keyCRM ${entity}: ${e?.message ?? e}`,
        request: { entity, id: item?.id },
      });
    }
  }

  await setState(ctx.integration.id, entity, {
    last_sync_at: startedAt,
    last_run_at: startedAt,
    last_status: failed ? "partial" : "ok",
    last_error: null,
    stats: { received: items.length, applied, skipped, failed },
  });

  return { entity, received: items.length, applied, skipped, failed };
}


/** Оплати всередині замовлення зберігаємо як окремі довідникові звʼязки. */
async function extractOrderChildren(ctx: AdapterContext, order: any) {
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  for (const p of payments) {
    await applyReference(ctx, "payments", { ...p, order_id: order.id, id: p.id ?? `${order.id}-${p.payment_method_id ?? "p"}` });
  }
}

async function extractLeadComments(ctx: AdapterContext, card: any) {
  const comments = Array.isArray(card?.comments) ? card.comments : [];
  const leadLink = await getLink(ctx.integration.id, "lead_cards", String(card.id));
  if (!leadLink?.internal_id) return;
  const db = await admin();
  for (const c of comments) {
    const externalId = String(c.id ?? `${card.id}-${await hashOf(c)}`);
    const existing = await getLink(ctx.integration.id, "comments", externalId);
    const externalHash = await hashOf(c);
    if (existing?.external_hash === externalHash) continue;
    const { data, error } = await db
      .from("crm_lead_activities")
      .insert({
        lead_id: leadLink.internal_id,
        actor_name: c.author?.name ?? c.user?.name ?? "keyCRM",
        kind: "comment",
        body: String(c.comment ?? c.text ?? c.body ?? "Коментар keyCRM"),
        meta: { external_source: "keycrm", external_id: externalId, created_at: c.created_at ?? null },
      } as any)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    await upsertLink({
      integrationId: ctx.integration.id,
      entity: "comments",
      externalId,
      internalId: (data as any)?.id ?? null,
      internalTable: "crm_lead_activities",
      externalHash,
      direction: "inbound",
      externalUpdatedAt: c.updated_at ?? c.created_at ?? null,
    });
  }
}

/** Повний прогін увімкнених сутностей у правильному порядку. */
export async function runKeyCrmSync(ctx: AdapterContext, opts: { entities?: string[]; full?: boolean; dryRun?: boolean } = {}) {
  const modes = await getSyncModes(ctx.integration.id);
  const results: any[] = [];
  for (const def of KEYCRM_ENTITIES) {
    if (opts.entities && !opts.entities.includes(def.key)) continue;
    const setting = modes[def.key];
    const mode = setting?.mode ?? "off";
    // Пробний прогін читає навіть вимкнені сутності — записів у ERP не буде.
    if (!opts.dryRun && (mode === "off" || mode === "erp_master")) continue;
    if (!opts.dryRun && !opts.entities && !setting?.poll) continue;
    try {
      results.push(await pollEntity(ctx, def.key, { mode, full: opts.full, dryRun: opts.dryRun }));
    } catch (e: any) {
      results.push({ entity: def.key, error: e?.message ?? String(e) });
    }
  }
  return results;
}
