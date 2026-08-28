/** Схеми валідації для серверних функцій замовлень (клієнт-безпечний модуль). */
import { z } from "zod";
import { managementDataSchema } from "./order-management";
import {
  COMMERCIAL_STATUSES, PRODUCTION_STATUSES, FINANCIAL_STATUSES, RISK_LEVELS, ORDER_SERVICES,
} from "./orders.constants";

const isoOrNull = z.string().max(40).optional().nullable();

export const orderManagementInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(300).optional(),
  address: z.string().max(500).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  crm_link: z.string().max(500).optional().nullable(),
  commercial_status: z.enum(COMMERCIAL_STATUSES).optional(),
  production_status: z.enum(PRODUCTION_STATUSES).optional(),
  financial_status: z.enum(FINANCIAL_STATUSES).optional(),
  risk_level: z.enum(RISK_LEVELS).optional(),
  planned_start: isoOrNull,
  planned_end: isoOrNull,
  services: z.array(z.enum(ORDER_SERVICES)).optional(),
  management: managementDataSchema.partial().optional(),
});
