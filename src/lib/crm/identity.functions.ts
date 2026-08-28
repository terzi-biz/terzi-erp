import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** READ-ONLY dry-run резолвера ідентичності CRM. Жодних змін у даних. */
export const runCrmIdentityDryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(2000).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { runIdentityDryRun } = await import("./identity.server");
    return runIdentityDryRun(context.supabase as never, data.limit ?? 1000);
  });

/** Статуси контрактів Integration Foundation (без секретів у відповіді). */
export const getFoundationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [{ listFoundationContracts, contractStatus }, { default: process }] = await Promise.all([
      import("@/lib/integrations/contracts"),
      import("node:process"),
    ]);
    const env = process.env as unknown as Record<string, string | undefined>;
    return listFoundationContracts().map((c) => ({
      label: c.label,
      kind: c.kind,
      inbound: c.inbound,
      outbound: c.outbound,
      note: c.note,
      ...contractStatus(c, env),
    }));
  });
