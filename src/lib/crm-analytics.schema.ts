/** Схеми для аналітики дзвінків і замірів (клієнт-безпечний модуль). */
import { z } from "zod";

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
});
