/**
 * Дані для дошки лідів і повної картки ліда.
 * Тільки читання/запис під RLS користувача; імена співробітників — через довідник.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { staffNameMap } from "../staff.server";

type Sb = SupabaseClient<any, any, any>;

export interface BoardLead {
  id: string;
  title: string;
  stage_id: string | null;
  status: string | null;
  budget: number | null;
  area: number | null;
  address: string | null;
  source: string | null;
  direction: string | null;
  notes: string | null;
  phone: string | null;
  client_id: string | null;
  contact_id: string | null;
  order_id: string | null;
  assigned_to: string | null;
  manager_name: string | null;
  client_name: string | null;
  created_at: string | null;
  closed_at: string | null;
  next_action_at: string | null;
  fields: Record<string, string | number | boolean | null>;
}

const asFields = (tags: any): Record<string, string | number | boolean | null> =>
  tags && typeof tags === "object" && tags.fields && typeof tags.fields === "object" ? tags.fields : {};

async function decorate(sb: Sb, leads: any[]): Promise<BoardLead[]> {
  const contactIds = Array.from(new Set(leads.map((l) => l.contact_id).filter(Boolean)));
  const clientIds = Array.from(new Set(leads.map((l) => l.client_id).filter(Boolean)));
  const userIds = leads.map((l) => l.assigned_to).filter(Boolean) as string[];

  const [contacts, clients, names] = await Promise.all([
    contactIds.length
      ? sb.from("crm_contacts").select("id, full_name, phone, phone_e164").in("id", contactIds)
      : Promise.resolve({ data: [] as any[] }),
    clientIds.length
      ? sb.from("clients").select("id, name, phone, phone_e164").in("id", clientIds)
      : Promise.resolve({ data: [] as any[] }),
    staffNameMap(userIds),
  ]);

  const contactById = new Map((contacts.data ?? []).map((c: any) => [c.id, c]));
  const clientById = new Map((clients.data ?? []).map((c: any) => [c.id, c]));

  return leads.map((l) => {
    const contact: any = l.contact_id ? contactById.get(l.contact_id) : null;
    const client: any = l.client_id ? clientById.get(l.client_id) : null;
    return {
      id: l.id,
      title: l.title,
      stage_id: l.stage_id ?? null,
      status: l.status ?? null,
      budget: l.budget == null ? null : Number(l.budget),
      area: l.area == null ? null : Number(l.area),
      address: l.address ?? null,
      source: l.source ?? null,
      direction: l.direction ?? null,
      notes: l.notes ?? null,
      phone: l.phone_e164 ?? contact?.phone_e164 ?? contact?.phone ?? client?.phone_e164 ?? client?.phone ?? null,
      client_id: l.client_id ?? null,
      contact_id: l.contact_id ?? null,
      order_id: l.order_id ?? null,
      assigned_to: l.assigned_to ?? null,
      manager_name: l.assigned_to ? names.get(l.assigned_to) ?? null : null,
      client_name: client?.name ?? contact?.full_name ?? null,
      created_at: l.created_at ?? null,
      closed_at: l.closed_at ?? null,
      next_action_at: l.next_action_at ?? null,
      fields: asFields(l.tags),
    };
  });
}

export async function boardLeads(sb: Sb, p: { limit?: number }): Promise<BoardLead[]> {
  const { data, error } = await sb
    .from("crm_leads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(p.limit ?? 1000);
  if (error) { console.error("boardLeads", error); throw new Error("Не вдалося завантажити ліди"); }
  return decorate(sb, (data ?? []) as any[]);
}

export interface LeadCard {
  lead: BoardLead | null;
  activities: any[];
  tasks: any[];
  calls: any[];
}

/** Повна картка ліда: лід + історія комунікацій, задачі та дзвінки. */
export async function leadCard(sb: Sb, leadId: string): Promise<LeadCard> {
  const { data: raw } = await sb.from("crm_leads").select("*").eq("id", leadId).maybeSingle();
  if (!raw) return { lead: null, activities: [], tasks: [], calls: [] };
  const [lead] = await decorate(sb, [raw]);

  const phone = lead?.phone ?? null;
  const [{ data: activities }, { data: tasks }, callsRes] = await Promise.all([
    sb.from("crm_lead_activities").select("*").eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(200),
    sb.from("crm_tasks").select("*").eq("lead_id", leadId)
      .order("due_at", { ascending: true }).limit(100),
    phone
      ? sb.from("crm_calls").select("*").eq("phone_e164", phone)
          .order("started_at", { ascending: false }).limit(100)
      : sb.from("crm_calls").select("*").eq("lead_id", leadId)
          .order("started_at", { ascending: false }).limit(100),
  ]);

  const actorIds = (activities ?? []).map((a: any) => a.actor_id).filter(Boolean) as string[];
  const names = await staffNameMap(actorIds);

  return {
    lead: lead ?? null,
    activities: (activities ?? []).map((a: any) => ({ ...a, actor_name: a.actor_id ? names.get(a.actor_id) ?? null : null })),
    tasks: tasks ?? [],
    calls: (callsRes.data ?? []) as any[],
  };
}

/** Часткове оновлення ліда з картки, включно з додатковими полями. */
export async function saveLeadCard(
  sb: Sb,
  userId: string,
  p: { id: string; patch: Record<string, any>; fields?: Record<string, any> },
) {
  const patch: Record<string, any> = { ...p.patch };
  if (p.fields) {
    const { data: cur } = await sb.from("crm_leads").select("tags").eq("id", p.id).maybeSingle();
    const tags = (cur?.tags && typeof cur.tags === "object" ? cur.tags : {}) as Record<string, any>;
    patch["tags"] = { ...tags, fields: { ...(tags["fields"] ?? {}), ...p.fields } };
  }
  const { data, error } = await sb.from("crm_leads").update(patch).eq("id", p.id).select().single();
  if (error) { console.error("saveLeadCard", error); throw new Error("Не вдалося зберегти лід"); }
  await sb.from("crm_lead_activities").insert({
    lead_id: p.id, actor_id: userId, kind: "update", body: "Картку ліда оновлено",
  });
  const [lead] = await decorate(sb, [data]);
  return lead;
}
