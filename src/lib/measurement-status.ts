/**
 * Канонічні статуси заміру (order_measurements — єдина сутність заміру).
 * Legacy-значення draft/done/cancelled підтримуються тільки для старих записів.
 */

export const MEASUREMENT_STATUSES = [
  "planned", "assigned", "confirmed", "in_progress", "completed", "canceled", "rescheduled",
] as const;

export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

const LEGACY_MAP: Record<string, MeasurementStatus> = {
  draft: "planned",
  done: "completed",
  cancelled: "canceled",
};

/** Legacy → канонічний статус. Нові записи створюються тільки в канонічних значеннях. */
export function canonicalMeasurementStatus(v: string | null | undefined): MeasurementStatus {
  if (!v) return "planned";
  if ((MEASUREMENT_STATUSES as readonly string[]).includes(v)) return v as MeasurementStatus;
  return LEGACY_MAP[v] ?? "planned";
}

export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = {
  planned: "Заплановано",
  assigned: "Призначено замірника",
  confirmed: "Підтверджено",
  in_progress: "Виконується",
  completed: "Виконано",
  canceled: "Скасовано",
  rescheduled: "Перенесено",
};

/** Заміри, що ще в роботі (план). */
export const OPEN_MEASUREMENT_STATUSES: MeasurementStatus[] = [
  "planned", "assigned", "confirmed", "in_progress",
];

export function isOpenMeasurement(v: string | null | undefined): boolean {
  return OPEN_MEASUREMENT_STATUSES.includes(canonicalMeasurementStatus(v));
}

/** Тип заміру з типу календарної події. */
export function measurementTypeFromEvent(eventType: string | null | undefined): "primary" | "repeat" | "control" | "as_built" {
  switch (eventType) {
    case "measure_repeat": return "repeat";
    case "measure_control": return "control";
    case "measure_final": return "as_built";
    default: return "primary";
  }
}
