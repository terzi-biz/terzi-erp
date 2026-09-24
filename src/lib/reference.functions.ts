/**
 * Довідники пакета А: реквізити компаній (ФОП) з версіонуванням,
 * причини закриття з архівуванням і пошук контрагента.
 * Історія не перезаписується: правка реквізитів створює нову версію.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toE164 } from "./phone";
import {
  archiveInput,
  closeReasonInput,
  companyRequisiteInput,
  counterpartySearchInput,
} from "./reference.schema";

/** Усі версії реквізитів, найновіші зверху. */
export const listCompanyRequisites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("company_requisites")
      .select("*")
      .order("code", { ascending: true })
      .order("version", { ascending: false });
    if (error) { console.error("listCompanyRequisites", error); throw new Error("Не вдалося завантажити реквізити"); }
    return data ?? [];
  });

/** Створення нової версії реквізитів. Попередні версії лишаються незмінними. */
export const saveCompanyRequisite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyRequisiteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("@/lib/access.server");
    const actor = await requirePermission(context.userId, "settings", "manage_settings");
    const db = (await admin()) as any; // права перевірено канонічно вище
    const { data: prev, error: e0 } = await db
      .from("company_requisites")
      .select("version")
      .eq("code", data.code)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e0) { console.error("saveCompanyRequisite:prev", e0); throw new Error("Не вдалося зчитати попередню версію"); }

    const version = (prev?.version ?? 0) + 1;
    const { data: out, error } = await db
      .from("company_requisites")
      .insert({ ...data, version, created_by: context.userId })
      .select()
      .single();
    if (error) { console.error("saveCompanyRequisite", error); throw new Error("Не вдалося зберегти реквізити"); }

    if (data.is_default) {
      await db
        .from("company_requisites")
        .update({ is_default: false })
        .neq("code", data.code)
        .is("archived_at", null);
    }
    await writeAudit(actor, { module: "settings", action: "company_requisite.save", entityType: "company_requisite", entityId: String(out.id), entityLabel: `${data.code} v${version}`, oldValue: null, newValue: out, reason: null, isCritical: false }).catch((e) => console.error("audit", e));
    return out;
  });

/** Архівування версії реквізитів (без видалення). */
export const archiveCompanyRequisite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("@/lib/access.server");
    const actor = await requirePermission(context.userId, "settings", "manage_settings");
    const db = (await admin()) as any; // права перевірено канонічно вище
    const { error } = await db
      .from("company_requisites")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) { console.error("archiveCompanyRequisite", error); throw new Error("Не вдалося змінити стан запису"); }
    await writeAudit(actor, { module: "settings", action: "company_requisite.archive", entityType: "company_requisite", entityId: data.id, entityLabel: null, oldValue: null, newValue: { archived: data.archived }, reason: null, isCritical: false }).catch((e) => console.error("audit", e));
    return { ok: true };
  });

export const listCloseReasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("close_reasons")
      .select("*")
      .order("scope", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) { console.error("listCloseReasons", error); throw new Error("Не вдалося завантажити причини закриття"); }
    return data ?? [];
  });

export const saveCloseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => closeReasonInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("@/lib/access.server");
    const actor = await requirePermission(context.userId, "settings", "manage_settings");
    const db = (await admin()) as any; // права перевірено канонічно вище
    const { id, ...fields } = data;
    const { data: out, error } = id
      ? await db.from("close_reasons").update(fields).eq("id", id).select().single()
      : await db.from("close_reasons").insert({ ...fields, created_by: context.userId }).select().single();
    if (error) { console.error("saveCloseReason", error); throw new Error("Не вдалося зберегти причину закриття"); }
    await writeAudit(actor, { module: "settings", action: "close_reason.save", entityType: "close_reason", entityId: String(out.id), entityLabel: null, oldValue: null, newValue: out, reason: null, isCritical: false }).catch((e) => console.error("audit", e));
    return out;
  });

export const archiveCloseReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("@/lib/access.server");
    const actor = await requirePermission(context.userId, "settings", "manage_settings");
    const db = (await admin()) as any; // права перевірено канонічно вище
    const { error } = await db
      .from("close_reasons")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) { console.error("archiveCloseReason", error); throw new Error("Не вдалося змінити стан запису"); }
    await writeAudit(actor, { module: "settings", action: "close_reason.archive", entityType: "close_reason", entityId: data.id, entityLabel: null, oldValue: null, newValue: { archived: data.archived }, reason: null, isCritical: false }).catch((e) => console.error("audit", e));
    return { ok: true };
  });

export type CounterpartyHit = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  roles: string[];
  status: string;
};

/** Пошук контрагента за телефоном (E.164 або цифри), іменем і компанією. */
export const searchCounterparties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => counterpartySearchInput.parse(d))
  .handler(async ({ data, context }) => {
    const raw = data.q.trim();
    let q = context.supabase
      .from("clients")
      .select("id,name,company,phone,phone_e164,email,roles,status")
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (raw) {
      const term = raw.replace(/[%,()]/g, " ").trim();
      const digitsOnly = raw.replace(/\D/g, "");
      const parts = [`name.ilike.*${term}*`, `company.ilike.*${term}*`, `email.ilike.*${term}*`];
      if (digitsOnly.length >= 4) {
        parts.push(`phone.ilike.*${digitsOnly}*`);
        parts.push(`phone_e164.ilike.*${digitsOnly}*`);
        const e164 = toE164(raw);
        if (e164) parts.push(`phone_e164.eq.${e164}`);
      }
      q = q.or(parts.join(","));
    }
    if (data.role) q = q.contains("roles", [data.role]);

    const { data: rows, error } = await q;
    if (error) { console.error("searchCounterparties", error); throw new Error("Не вдалося виконати пошук"); }
    return (rows ?? []).map((r) => ({ ...r, roles: (r.roles ?? []) as string[] })) as CounterpartyHit[];
  });

export const counterpartyRolesInput = z.object({
  id: z.string().uuid(),
  roles: z.array(z.string().min(1).max(40)).min(1).max(8),
});

/** Зміна набору ролей контрагента. Другої канонічної сутності не створюємо. */
export const setCounterpartyRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => counterpartyRolesInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase
      .from("clients")
      .update({ roles: data.roles })
      .eq("id", data.id)
      .select("id,roles")
      .single();
    if (error) { console.error("setCounterpartyRoles", error); throw new Error("Не вдалося зберегти ролі"); }
    return out;
  });
