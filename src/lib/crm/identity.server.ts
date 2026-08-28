/**
 * READ-ONLY dry-run резолвера ідентичності CRM.
 * Виконує лише SELECT: жодних UPDATE, merge чи створення записів.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dryRunIdentity, type DryRunReport, type DryRunRows } from "./identity";

type Db = SupabaseClient<any, any, any>;

const LIMIT = 1000;

export async function loadDryRunRows(sb: Db, limit = LIMIT): Promise<DryRunRows> {
  const [leads, calls, clients, contacts] = await Promise.all([
    sb.from("crm_leads").select("id,client_id,contact_id,external_source,external_id").order("created_at", { ascending: false }).limit(limit),
    sb.from("crm_calls").select("id,lead_id,client_id,contact_id,phone_e164,phone_norm,external_id,external_source").order("started_at", { ascending: false }).limit(limit),
    sb.from("clients").select("id,phone,email,external_id,external_source").limit(limit),
    sb.from("crm_contacts").select("id,phone,phone_e164,email,client_id,external_id,external_source").limit(limit),
  ]);

  return {
    leads: (leads.data ?? []) as DryRunRows["leads"],
    calls: (calls.data ?? []) as DryRunRows["calls"],
    clients: ((clients.data ?? []) as any[]).map((c) => ({
      id: c.id,
      phone: c.phone ?? null,
      email: c.email ?? null,
      externalId: c.external_id ?? null,
      externalSource: c.external_source ?? null,
    })),
    contacts: ((contacts.data ?? []) as any[]).map((c) => ({
      id: c.id,
      phone: c.phone ?? null,
      phoneE164: c.phone_e164 ?? null,
      email: c.email ?? null,
      relationId: c.client_id ?? null,
      externalId: c.external_id ?? null,
      externalSource: c.external_source ?? null,
    })),
  };
}

export async function runIdentityDryRun(sb: Db, limit = LIMIT): Promise<DryRunReport & { scanned: { leads: number; calls: number; clients: number; contacts: number } }> {
  const rows = await loadDryRunRows(sb, limit);
  return {
    ...dryRunIdentity(rows),
    scanned: { leads: rows.leads.length, calls: rows.calls.length, clients: rows.clients.length, contacts: rows.contacts.length },
  };
}
