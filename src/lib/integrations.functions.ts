import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cancelEventOp,
  createIntegrationOp,
  deleteIntegrationOp,
  deleteMappingOp,
  deleteWebhookOp,
  enqueueTestEventOp,
  listEventLogsOp,
  listEventsOp,
  listIntegrationsOp,
  listMappingsOp,
  listProvidersOp,
  queueStatsOp,
  removeSecretRefOp,
  retryEventOp,
  runQueueOp,
  saveMappingOp,
  saveWebhookOp,
  setSecretRefOp,
  startOAuthOp,
  testIntegrationOp,
  updateIntegrationOp,
} from "./integrations/ops.server";

const directionEnum = z.enum(["inbound", "outbound"]);

export const listIntegrationProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listProvidersOp(context.userId));

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listIntegrationsOp(context.userId));

export const createIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ providerKey: z.string().min(1), name: z.string().min(2).max(80), config: z.record(z.string(), z.unknown()).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => createIntegrationOp(context.userId, data));

export const updateIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => updateIntegrationOp(context.userId, data));

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => deleteIntegrationOp(context.userId, data.id));

export const testIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => testIntegrationOp(context.userId, data.id));

export const bindIntegrationSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        integrationId: z.string().uuid(),
        secretKey: z.string().min(1).max(60),
        secretRef: z.string().min(3).max(80).regex(/^[A-Z0-9_]+$/, "Лише великі латинські літери, цифри та _"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => setSecretRefOp(context.userId, data));

export const unbindIntegrationSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => removeSecretRefOp(context.userId, data.id));

export const saveIntegrationWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        integrationId: z.string().uuid(),
        direction: directionEnum,
        targetUrl: z.string().url().max(400).nullish(),
        events: z.array(z.string().max(80)).max(50).optional(),
        signatureMode: z.enum(["hmac_sha256", "none"]).optional(),
        signatureHeader: z.string().max(80).nullish(),
        secretRef: z.string().max(80).regex(/^[A-Z0-9_]*$/).nullish(),
        enabled: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveWebhookOp(context.userId, data));

export const deleteIntegrationWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => deleteWebhookOp(context.userId, data.id));

export const listIntegrationMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => listMappingsOp(context.userId, data.integrationId));

export const saveIntegrationMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        integrationId: z.string().uuid(),
        entity: z.string().min(1).max(40),
        direction: directionEnum,
        sourceField: z.string().min(1).max(120),
        targetField: z.string().min(1).max(120),
        transform: z.string().max(200).nullish(),
        defaultValue: z.string().max(200).nullish(),
        required: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveMappingOp(context.userId, data));

export const deleteIntegrationMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => deleteMappingOp(context.userId, data.id));

export const listIntegrationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        integrationId: z.string().uuid().nullish(),
        status: z.enum(["pending", "processing", "done", "failed", "dead"]).nullish(),
        direction: directionEnum.nullish(),
        search: z.string().max(80).nullish(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => listEventsOp(context.userId, data));

export const listIntegrationEventLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => listEventLogsOp(context.userId, data.eventId));

export const retryIntegrationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => retryEventOp(context.userId, data.eventId));

export const cancelIntegrationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => cancelEventOp(context.userId, data.eventId));

export const enqueueIntegrationTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        integrationId: z.string().uuid(),
        eventType: z.string().min(1).max(80),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => enqueueTestEventOp(context.userId, data));

export const getIntegrationQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => queueStatsOp(context.userId));

export const runIntegrationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runQueueOp(context.userId));

export const startIntegrationOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid(), redirectUri: z.string().url() }).parse(d))
  .handler(async ({ context, data }) => startOAuthOp(context.userId, data));

/* --------------------- Синхронізація та підготовка провайдерів --------------------- */

const syncModeEnum = z.enum(["off", "erp_master", "external_master", "bidirectional"]);

export const listIntegrationSyncSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { listSyncSettingsOp } = await import("./integrations/sync-ops.server");
    return listSyncSettingsOp(context.userId, data.integrationId);
  });

export const saveIntegrationSyncSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        integrationId: z.string().uuid(),
        entity: z.string().min(1).max(40),
        mode: syncModeEnum,
        pollEnabled: z.boolean().optional(),
        pollIntervalMin: z.number().int().min(5).max(1440).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { saveSyncSettingOp } = await import("./integrations/sync-ops.server");
    return saveSyncSettingOp(context.userId, data);
  });

export const runIntegrationSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ integrationId: z.string().uuid(), entities: z.array(z.string().max(40)).max(30).optional(), full: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { runSyncOp } = await import("./integrations/sync-ops.server");
    return runSyncOp(context.userId, data);
  });

export const pushIntegrationRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid(), entity: z.string().min(1).max(40), internalId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { pushRecordOp } = await import("./integrations/sync-ops.server");
    return pushRecordOp(context.userId, data);
  });

export const listIntegrationConflicts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid().nullish() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { listConflictsOp } = await import("./integrations/sync-ops.server");
    return listConflictsOp(context.userId, data.integrationId);
  });

export const resolveIntegrationConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), resolution: z.enum(["keep_erp", "keep_external", "ignore"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { resolveConflictOp } = await import("./integrations/sync-ops.server");
    return resolveConflictOp(context.userId, data);
  });

export const listIntegrationLineMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ integrationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { listLineMapOp } = await import("./integrations/sync-ops.server");
    return listLineMapOp(context.userId, data.integrationId);
  });

export const saveIntegrationLineMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        integrationId: z.string().uuid(),
        extension: z.string().min(1).max(20),
        userId: z.string().uuid().nullish(),
        displayName: z.string().max(80).nullish(),
        companyNumber: z.string().max(30).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { saveLineMapOp } = await import("./integrations/sync-ops.server");
    return saveLineMapOp(context.userId, data);
  });

export const deleteIntegrationLineMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { deleteLineMapOp } = await import("./integrations/sync-ops.server");
    return deleteLineMapOp(context.userId, data.id);
  });

export const getIntegrationProviderManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ providerKey: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const { getProviderManifestOp } = await import("./integrations/sync-ops.server");
    return getProviderManifestOp(context.userId, data.providerKey);
  });

export const saveIntegrationProviderManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ providerKey: z.string().min(1).max(40), manifest: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ context, data }) => {
    const { saveProviderManifestOp } = await import("./integrations/sync-ops.server");
    return saveProviderManifestOp(context.userId, data);
  });

export const runIntegrationAdapterTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ integrationId: z.string().uuid(), action: z.enum(["connection", "normalize", "inbound", "outbound"]), payload: z.record(z.string(), z.unknown()).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { adapterSelfTestOp } = await import("./integrations/sync-ops.server");
    return adapterSelfTestOp(context.userId, data);
  });
