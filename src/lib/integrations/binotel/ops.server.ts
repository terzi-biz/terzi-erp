/** Операції інтеграції Binotel (лише сервер). */
import process from "node:process";
import { admin, loadActor, requireAccessManager, requirePermission, writeAudit } from "../../access.server";
import { logAttempt, maskHint, readSecret } from "../core.server";
import { BINOTEL_SECRET_KEYS, BINOTEL_SECRET_REFS, BINOTEL_BASE_URL } from "../binotel-constants";
import { binotelRequest, extractCollection, BinotelError } from "./client.server";

const PROVIDER = "binotel";

async function canView(userId: string) {
  const actor = await loadActor(userId);
  if (actor.canManage) return actor;
  return requirePermission(userId, "integrations", "view");
}

/** Активне підключення Binotel (перше створене). */
export async function getBinotelIntegration() {
  const db = await admin();
  const { data } = await db
    .from("integrations")
    .select("*")
    .eq("provider_key", PROVIDER)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Читання credentials: спершу привʼязані secret_ref, далі стандартні імена змінних. */
export async function binotelCreds(integrationId?: string | null) {
  const db = await admin();
  const refs = new Map<string, string>();
  if (integrationId) {
    const { data } = await db.from("integration_secrets").select("secret_key,secret_ref").eq("integration_id", integrationId);
    for (const r of (data ?? []) as any[]) refs.set(r.secret_key, r.secret_ref);
  }
  const pick = (key: (typeof BINOTEL_SECRET_KEYS)[number]) => readSecret(refs.get(key) ?? BINOTEL_SECRET_REFS[key]);
  return {
    key: pick("api_key"),
    secret: pick("api_secret"),
    companyId: pick("company_id"),
    webhookToken: pick("webhook_token"),
  };
}

function requireCreds(c: { key: string | null; secret: string | null }) {
  if (!c.key || !c.secret) {
    throw new Error("Не задано BINOTEL_API_KEY та BINOTEL_API_SECRET. Додайте секрети у налаштуваннях бекенду.");
  }
  return { key: c.key, secret: c.secret };
}

/** Стан підключення для панелі: наявність секретів (без значень), вебхуки, лічильники. */
export async function binotelStatusOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  const creds = await binotelCreds(integration?.id ?? null);
  const [{ count: employees }, { count: mapped }, { count: pbx }, { count: calls }] = await Promise.all([
    db.from("binotel_employee_mappings").select("id", { count: "exact", head: true }),
    db.from("binotel_employee_mappings").select("id", { count: "exact", head: true }).not("local_user_id", "is", null),
    db.from("binotel_pbx_mappings").select("id", { count: "exact", head: true }),
    db.from("crm_calls").select("id", { count: "exact", head: true }).eq("external_source", PROVIDER),
  ]);
  const { data: hooks } = integration
    ? await db.from("integration_webhooks").select("*").eq("integration_id", integration.id)
    : { data: [] as any[] };

  return {
    integration: integration
      ? {
          id: integration.id,
          name: integration.name,
          slug: integration.slug,
          status: integration.status,
          enabled: integration.enabled,
          last_test_at: integration.last_test_at,
          last_test_ok: integration.last_test_ok,
          last_error: integration.last_error,
        }
      : null,
    baseUrl: BINOTEL_BASE_URL,
    secrets: {
      api_key: { is_set: Boolean(creds.key), hint: maskHint(creds.key) },
      api_secret: { is_set: Boolean(creds.secret), hint: creds.secret ? "***" : null },
      company_id: { is_set: Boolean(creds.companyId), hint: maskHint(creds.companyId) },
      webhook_token: { is_set: Boolean(creds.webhookToken), hint: creds.webhookToken ? "***" : null },
    },
    webhooks: (hooks ?? []).map((h: any) => ({ id: h.id, slug: h.slug, direction: h.direction, enabled: h.enabled, last_call_at: h.last_call_at })),
    counters: { employees: employees ?? 0, mapped: mapped ?? 0, pbx: pbx ?? 0, calls: calls ?? 0 },
  };
}

