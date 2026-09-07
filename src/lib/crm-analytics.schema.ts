/** Схеми для аналітики дзвінків і замірів (клієнт-безпечний модуль). */
import { z } from "zod";
import { MEASUREMENT_STATUSES } from "./measurement-status";

export const dateRangeSchema = z.object({
  from: z.string().min(8).max(10),
  to: z.string().min(8).max(10),
});

export const scheduleMeasurementSchema = z.object({
  title: z.string().min(1).max(200),
  starts_at: z.string().min(10),
  duration_min: z.number().int().min(15).max(600).default(60),
  event_type: z.string().min(1).max(60).default("measure_primary"),
  address: z.string().max(300).optional().nullable(),
  client_name: z.string().max(200).optional().nullable(),
  area: z.number().nonnegative().optional().nullable(),
  employee_id: z.string().uuid().optional().nullable(),
  order_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
});

/** Зміна канонічного статусу заміру (order_measurements). */
export const measurementStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(MEASUREMENT_STATUSES),
  surveyor_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().max(40).optional().nullable(),
});

/** Збереження результату заміру. */
export const measurementResultSchema = z.object({
  id: z.string().uuid(),
  area: z.number().nonnegative().optional().nullable(),
  perimeter: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  complete: z.boolean().default(true),
});

/** Створення кошторису з виконаного заміру. */
export const measurementToEstimateSchema = z.object({
  measurement_id: z.string().uuid(),
  module: z.enum(["screed", "roofing_pvc", "roofing_rub", "insulation", "demolition"]),
});

export const measurementEventPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.string().min(1).max(40),
});

export const leadSearchSchema = z.object({
  q: z.string().max(120).default(""),
});
