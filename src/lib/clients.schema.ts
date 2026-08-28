/** Схеми клієнтів (клієнт-безпечний модуль; module scope у *.functions.ts вирізає server-fn split). */
import { z } from "zod";

export const CLIENT_STATUSES = ["lead", "active", "done", "archived"] as const;

export const clientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  crm_link: z.string().max(500).optional().nullable(),
  status: z.enum(CLIENT_STATUSES).default("lead"),
});

export const clientIdInput = z.object({ id: z.string().uuid() });
