/**
 * DRY-RUN аналіз напрямків-дублів (наприклад, напрямку з назвою «1»).
 *
 * Функція ТІЛЬКИ читає дані: нічого не видаляє, не об'єднує і не змінює.
 * Повертає звіт: пов'язані кошториси/замовлення, версію конфігурації,
 * ризик відключення й рекомендовану дію.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DirectionDryRunRow {
  id: string;
  name: string;
  status: string | null;
  currentVersion: number | null;
  publishedVersions: number;
  estimateSections: number;
  orders: number;
  risk: "low" | "medium" | "high";
  recommendation: string;
}

/** Напрямки, назва яких виглядає технічною/тестовою. */
const SUSPICIOUS = /^\s*(\d+|test|тест|копія|copy)\s*$/i;

export const dryRunDirections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: DirectionDryRunRow[]; note: string }> => {
    const db = context.supabase as never as { from: (t: string) => any };

    const { data: dirs, error } = await db.from("directions").select("id, name, status, current_version");
    if (error) throw new Error(error.message);

    const candidates = (dirs ?? []).filter((d: Record<string, unknown>) =>
      SUSPICIOUS.test(String(d['name'] ?? "")),
    );

    const rows: DirectionDryRunRow[] = [];
    for (const d of candidates) {
      const id = String(d['id']);
      const [versions, sections, orders] = await Promise.all([
        db.from("direction_versions").select("id", { count: "exact", head: true }).eq("direction_id", id),
        db.from("estimate_sections").select("id", { count: "exact", head: true }).eq("direction_id", id),
        db.from("orders").select("id", { count: "exact", head: true }).eq("direction_id", id),
      ]);
      const estimateSections = Number(sections.count ?? 0);
      const orderCount = Number(orders.count ?? 0);
      const linked = estimateSections + orderCount;
      const risk: DirectionDryRunRow["risk"] = linked > 0 ? "high" : Number(versions.count ?? 0) > 0 ? "medium" : "low";

      rows.push({
        id,
        name: String(d['name'] ?? ""),
        status: (d['status'] as string | null) ?? null,
        currentVersion: (d['current_version'] as number | null) ?? null,
        publishedVersions: Number(versions.count ?? 0),
        estimateSections,
        orders: orderCount,
        risk,
        recommendation:
          risk === "high"
            ? "Не відключати. Перейменувати напрямок і зберегти для історичних кошторисів."
            : risk === "medium"
              ? "Перевести в «Архів»: опубліковані версії залишаються незмінними."
              : "Безпечно перевести в «Чернетку»/«Архів» — пов'язаних документів немає.",
      });
    }

    return {
      rows,
      note: "DRY-RUN: жоден запис не змінено. Production-дані не видаляються і не об'єднуються.",
    };
  });