/** Створює підключення Binotel і привʼязує посилання на секрети (значення — у бекенді). */
export async function ensureBinotelIntegrationOp(userId: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  let integration = await getBinotelIntegration();
  if (!integration) {
    const { data, error } = await db
      .from("integrations")
      .insert({
        provider_key: PROVIDER,
        name: "Binotel",
        slug: "binotel",
        status: "connecting",
        enabled: true,
        config: { base_url: BINOTEL_BASE_URL, manifest: { status: "configured", base_url: BINOTEL_BASE_URL } },
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Не вдалося створити підключення: ${error.message}`);
    integration = data as any;
    await writeAudit(actor, {
      module: "integrations",
      action: "create",
      entityType: "integration",
      entityId: integration.id,
      entityLabel: "Binotel",
    });
  }

  for (const key of BINOTEL_SECRET_KEYS) {
    const ref = BINOTEL_SECRET_REFS[key];
    const { data: existing } = await db
      .from("integration_secrets")
      .select("id")
      .eq("integration_id", integration.id)
      .eq("secret_key", key)
      .maybeSingle();
    const value = readSecret(ref);
    const row = {
      integration_id: integration.id,
      secret_key: key,
      secret_ref: ref,
      masked_hint: value ? maskHint(value) : null,
      updated_by: userId,
      updated_by_name: actor.name ?? null,
    };
    if (existing) await db.from("integration_secrets").update(row).eq("id", (existing as any).id);
    else await db.from("integration_secrets").insert(row);
  }

  // Дефолтні налаштування Binotel.
  const { data: settings } = await db.from("binotel_settings").select("id").eq("integration_id", integration.id).maybeSingle();
  if (!settings) await db.from("binotel_settings").insert({ integration_id: integration.id, updated_by: userId });

  return { id: integration.id, slug: integration.slug };
}

/** Перевірка REST-зʼєднання: реальний виклик списку співробітників. */
export async function binotelTestConnectionOp(userId: string) {
  await requireAccessManager(userId);
  const integration = await getBinotelIntegration();
  const creds = await binotelCreds(integration?.id ?? null);
  const db = await admin();
  const started = Date.now();
  try {
    const auth = requireCreds(creds);
    const res = await binotelRequest(auth, "employees", {}, { integrationId: integration?.id ?? null });
    const list = extractCollection(res, ["listOfEmployees", "employeesData", "employees", "data"]);
    if (integration) {
      await db
        .from("integrations")
        .update({ status: "active", last_test_at: new Date().toISOString(), last_test_ok: true, last_success_at: new Date().toISOString(), last_error: null })
        .eq("id", integration.id);
    }
    return { ok: true, message: `Зʼєднання успішне. Отримано співробітників: ${list.length}`, employees: list.length, durationMs: Date.now() - started };
  } catch (e: any) {
    const message = e instanceof BinotelError ? e.message : (e?.message ?? "Помилка зʼєднання");
    if (integration) {
      await db
        .from("integrations")
        .update({ status: "error", last_test_at: new Date().toISOString(), last_test_ok: false, last_error: message, last_error_at: new Date().toISOString() })
        .eq("id", integration.id);
    }
    await logAttempt({ integrationId: integration?.id ?? null, level: "error", message: `Binotel test: ${message}` });
    return { ok: false, message, employees: 0, durationMs: Date.now() - started };
  }
}

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

/** Імпорт співробітників Binotel і автозіставлення з ERP за email → внутрішнім номером. */
export async function binotelSyncEmployeesOp(userId: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  const auth = requireCreds(await binotelCreds(integration?.id ?? null));

  const res = await binotelRequest(auth, "employees", {}, { integrationId: integration?.id ?? null });
  const list = extractCollection(res, ["listOfEmployees", "employeesData", "employees", "data"]);

  const { data: profiles } = await db.from("profiles").select("user_id,email,display_name,phone,department,position");
  const byEmail = new Map((profiles ?? []).map((p: any) => [String(p.email ?? "").toLowerCase(), p]));
  const byPhoneTail = new Map(
    (profiles ?? [])
      .filter((p: any) => p.phone)
      .map((p: any) => [String(p.phone).replace(/\D/g, "").slice(-4), p]),
  );

  let created = 0;
  let updated = 0;
  let autoMapped = 0;

  for (const raw of list) {
    const extId = str(raw.employeeID ?? raw.employee_id ?? raw.id);
    const email = str(raw.email ?? raw.employeeEmail)?.toLowerCase() ?? null;
    const internal = str(raw.endpointData?.internalNumber ?? raw.internalNumber ?? raw.internal_number);
    const name = str(raw.name ?? raw.employeeName ?? raw.fullName);
    if (!extId && !internal && !email) continue;

    const { data: existing } = extId
      ? await db.from("binotel_employee_mappings").select("*").eq("binotel_employee_id", extId).maybeSingle()
      : await db.from("binotel_employee_mappings").select("*").eq("binotel_internal_number", internal ?? "").maybeSingle();

    // Автозіставлення лише за email або внутрішнім номером — ніколи за іменем.
    let localUserId = (existing as any)?.local_user_id ?? null;
    let mappingStatus = (existing as any)?.mapping_status ?? "unmapped";
    if (!localUserId && mappingStatus !== "manual") {
      const match = (email ? byEmail.get(email) : null) ?? (internal ? byPhoneTail.get(internal.replace(/\D/g, "").slice(-4)) : null);
      if (match) {
        localUserId = match.user_id;
        mappingStatus = "auto";
        autoMapped++;
      }
    }

    const row = {
      binotel_employee_id: extId,
      binotel_email: email,
      binotel_internal_number: internal,
      binotel_employee_name: name,
      local_user_id: localUserId,
      department: str(raw.department) ?? null,
      is_active: raw.status === undefined ? true : String(raw.status) !== "0",
      mapping_status: mappingStatus,
      last_synced_at: new Date().toISOString(),
      raw: raw as any,
    };

    if (existing) {
      await db.from("binotel_employee_mappings").update(row).eq("id", (existing as any).id);
      updated++;
    } else {
      await db.from("binotel_employee_mappings").insert(row);
      created++;
    }
  }

  await writeAudit(actor, {
    module: "integrations",
    action: "sync",
    entityType: "binotel_employees",
    entityLabel: `Імпорт співробітників Binotel: +${created}, оновлено ${updated}`,
  });

  return { total: list.length, created, updated, autoMapped };
}

export async function binotelListEmployeeMappingsOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    db.from("binotel_employee_mappings").select("*").order("binotel_employee_name", { nullsFirst: false }),
    db.from("profiles").select("user_id,display_name,email"),
  ]);
  const pMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
  return (rows ?? []).map((r: any) => ({
    ...r,
    local_user_name: pMap.get(r.local_user_id)?.display_name ?? pMap.get(r.local_user_id)?.email ?? null,
  }));
}

export async function binotelSetEmployeeMappingOp(userId: string, input: { id: string; localUserId: string | null }) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { data, error } = await db
    .from("binotel_employee_mappings")
    .update({ local_user_id: input.localUserId, mapping_status: input.localUserId ? "manual" : "unmapped" })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`Не вдалося зберегти зіставлення: ${error.message}`);
  await writeAudit(actor, {
    module: "integrations",
    action: "update",
    entityType: "binotel_employee_mapping",
    entityId: input.id,
    entityLabel: (data as any)?.binotel_employee_name ?? "Співробітник Binotel",
  });
  return data;
}

export async function binotelListPbxOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const [{ data: rows }, { data: pipelines }, { data: stages }] = await Promise.all([
    db.from("binotel_pbx_mappings").select("*").order("pbx_number"),
    db.from("crm_pipelines").select("id,name,is_active").eq("is_active", true).order("sort_order"),
    db.from("crm_stages").select("id,name,pipeline_id").order("sort_order"),
  ]);
  return { rows: rows ?? [], pipelines: pipelines ?? [], stages: stages ?? [] };
}

export async function binotelSavePbxOp(
  userId: string,
  input: {
    id?: string | null;
    pbxNumber: string;
    pbxNumberName?: string | null;
    pipelineId?: string | null;
    stageId?: string | null;
    serviceDirection?: string | null;
    defaultAssignee?: string | null;
    sourceLabel?: string | null;
    isActive?: boolean;
  },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const row = {
    pbx_number: input.pbxNumber.trim(),
    pbx_number_name: input.pbxNumberName ?? null,
    pipeline_id: input.pipelineId ?? null,
    stage_id: input.stageId ?? null,
    service_direction: input.serviceDirection ?? null,
    default_assignee: input.defaultAssignee ?? null,
    source_label: input.sourceLabel ?? null,
    is_active: input.isActive ?? true,
  };
  const { data, error } = input.id
    ? await db.from("binotel_pbx_mappings").update(row).eq("id", input.id).select("*").single()
    : await db.from("binotel_pbx_mappings").upsert(row, { onConflict: "pbx_number" }).select("*").single();
  if (error) throw new Error(`Не вдалося зберегти номер АТС: ${error.message}`);
  await writeAudit(actor, {
    module: "integrations",
    action: input.id ? "update" : "create",
    entityType: "binotel_pbx_mapping",
    entityId: (data as any)?.id,
    entityLabel: row.pbx_number,
  });
  return data;
}

export async function binotelDeletePbxOp(userId: string, id: string) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const { error } = await db.from("binotel_pbx_mappings").delete().eq("id", id);
  if (error) throw new Error(`Не вдалося видалити: ${error.message}`);
  await writeAudit(actor, { module: "integrations", action: "delete", entityType: "binotel_pbx_mapping", entityId: id });
  return { ok: true };
}

/**
 * Довідника номерів АТС у REST API 4.0 немає (метод відсутній), тому список
 * лінійних номерів збираємо з фактичних дзвінків за останні дні (`pbxNumberData`).
 * Створює лише відсутні записи, наявні налаштування не змінює.
 */
export async function binotelSyncPbxOp(userId: string, days = 7) {
  await requireAccessManager(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  const auth = requireCreds(await binotelCreds(integration?.id ?? null));

  const stop = Math.floor(Date.now() / 1000);
  const found = new Map<string, string | null>();
  // Вікна по 24 години, щоб не перевищувати обмеження періоду.
  for (let d = 0; d < days; d++) {
    const windowStop = stop - d * 86_400;
    const windowStart = windowStop - 86_400;
    const res = await binotelRequest(auth, "callsForPeriod", { startTime: windowStart, stopTime: windowStop }, { integrationId: integration?.id ?? null, quiet: true });
    const calls = extractCollection(res, ["callDetails", "calls", "data"]);
    for (const c of calls) {
      const number = str(c?.pbxNumberData?.number);
      if (number && !found.has(number)) found.set(number, str(c?.pbxNumberData?.name));
    }
  }

  let created = 0;
  for (const [number, name] of found) {
    const { data: exists } = await db.from("binotel_pbx_mappings").select("id").eq("pbx_number", number).maybeSingle();
    if (exists) continue;
    await db.from("binotel_pbx_mappings").insert({ pbx_number: number, pbx_number_name: name });
    created++;
  }
  return { total: found.size, created };
}

/**
 * Підтягує історію дзвінків REST API у CRM. Старі дзвінки не запускають
 * автоматичне створення лідів/контактів/задач, але зіставляються з наявними
 * сутностями за телефоном. Повторний запуск безпечний: external_id оновлюється.
 */
export async function binotelSyncCallHistoryOp(userId: string, days = 7) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  if (!integration) throw new Error("Спочатку створіть підключення Binotel");
  const auth = requireCreds(await binotelCreds(integration.id));
  const safeDays = Math.min(Math.max(Math.round(days), 1), 31);
  const { handleCallCompleted } = await import("./calls.server");

  let received = 0;
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];
  const stop = Math.floor(Date.now() / 1000);

  for (let day = 0; day < safeDays; day++) {
    const windowStop = stop - day * 86_400;
    const windowStart = windowStop - 86_400;
    const response = await binotelRequest(
      auth,
      "callsForPeriod",
      { startTime: windowStart, stopTime: windowStop },
      { integrationId: integration.id, quiet: true },
    );
    const calls = extractCollection(response, ["callDetails", "calls", "data"]);
    received += calls.length;

    for (const call of calls) {
      try {
        const result = await handleCallCompleted(integration.id, call, { runAutomations: false });
        if (result.call_id) applied++;
        else failed++;
      } catch (error) {
        failed++;
        if (errors.length < 5) errors.push(error instanceof Error ? error.message : "Невідома помилка");
      }
    }
  }

  const syncedAt = new Date().toISOString();
  await db
    .from("integrations")
    .update({
      status: failed > 0 && applied === 0 ? "error" : "active",
      last_sync_at: syncedAt,
      last_success_at: applied > 0 ? syncedAt : integration.last_success_at,
      last_error: errors[0] ?? null,
      last_error_at: errors.length ? syncedAt : null,
    } as any)
    .eq("id", integration.id);

  await writeAudit(actor, {
    module: "integrations",
    action: "sync",
    entityType: "binotel_calls",
    entityLabel: `Історія Binotel за ${safeDays} дн.: отримано ${received}, оброблено ${applied}`,
    isCritical: true,
    newValue: { days: safeDays, received, applied, failed },
  });

  return { days: safeDays, received, applied, failed, errors };
}

export async function binotelGetSettingsOp(userId: string) {
  await canView(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  if (!integration) return null;
  const { data } = await db.from("binotel_settings").select("*").eq("integration_id", integration.id).maybeSingle();
  return data ?? null;
}

export async function binotelSaveSettingsOp(
  userId: string,
  input: {
    missedSlaMinutes?: number;
    escalationMinutes?: number;
    autoCreateLead?: boolean;
    autoCreateContact?: boolean;
    autoCreateMissedTask?: boolean;
    routeToAssignedManager?: boolean;
    defaultPipelineId?: string | null;
    defaultStageId?: string | null;
    reconcileWindowHours?: number;
  },
) {
  const actor = await requireAccessManager(userId);
  const db = await admin();
  const integration = await getBinotelIntegration();
  if (!integration) throw new Error("Спочатку створіть підключення Binotel");
  const row: Record<string, unknown> = { integration_id: integration.id, updated_by: userId };
  if (input.missedSlaMinutes !== undefined) row.missed_sla_minutes = input.missedSlaMinutes;
  if (input.escalationMinutes !== undefined) row.escalation_minutes = input.escalationMinutes;
  if (input.autoCreateLead !== undefined) row.auto_create_lead = input.autoCreateLead;
  if (input.autoCreateContact !== undefined) row.auto_create_contact = input.autoCreateContact;
  if (input.autoCreateMissedTask !== undefined) row.auto_create_missed_task = input.autoCreateMissedTask;
  if (input.routeToAssignedManager !== undefined) row.route_to_assigned_manager = input.routeToAssignedManager;
  if (input.defaultPipelineId !== undefined) row.default_pipeline_id = input.defaultPipelineId;
  if (input.defaultStageId !== undefined) row.default_stage_id = input.defaultStageId;
  if (input.reconcileWindowHours !== undefined) row.reconcile_window_hours = input.reconcileWindowHours;

  const { data, error } = await db.from("binotel_settings").upsert(row, { onConflict: "integration_id" }).select("*").single();
  if (error) throw new Error(`Не вдалося зберегти налаштування: ${error.message}`);
  await writeAudit(actor, { module: "integrations", action: "update", entityType: "binotel_settings", entityId: integration.id, entityLabel: "Налаштування Binotel" });
  return data;
}

/** URL вебхуків для налаштування в кабінеті Binotel (без секретів у самому URL). */
export async function binotelWebhookUrlsOp(userId: string) {
  await canView(userId);
  const base = (process.env.ERP_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  const creds = await binotelCreds((await getBinotelIntegration())?.id ?? null);
  return {
    baseConfigured: Boolean(base),
    tokenConfigured: Boolean(creds.webhookToken),
    callSettings: `${base || "{ERP_PUBLIC_BASE_URL}"}/api/public/integrations/binotel/call-settings`,
    callCompleted: `${base || "{ERP_PUBLIC_BASE_URL}"}/api/public/integrations/binotel/call-completed`,
    tokenHeader: "x-endpoint-token",
  };
}
