import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPayrollBridgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { bridgeStatus } = await import("./payroll-bridge.server");
    return bridgeStatus(context.userId);
  });

export const openPayrollSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { issueOpenUrl } = await import("./payroll-bridge.server");
    return issueOpenUrl(context.userId);
  });

export const searchPayrollOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(80).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { requirePayrollAccess } = await import("./payroll-bridge.server");
    await requirePayrollAccess(context.userId);
    let q = context.supabase.from("orders").select("id,number,name").order("updated_at", { ascending: false }).limit(20);
    if (data.q) q = q.or(`name.ilike.%${data.q.replace(/[%,()]/g, "")}%,number.ilike.%${data.q.replace(/[%,()]/g, "")}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const resendPayrollOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { requirePayrollAccess, syncOrderToPayroll, bridgeConfigured } = await import("./payroll-bridge.server");
    await requirePayrollAccess(context.userId);
    if (!bridgeConfigured()) return { status: "skipped" as const, message: "Потрібне налаштування серверного секрету" };
    return syncOrderToPayroll(data.orderId, "manual", context.userId);
  });

export const getPayrollSiteSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { requirePayrollAccess, fetchSiteSummary } = await import("./payroll-bridge.server");
    await requirePayrollAccess(context.userId);
    return fetchSiteSummary(data.orderId, context.userId);
  });
