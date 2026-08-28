import { z } from "zod";

/** Схеми валідації для складських серверних функцій (окремий модуль:
 *  module-scope константи всередині *.functions.ts видаляються при
 *  serverfn-split і дають ReferenceError у рантаймі). */

export const uuid = z.string().uuid();
export const nullableUuid = uuid.nullable().optional();

export const lineInput = z.object({
  item_id: uuid,
  qty: z.number(),
  price: z.number().min(0).default(0),
  note: z.string().max(300).optional().nullable(),
});
