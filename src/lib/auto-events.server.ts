/**
 * Ідемпотентне автостворення подій операційного календаря з інших сутностей ERP.
 * Унікальний ключ: source_type + source_id + event_type — повторний виклик
 * оновлює наявну подію, а не створює дубль.
 */
type Sb = { from: (t: string) => any };

export interface AutoEventInput {
  source_type: "measurement" | "contract" | "payment" | "task" | "estimate";
  source_id: string;
  event_type: string;
  title: string;
  category: string;
  direction?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  order_id?: string | null;
  client_id?: string | null;
  measurement_id?: string | null;
  estimate_id?: string | null;
  address?: string | null;
  client_name?: string | null;
  area?: number | null;
  employee_id?: string | null;
  responsible_user_id?: string | null;
  priority?: string;
  status?: string;
  description?: string | null;
  reminders?: unknown[];
}

export const DEFAULT_REMINDERS = [
  { offsetMinutes: 24 * 60, channel: "app" },
  { offsetMinutes: 120, channel: "app" },
  { offsetMinutes: 30, channel: "app" },
];

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

/** Створює або оновлює пов'язану подію. Помилки не валять основну операцію. */
export async function syncAutoEvent(
  supabase: Sb,
  userId: string | null,
  input: AutoEventInput,
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      title: input.title,
      category: input.category,
      direction: input.direction ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      all_day: input.all_day ?? false,
      order_id: input.order_id ?? null,
      client_id: input.client_id ?? null,
      measurement_id: input.measurement_id ?? null,
      estimate_id: input.estimate_id ?? null,
      address: input.address ?? null,
      client_name: input.client_name ?? null,
      area: input.area ?? null,
      employee_id: input.employee_id ?? null,
      responsible_user_id: input.responsible_user_id ?? userId,
      priority: input.priority ?? "normal",
      status: input.status ?? "planned",
      description: input.description ?? null,
      reminders: (input.reminders ?? DEFAULT_REMINDERS) as never,
    };

    const { data: existing } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("source_type", input.source_type)
      .eq("source_id", input.source_id)
      .eq("event_type", input.event_type)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("calendar_events").update(patch).eq("id", existing.id);
      return;
    }
    await supabase.from("calendar_events").insert({
      ...patch,
      event_type: input.event_type,
      source_type: input.source_type,
      source_id: input.source_id,
      created_by: userId,
    });
  } catch (e) {
    console.error("syncAutoEvent", input.source_type, input.event_type, e);
  }
}
