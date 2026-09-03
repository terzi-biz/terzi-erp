/**
 * Аналітика телефонії: збагачення дзвінків джерелом, співрозмовником і співробітником.
 * Тільки читання під RLS користувача. Ніяких вигаданих даних: невідоме лишається null.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;

export type CallSourceBucket =
  | "0800" | "olx" | "site" | "google" | "meta" | "messenger" | "callback" | "cold" | "unknown";

export interface CallFeedRow {
  id: string;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  direction: "inbound" | "outbound" | string;
  duration_sec: number;
  wait_seconds: number | null;
  is_missed: boolean;
  is_new_call: boolean;
  recording_available: boolean;
  /** Номер клієнта (не внутрішній). */
  counterparty: string | null;
  /** Хто телефонував (ПІБ або номер). */
  caller_label: string | null;
  /** Кому телефонували (ПІБ або номер). */
  callee_label: string | null;
  /** Співробітник, який вів розмову. */
  employee_name: string | null;
  internal_number: string | null;
  client_id: string | null;
  client_name: string | null;
  lead_id: string | null;
  source_raw: string | null;
  source: CallSourceBucket;
}

export interface CallFeedResult {
  rows: CallFeedRow[];
  /** true, якщо ліміт вибірки вичерпано і показані не всі дзвінки періоду. */
  truncated: boolean;
}

const LIMIT = 3000;

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const isInternal = (v?: string | null) => digits(v).length > 0 && digits(v).length <= 4;

/** Канонічний бакет джерела за сирою назвою. */
export function bucketSource(raw?: string | null): CallSourceBucket {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("0800")) return "0800";
  if (s.includes("olx")) return "olx";
  if (s.includes("сайт") || s.includes("site") || s.includes("terzi.biz") || s.includes("форма")) return "site";
  if (s.includes("google")) return "google";
  if (s.includes("facebook") || s.includes("instagram") || s.includes("meta")) return "meta";
  if (s.includes("viber") || s.includes("telegram") || s.includes("whatsapp")) return "messenger";
  if (s.includes("call back") || s.includes("coll back") || s.includes("callback") || s.includes("звонобот")) return "callback";
  if (s.includes("холод")) return "cold";
  return "unknown";
}

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export async function callFeed(sb: Sb, p: { from: string; to: string }): Promise<CallFeedResult> {
  const { data: calls } = await sb
    .from("crm_calls")
    .select("*")
    .gte("started_at", `${p.from}T00:00:00.000Z`)
    .lte("started_at", `${p.to}T23:59:59.999Z`)
    .order("started_at", { ascending: false })
    .limit(LIMIT);

  const list = (calls ?? []) as any[];
  if (!list.length) return { rows: [], truncated: false };

  const phones = Array.from(new Set(list.map((c) => c.phone_e164).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set(list.map((c) => c.client_id).filter(Boolean))) as string[];
  const userIds = Array.from(
    new Set(list.flatMap((c) => [c.employee_id, c.answered_employee_id]).filter(Boolean)),
  ) as string[];

  const leadByPhone = new Map<string, { id: string; source: string | null; title: string | null }>();
  const clientByPhone = new Map<string, { id: string; name: string; source: string | null }>();
  const clientById = new Map<string, { id: string; name: string; source: string | null }>();
  const nameByUser = new Map<string, string>();

  await Promise.all([
    ...chunk(phones, 200).map(async (part) => {
      const { data } = await sb.from("crm_leads").select("id, phone_e164, source, title").in("phone_e164", part);
      for (const r of data ?? []) if (r.phone_e164 && !leadByPhone.has(r.phone_e164)) leadByPhone.set(r.phone_e164, r as any);
    }),
    ...chunk(phones, 200).map(async (part) => {
      const { data } = await sb.from("clients").select("id, name, phone_e164, source").in("phone_e164", part);
      for (const r of data ?? []) if (r.phone_e164 && !clientByPhone.has(r.phone_e164)) clientByPhone.set(r.phone_e164, r as any);
    }),
    ...chunk(clientIds, 200).map(async (part) => {
      const { data } = await sb.from("clients").select("id, name, source").in("id", part);
      for (const r of data ?? []) clientById.set(r.id, r as any);
    }),
    ...chunk(userIds, 200).map(async (part) => {
      const { data } = await sb.from("profiles").select("user_id, display_name, email").in("user_id", part);
      for (const r of data ?? []) {
        const n = (r as any).display_name || (r as any).email;
        if (n) nameByUser.set((r as any).user_id, n);
      }
    }),
    ...chunk(userIds, 200).map(async (part) => {
      const { data } = await sb
        .from("binotel_employee_mappings")
        .select("local_user_id, binotel_employee_name, binotel_internal_number")
        .in("local_user_id", part);
      for (const r of data ?? []) {
        const id = (r as any).local_user_id;
        if (id && !nameByUser.has(id) && (r as any).binotel_employee_name) {
          nameByUser.set(id, (r as any).binotel_employee_name);
        }
      }
    }),
  ]);

  const rows: CallFeedRow[] = list.map((c) => {
    const inbound = c.direction === "inbound";
    const counterparty: string | null =
      c.phone_e164 || (inbound ? (isInternal(c.from_number) ? c.to_number : c.from_number)
        : (isInternal(c.to_number) ? c.from_number : c.to_number)) || null;

    const client = (c.client_id && clientById.get(c.client_id))
      || (c.phone_e164 ? clientByPhone.get(c.phone_e164) : undefined) || null;
    const lead = c.phone_e164 ? leadByPhone.get(c.phone_e164) : undefined;

    const employeeId = c.answered_employee_id || c.employee_id || null;
    const employeeName = employeeId ? nameByUser.get(employeeId) ?? null : null;

    const dialledLine = digits(c.pbx_number || (inbound ? c.to_number : c.from_number));
    const sourceRaw: string | null =
      dialledLine.startsWith("0800") || dialledLine.startsWith("800") ? "0800"
        : c.pbx_number_name || lead?.source || client?.source || null;

    const who = client?.name || lead?.title || counterparty;
    const staff = employeeName || (c.internal_number ? `Внутрішній ${c.internal_number}` : null);

    return {
      id: c.id,
      started_at: c.started_at ?? null,
      answered_at: c.answered_at ?? null,
      ended_at: c.ended_at ?? null,
      direction: c.direction,
      duration_sec: Number(c.duration_sec ?? 0),
      wait_seconds: c.wait_seconds == null ? null : Number(c.wait_seconds),
      is_missed: Boolean(c.is_missed),
      is_new_call: Boolean(c.is_new_call),
      recording_available: Boolean(c.recording_available),
      counterparty,
      caller_label: inbound ? who : staff,
      callee_label: inbound ? staff : who,
      employee_name: employeeName,
      internal_number: c.internal_number ?? null,
      client_id: client?.id ?? null,
      client_name: client?.name ?? null,
      lead_id: c.lead_id ?? lead?.id ?? null,
      source_raw: sourceRaw,
      source: bucketSource(sourceRaw),
    };
  });

  return { rows, truncated: list.length >= LIMIT };
}
