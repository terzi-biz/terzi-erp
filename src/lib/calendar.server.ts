import { z } from "zod";

export const eventFilterSchema = z.object({
  fromISO: z.string(),
  toISO: z.string(),
  employeeId: z.string().uuid().nullable().optional(),
  crewKey: z.string().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  statuses: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  directions: z.array(z.string()).optional(),
  search: z.string().max(120).nullable().optional(),
});

const nullableUuid = z.string().uuid().nullable().optional();

export const calendarEventPayload = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  event_type: z.string().min(1).max(60),
  category: z.string().min(1).max(40),
  direction: z.string().max(40).nullable().optional(),
  status: z.string().max(40).default("planned"),
  priority: z.string().max(20).default("normal"),
  starts_at: z.string(),
  ends_at: z.string(),
  all_day: z.boolean().default(false),
  description: z.string().max(4000).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  zone: z.string().max(120).nullable().optional(),
  client_name: z.string().max(200).nullable().optional(),
  area: z.number().nullable().optional(),
  employee_id: nullableUuid,
  responsible_user_id: nullableUuid,
  manager_id: nullableUuid,
  participants: z.array(z.string().uuid()).default([]),
  crew_key: z.string().max(60).nullable().optional(),
  order_id: nullableUuid,
  client_id: nullableUuid,
  measurement_id: nullableUuid,
  estimate_id: nullableUuid,
  booking_id: nullableUuid,
  reminders: z.array(z.any()).default([]),
  checklist: z.array(z.any()).default([]),
});

export const rangeSchema = z.object({
  source_type: z.string().min(1).max(60),
  source_id: z.string().uuid(),
  event_type: z.string().min(1).max(60),
  patch: z.record(z.string(), z.any()),
});
