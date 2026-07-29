/**
 * Серверний довідник співробітників.
 * Повертає лише публічні поля (ім'я, підрозділ, посада) — без телефонів та email.
 * Контактні дані профілів захищені RLS і доступні лише власнику профілю та керівництву.
 */
export type StaffEntry = {
  user_id: string;
  display_name: string | null;
  department: string | null;
  position: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listStaffDirectory(): Promise<StaffEntry[]> {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("user_id,display_name,department,position")
    .order("display_name");
  return (data ?? []) as StaffEntry[];
}

/** Мапа user_id -> відображуване ім'я (без контактних даних). */
export async function staffNameMap(userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("user_id,display_name")
    .in("user_id", ids);
  (data ?? []).forEach((p: any) => {
    if (p.display_name) map.set(p.user_id, p.display_name);
  });
  return map;
}

export async function staffName(userId: string): Promise<string | null> {
  const map = await staffNameMap([userId]);
  return map.get(userId) ?? null;
}
