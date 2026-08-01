/**
 * Binotel Webhook API — обробка подій дзвінків (лише сервер).
 *
 * Етап 3: API CALL SETTINGS — синхронна відповідь на початок дзвінка
 *   (картка клієнта + маршрутизація на відповідального менеджера).
 * Етап 4: API CALL COMPLETED — фіксація завершеного дзвінка,
 *   автостворення контакту/ліда та задачі по пропущеному.
 *
 * Жодних вигаданих методів REST: тут працює лише приймання вебхуків
 * і запис у власні таблиці ERP.
 */
import { admin } from "../../access.server";
import { normalizeDirection, normalizeDisposition, toE164Ua } from "../binotel-constants";
import { normPhone } from "../keycrm/sync.server";

const SESSION_TTL_MIN = 180;

export type BinotelPayload = Record<string, any>;

/** Витягує перше визначене значення з кількох можливих ключів payload. */
function pick(raw: BinotelPayload, keys: string[]): any {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

export type ParsedCall = {
  generalCallId: string | null;
  companyId: string | null;
  direction: "inbound" | "outbound";
  externalNumber: string | null;
  internalNumber: string | null;
  pbxNumber: string | null;
  pbxNumberName: string | null;
  phoneNorm: string | null;
  startedAt: string;
  answeredAt: string | null;
  durationSec: number;
  waitSec: number;
  dispositionRaw: string | null;
  status: string;
  isMissed: boolean;
  isNewCall: boolean;
  recordingUrl: string | null;
  callTracking: Record<string, unknown>;
};

/** Нормалізація payload Binotel (CALL SETTINGS / CALL COMPLETED) у структуру ERP. */
export function parseBinotelCall(raw: BinotelPayload): ParsedCall {
  const direction = normalizeDirection(pick(raw, ["callType", "call_type", "direction"]));
  const external = pick(raw, ["externalNumber", "external_number", "callerID", "customerNumber"]);
  const internal = pick(raw, ["internalNumber", "internal_number", "extension"]);
  const durationSec = Number(pick(raw, ["billsec", "duration", "durationSec"]) ?? 0) || 0;
  const waitSec = Number(pick(raw, ["waitsec", "waitSec", "wait_seconds"]) ?? 0) || 0;
  const dispositionRaw = pick(raw, ["disposition", "status"]);
  const status = normalizeDisposition(dispositionRaw);
  const startRaw = pick(raw, ["startTime", "start_time", "startedAt", "callStartTime"]);
  const startedAt = startRaw
    ? new Date(typeof startRaw === "number" || /^\d+$/.test(String(startRaw)) ? Number(startRaw) * 1000 : String(startRaw)).toISOString()
    : new Date().toISOString();
  const isMissed = status === "missed" || status === "cancelled" || (durationSec === 0 && status !== "answered");

  return {
    generalCallId: pick(raw, ["generalCallID", "generalCallId", "callId", "id"])?.toString() ?? null,
    companyId: pick(raw, ["companyID", "companyId", "company_id"])?.toString() ?? null,
    direction,
    externalNumber: external ? String(external) : null,
    internalNumber: internal ? String(internal) : null,
    pbxNumber: pick(raw, ["pbxNumber", "pbx_number"])?.toString() ?? null,
    pbxNumberName: pick(raw, ["pbxNumberName", "pbx_number_name"])?.toString() ?? null,
    phoneNorm: normPhone(external) ?? null,
    startedAt,
    answeredAt: durationSec > 0 ? new Date(new Date(startedAt).getTime() + waitSec * 1000).toISOString() : null,
    durationSec,
    waitSec,
    dispositionRaw: dispositionRaw ? String(dispositionRaw) : null,
    status,
    isMissed,
    isNewCall: String(pick(raw, ["isNewCall", "is_new_call"]) ?? "") === "1" || pick(raw, ["isNewCall"]) === true,
    recordingUrl: pick(raw, ["recordUrl", "recording_url", "recordingUrl"])?.toString() ?? null,
    callTracking: (raw?.callTracking ?? raw?.call_tracking ?? {}) as Record<string, unknown>,
  };
}

async function settings(integrationId: string | null) {
  const db = await admin();
  const q = db.from("binotel_settings").select("*").limit(1);
  const { data } = integrationId ? await q.eq("integration_id", integrationId).maybeSingle() : await q.maybeSingle();
  return (
    (data as any) ?? {
      auto_create_lead: true,
      auto_create_contact: true,
      auto_create_missed_task: true,
      route_to_assigned_manager: true,
      missed_sla_minutes: 30,
      default_pipeline_id: null,
      default_stage_id: null,
    }
  );
}

async function ownerFor(integrationId: string | null) {
  if (!integrationId) return null;
  const db = await admin();
  const { data } = await db.from("integrations").select("created_by").eq("id", integrationId).maybeSingle();
  return ((data as any)?.created_by as string) ?? null;
}

/** Правила маршрутизації за номером АТС (напрямок, воронка, менеджер за замовчуванням). */
async function pbxRule(pbxNumber: string | null) {
  if (!pbxNumber) return null;
  const db = await admin();
  const { data } = await db
    .from("binotel_pbx_mappings")
    .select("*")
    .eq("pbx_number", pbxNumber)
    .eq("is_active", true)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Співробітник ERP за внутрішнім номером Binotel. */
async function employeeByExtension(internalNumber: string | null) {
  if (!internalNumber) return null;
  const db = await admin();
  const { data } = await db
    .from("binotel_employee_mappings")
    .select("*")
    .eq("binotel_internal_number", internalNumber)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Пошук контакту/ліда/клієнта за нормалізованим номером. */
async function lookupByPhone(phoneNorm: string | null) {
  const db = await admin();
  if (!phoneNorm) return { contact: null as any, lead: null as any, client: null as any };
  const { data: contact } = await db
    .from("crm_contacts")
    .select("id,full_name,client_id")
    .eq("phone_norm", phoneNorm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lead: any = null;
  if (contact) {
    const { data } = await db
      .from("crm_leads")
      .select("id,title,status,assigned_to,client_id,pipeline_id,stage_id")
      .eq("contact_id", (contact as any).id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = data ?? null;
  }

  let client: any = null;
  const clientId = (contact as any)?.client_id ?? lead?.client_id ?? null;
  if (clientId) {
    const { data } = await db.from("clients").select("id,name").eq("id", clientId).maybeSingle();
    client = data ?? null;
  }
  return { contact: (contact as any) ?? null, lead, client };
}

/** Відповідальний менеджер: лід → контакт-клієнт → правило АТС. */
async function responsibleFor(lead: any, rule: any, routeToAssigned: boolean) {
  if (routeToAssigned && lead?.assigned_to) return lead.assigned_to as string;
  return (rule?.default_assignee as string) ?? null;
}

/** Внутрішній номер Binotel для користувача ERP. */
async function extensionForUser(userId: string | null) {
  if (!userId) return null;
  const db = await admin();
  const { data } = await db
    .from("binotel_employee_mappings")
    .select("binotel_internal_number")
    .eq("local_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return ((data as any)?.binotel_internal_number as string) ?? null;
}

/* ------------------------------------------------------------------ */
/* Етап 3 — API CALL SETTINGS                                          */
/* ------------------------------------------------------------------ */

/**
 * Синхронна відповідь Binotel на початок дзвінка:
 * — картка клієнта (імʼя, підпис, відповідальний);
 * — маршрутизація на внутрішній номер відповідального менеджера.
 * Сесія зберігається, щоб CALL COMPLETED не робив повторний пошук.
 */
export async function handleCallSettings(integrationId: string | null, raw: BinotelPayload) {
  const db = await admin();
  const call = parseBinotelCall(raw);
  const cfg = await settings(integrationId);
  const rule = await pbxRule(call.pbxNumber);
  const found = await lookupByPhone(call.phoneNorm);
  const responsible = await responsibleFor(found.lead, rule, cfg.route_to_assigned_manager !== false);
  const extension = await extensionForUser(responsible);

  const displayName =
    found.client?.name ?? found.contact?.full_name ?? (call.phoneNorm ? `Новий номер ${toE164Ua(call.externalNumber) ?? ""}`.trim() : "Невідомий номер");
  const labelParts = [
    found.lead ? `Лід: ${found.lead.title}` : "Без активного ліда",
    rule?.service_direction ? `Напрямок: ${rule.service_direction}` : null,
    rule?.source_label ?? call.pbxNumberName ?? null,
  ].filter(Boolean);

  const response: Record<string, unknown> = {
    customerData: {
      name: displayName,
      labelText: labelParts.join(" · "),
      isNewCustomer: found.contact ? 0 : 1,
    },
    ...(extension ? { internalNumbersForCall: [extension] } : {}),
  };

  const sessionKey = call.generalCallId ?? `${call.phoneNorm ?? "unknown"}:${call.startedAt}`;
  const row = {
    session_key: sessionKey,
    company_id: call.companyId,
    general_call_id: call.generalCallId,
    phone_norm: call.phoneNorm,
    pbx_number: call.pbxNumber,
    call_type: call.direction,
    contact_id: found.contact?.id ?? null,
    client_id: found.client?.id ?? null,
    lead_id: found.lead?.id ?? null,
    assigned_user_id: responsible,
    created_lead: false,
    created_contact: false,
    response: response as any,
    expires_at: new Date(Date.now() + SESSION_TTL_MIN * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db.from("binotel_call_sessions").select("id").eq("session_key", sessionKey).maybeSingle();
  if (existing) await db.from("binotel_call_sessions").update(row as any).eq("id", (existing as any).id);
  else await db.from("binotel_call_sessions").insert(row as any);

  return { response, matched: Boolean(found.contact), responsible, extension };
}

/* ------------------------------------------------------------------ */
/* Етап 4 — API CALL COMPLETED                                         */
/* ------------------------------------------------------------------ */

/**
 * Фіксація завершеного дзвінка: запис у crm_calls (ідемпотентно за generalCallID),
 * автостворення контакту й ліда для нових номерів, задача по пропущеному дзвінку.
 */
export async function handleCallCompleted(integrationId: string | null, raw: BinotelPayload) {
  const db = await admin();
  const call = parseBinotelCall(raw);
  const cfg = await settings(integrationId);
  const owner = await ownerFor(integrationId);
  const rule = await pbxRule(call.pbxNumber);
  const employee = await employeeByExtension(call.internalNumber);

  const sessionKey = call.generalCallId ?? `${call.phoneNorm ?? "unknown"}:${call.startedAt}`;
  const { data: session } = await db.from("binotel_call_sessions").select("*").eq("session_key", sessionKey).maybeSingle();

  let contactId: string | null = (session as any)?.contact_id ?? null;
  let leadId: string | null = (session as any)?.lead_id ?? null;
  let clientId: string | null = (session as any)?.client_id ?? null;
  if (!contactId && !leadId) {
    const found = await lookupByPhone(call.phoneNorm);
    contactId = found.contact?.id ?? null;
    leadId = found.lead?.id ?? null;
    clientId = found.client?.id ?? null;
  }

  const assignee =
    (employee?.local_user_id as string) ?? (session as any)?.assigned_user_id ?? (rule?.default_assignee as string) ?? owner ?? null;

  let createdContact = false;
  let createdLead = false;

  // Новий номер → контакт (за налаштуванням).
  if (!contactId && call.phoneNorm && owner && cfg.auto_create_contact !== false) {
    const { data } = await db
      .from("crm_contacts")
      .insert({
        owner_id: owner,
        full_name: toE164Ua(call.externalNumber) ?? call.phoneNorm,
        phone: call.externalNumber,
        phone_norm: call.phoneNorm,
        external_source: "binotel",
        external_id: call.generalCallId,
        notes: "Створено автоматично з дзвінка Binotel",
      } as any)
      .select("id")
      .maybeSingle();
    contactId = (data as any)?.id ?? null;
    createdContact = Boolean(contactId);
  }

  // Вхідний дзвінок без активного ліда → лід у воронку правила АТС.
  if (!leadId && contactId && owner && call.direction === "inbound" && cfg.auto_create_lead !== false) {
    const pipelineId = rule?.pipeline_id ?? cfg.default_pipeline_id ?? null;
    const stageId = rule?.stage_id ?? cfg.default_stage_id ?? null;
    const { data } = await db
      .from("crm_leads")
      .insert({
        owner_id: owner,
        assigned_to: assignee,
        title: `Дзвінок ${toE164Ua(call.externalNumber) ?? call.phoneNorm ?? ""}`.trim(),
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contactId,
        client_id: clientId,
        source: rule?.source_label ?? "binotel",
        direction: rule?.service_direction ?? null,
        external_source: "binotel",
        external_id: call.generalCallId,
        notes: `Автоматично створено з дзвінка Binotel (${call.pbxNumberName ?? call.pbxNumber ?? "АТС"})`,
      } as any)
      .select("id")
      .maybeSingle();
    leadId = (data as any)?.id ?? null;
    createdLead = Boolean(leadId);
    if (leadId) {
      await db.from("crm_lead_events").insert({ lead_id: leadId, actor_id: owner, kind: "created", body: "Створено з дзвінка Binotel" } as any);
    }
  }

  // Запис дзвінка (ідемпотентно за external_id).
  const row: Record<string, unknown> = {
    direction: call.direction,
    from_number: call.direction === "inbound" ? call.externalNumber : call.pbxNumber ?? call.internalNumber,
    to_number: call.direction === "inbound" ? call.pbxNumber ?? call.internalNumber : call.externalNumber,
    phone_norm: call.phoneNorm,
    started_at: call.startedAt,
    answered_at: call.answeredAt,
    ended_at: new Date(new Date(call.startedAt).getTime() + (call.waitSec + call.durationSec) * 1000).toISOString(),
    duration_sec: call.durationSec,
    wait_seconds: call.waitSec,
    status: call.status,
    disposition_raw: call.dispositionRaw,
    is_missed: call.isMissed,
    is_new_call: call.isNewCall,
    recording_url: call.recordingUrl,
    recording_available: Boolean(call.recordingUrl),
    provider: "binotel",
    external_source: "binotel",
    external_id: call.generalCallId,
    company_id: call.companyId,
    pbx_number: call.pbxNumber,
    pbx_number_name: call.pbxNumberName,
    internal_number: call.internalNumber,
    employee_id: (employee?.local_user_id as string) ?? null,
    answered_employee_id: call.isMissed ? null : ((employee?.local_user_id as string) ?? null),
    contact_id: contactId,
    client_id: clientId,
    lead_id: leadId,
    call_tracking: call.callTracking as any,
    payload: raw as any,
  };

  let callId: string | null = null;
  if (call.generalCallId) {
    const { data: existing } = await db.from("crm_calls").select("id").eq("external_id", call.generalCallId).maybeSingle();
    callId = (existing as any)?.id ?? null;
  }
  if (callId) {
    await db.from("crm_calls").update(row as any).eq("id", callId);
  } else if (owner) {
    const { data } = await db
      .from("crm_calls")
      .insert({ ...row, owner_id: owner } as any)
      .select("id")
      .maybeSingle();
    callId = (data as any)?.id ?? null;
  }

  // Пропущений вхідний → задача передзвонити (ідемпотентно за external_key).
  let taskId: string | null = null;
  if (call.isMissed && call.direction === "inbound" && owner && cfg.auto_create_missed_task !== false) {
    const externalKey = `binotel:missed:${call.generalCallId ?? sessionKey}`;
    const { data: existingTask } = await db.from("crm_tasks").select("id").eq("external_key", externalKey).maybeSingle();
    if (existingTask) {
      taskId = (existingTask as any).id;
    } else {
      const sla = Number(cfg.missed_sla_minutes ?? 30) || 30;
      const { data } = await db
        .from("crm_tasks")
        .insert({
          owner_id: owner,
          assigned_to: assignee,
          kind: "call",
          title: `Передзвонити: ${toE164Ua(call.externalNumber) ?? call.phoneNorm ?? "невідомий номер"}`,
          description: `Пропущений дзвінок Binotel${call.pbxNumberName ? ` · ${call.pbxNumberName}` : ""}`,
          priority: "high",
          due_at: new Date(Date.now() + sla * 60_000).toISOString(),
          lead_id: leadId,
          contact_id: contactId,
          client_id: clientId,
          external_key: externalKey,
        } as any)
        .select("id")
        .maybeSingle();
      taskId = (data as any)?.id ?? null;
    }
  }

  if (session) {
    await db
      .from("binotel_call_sessions")
      .update({ contact_id: contactId, client_id: clientId, lead_id: leadId, created_lead: createdLead, created_contact: createdContact, updated_at: new Date().toISOString() } as any)
      .eq("id", (session as any).id);
  }

  return {
    call_id: callId,
    lead_id: leadId,
    contact_id: contactId,
    task_id: taskId,
    created_lead: createdLead,
    created_contact: createdContact,
    missed: call.isMissed,
    status: call.status,
  };
}
