/**
 * Канонічне правило кваліфікації TERZI (єдине для аналітики та конверсій):
 * лід кваліфікований, якщо перейшов з ПОЧАТКОВОГО етапу воронки в будь-який
 * активний робочий етап далі (sort_order більший). Прямий перехід з початкового
 * етапу в «Втрачено/Закрито» — не кваліфікований.
 */
export type StageLite = { id: string; pipeline_id?: string | null; sort_order?: number | null; is_lost?: boolean | null };

const n = (v: unknown) => Number(v ?? 0) || 0;

export function isQualifyingTransition(
  from: StageLite | null | undefined,
  to: StageLite | null | undefined,
  initialStageId: string | null | undefined,
): boolean {
  if (!from || !to || !initialStageId) return false;
  if (from.id !== initialStageId) return false;
  if (to.is_lost) return false;
  return n(to.sort_order) > n(from.sort_order);
}

/** Початковий етап кожної воронки (мінімальний sort_order серед переданих етапів). */
export function initialStageByPipeline<T extends StageLite>(stages: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const s of [...stages].sort((a, b) => n(a.sort_order) - n(b.sort_order))) {
    const k = String(s.pipeline_id ?? "");
    if (!m.has(k)) m.set(k, s);
  }
  return m;
}
