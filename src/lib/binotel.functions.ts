import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Серверні функції інтеграції Binotel. Уся логіка — у binotel/ops.server.ts. */

export const getBinotelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelStatusOp } = await import("./integrations/binotel/ops.server");
    return binotelStatusOp(context.userId);
  });

export const ensureBinotelIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureBinotelIntegrationOp } = await import("./integrations/binotel/ops.server");
    return ensureBinotelIntegrationOp(context.userId);
  });

export const testBinotelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelTestConnectionOp } = await import("./integrations/binotel/ops.server");
    return binotelTestConnectionOp(context.userId);
  });

export const syncBinotelEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelSyncEmployeesOp } = await import("./integrations/binotel/ops.server");
    return binotelSyncEmployeesOp(context.userId);
  });

export const listBinotelEmployeeMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelListEmployeeMappingsOp } = await import("./integrations/binotel/ops.server");
    return binotelListEmployeeMappingsOp(context.userId);
  });

export const setBinotelEmployeeMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), localUserId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { binotelSetEmployeeMappingOp } = await import("./integrations/binotel/ops.server");
    return binotelSetEmployeeMappingOp(context.userId, data);
  });

export const listBinotelPbx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelListPbxOp } = await import("./integrations/binotel/ops.server");
    return binotelListPbxOp(context.userId);
  });

export const saveBinotelPbx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        pbxNumber: z.string().min(3).max(32),
        pbxNumberName: z.string().max(120).nullable().optional(),
        pipelineId: z.string().uuid().nullable().optional(),
        stageId: z.string().uuid().nullable().optional(),
        serviceDirection: z.string().max(60).nullable().optional(),
        defaultAssignee: z.string().uuid().nullable().optional(),
        sourceLabel: z.string().max(80).nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { binotelSavePbxOp } = await import("./integrations/binotel/ops.server");
    return binotelSavePbxOp(context.userId, data);
  });

export const deleteBinotelPbx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { binotelDeletePbxOp } = await import("./integrations/binotel/ops.server");
    return binotelDeletePbxOp(context.userId, data.id);
  });

export const syncBinotelPbx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelSyncPbxOp } = await import("./integrations/binotel/ops.server");
    return binotelSyncPbxOp(context.userId);
  });

export const getBinotelSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelGetSettingsOp } = await import("./integrations/binotel/ops.server");
    return binotelGetSettingsOp(context.userId);
  });

export const saveBinotelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        missedSlaMinutes: z.number().int().min(1).max(240).optional(),
        escalationMinutes: z.number().int().min(1).max(1440).optional(),
        autoCreateLead: z.boolean().optional(),
        autoCreateContact: z.boolean().optional(),
        autoCreateMissedTask: z.boolean().optional(),
        routeToAssignedManager: z.boolean().optional(),
        defaultPipelineId: z.string().uuid().nullable().optional(),
        defaultStageId: z.string().uuid().nullable().optional(),
        reconcileWindowHours: z.number().int().min(1).max(72).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { binotelSaveSettingsOp } = await import("./integrations/binotel/ops.server");
    return binotelSaveSettingsOp(context.userId, data);
  });

export const getBinotelWebhookUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { binotelWebhookUrlsOp } = await import("./integrations/binotel/ops.server");
    return binotelWebhookUrlsOp(context.userId);
  });

export const listBinotelCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        generalCallId: z.string().max(64).nullable().optional(),
        disposition: z.string().max(32).nullable().optional(),
        direction: z.string().max(16).nullable().optional(),
        sla: z.enum(["all", "no_task", "in_sla", "overdue", "done"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { binotelCallsDashboardOp } = await import("./integrations/binotel/dashboard.server");
    return binotelCallsDashboardOp(context.userId, data);
  });

export const getBinotelCallDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ generalCallId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ context, data }) => {
    const { binotelCallDetailOp } = await import("./integrations/binotel/dashboard.server");
    return binotelCallDetailOp(context.userId, data.generalCallId);
  });
