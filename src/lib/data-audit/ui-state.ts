/**
 * Чисті хелпери станів UI сторінки «Аудит даних».
 * Винесені окремо, щоб покрити юніт-тестами лоадер, disabled-кнопки
 * та повідомлення про помилки без рендера React.
 */

export interface AuditUiInput {
  /** Триває формування звіту. */
  running: boolean;
  /** Триває застосування дії. */
  applying: boolean;
  /** Є сформований звіт. */
  hasReport: boolean;
  /** Текст помилки останньої операції. */
  error?: string | null;
}

export interface AuditRowUiInput {
  applyKey: string | null;
  /** Повідомлення, якщо дію вже застосовано в поточній сесії. */
  appliedMessage?: string | null;
  applying: boolean;
}

export type RowActionState = "manual" | "applied" | "idle" | "busy";

/** Кнопка «Сформувати звіт»: заблокована й показує лоадер під час запиту. */
export function runButtonState(s: AuditUiInput) {
  return { disabled: s.running || s.applying, loading: s.running };
}

/** Кнопка «Експорт CSV»: доступна лише за наявності звіту й без активних операцій. */
export function exportButtonState(s: AuditUiInput) {
  return { disabled: !s.hasReport || s.running || s.applying };
}

/** Стан кнопки застосування в рядку звіту. */
export function rowActionState(r: AuditRowUiInput): RowActionState {
  if (!r.applyKey) return "manual";
  if (r.appliedMessage) return "applied";
  return r.applying ? "busy" : "idle";
}

/** Кнопка «Застосувати» блокується під час будь-якого застосування. */
export function rowApplyDisabled(r: AuditRowUiInput): boolean {
  return rowActionState(r) !== "idle";
}

/** Нормалізоване повідомлення про помилку для тосту/банера. */
export function auditErrorMessage(e: unknown, fallback = "Не вдалося виконати дію"): string {
  if (!e) return fallback;
  if (typeof e === "string") return e.trim() || fallback;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === "string" && msg.trim() ? msg.trim() : fallback;
}

/** Текст-підказка під таблицею залежно від стану. */
export function auditStatusText(s: AuditUiInput): string {
  if (s.error) return auditErrorMessage(s.error);
  if (s.running) return "Формуємо звіт…";
  if (s.applying) return "Застосовуємо зміну…";
  if (!s.hasReport) return "Звіт ще не сформовано.";
  return "Готово.";
}
