import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  weekStartISO: z.string(), // початок тижня (UTC ISO, понеділок 00:00)
  managerId: z.string().uuid().optional().nullable(),
  statuses: z.array(z.string()).default([]),
});

export const getOperationsSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const start = new Date(data.weekStartISO);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    let q = context.supabase
      .from("estimates")
      .select("id,number,module,status,client_name,address,manager,area,total_client,schedule_start_at,schedule_end_at,duration_days,duration_override_days,owner_id,gcal_event_id")
      .not("schedule_start_at", "is", null)
      .lt("schedule_start_at", end.toISOString())
      .gte("schedule_end_at", start.toISOString());

    if (data.statuses.length) q = q.in("status", data.statuses);
    if (data.managerId) q = q.eq("owner_id", data.managerId);

    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listStaffDirectory } = await import("./staff.server");
    return await listStaffDirectory();
  });
