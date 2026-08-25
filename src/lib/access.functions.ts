import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acceptInvitationOp,
  createAccessRequestOp,
  createInvitationOp,
  listAccessRequestsOp,
  listAuditOp,
  listInvitationsOp,
  listNotificationRulesOp,
  listOverridesOp,
  listRolesOp,
  listUsersOp,
  myAccessOp,
  removeOverrideOp,
  reviewAccessRequestOp,
  revokeInvitationOp,
  saveNotificationRuleOp,
  saveRoleOp,
  securityOverviewOp,
  setOverrideOp,
  terminateSessionsOp,
  transferWorkloadOp,
  updateUserAccessOp,
  verifyOwnerPasswordOp,
} from "./access-ops.server";

const scopeEnum = z.enum(["own", "assigned", "department", "company", "custom"]);
const statusEnum = z.enum(["invited", "pending", "active", "suspended", "blocked", "dismissed", "archived"]);

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => myAccessOp(context.userId));

export const listAccessUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listUsersOp(context.userId));

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role_key: z.string().min(1).nullable().optional(),
        scope: scopeEnum.optional(),
        status: statusEnum.optional(),
        manager_id: z.string().uuid().nullable().optional(),
        position: z.string().max(120).nullable().optional(),
        department: z.string().max(120).nullable().optional(),
        temporary: z.boolean().optional(),
        access_expires_at: z.string().nullable().optional(),
        admin_note: z.string().max(2000).nullable().optional(),
        reason: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => updateUserAccessOp(context.userId, data));

export const listUserOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => listOverridesOp(context.userId, data.userId));

export const setUserOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        module: z.string().min(1),
        action: z.string().min(1),
        effect: z.enum(["allow", "deny"]),
        reason: z.string().max(2000).nullable().optional(),
        expires_at: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => setOverrideOp(context.userId, data));

export const removeUserOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => removeOverrideOp(context.userId, data.id));

export const listAccessRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listRolesOp(context.userId));

export const saveAccessRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().min(2).max(48).regex(/^[a-z0-9_]+$/),
        name: z.string().min(2).max(120),
        description: z.string().max(500).nullable().optional(),
        default_scope: scopeEnum.optional(),
        is_active: z.boolean().optional(),
        permissions: z.array(z.object({ module: z.string(), action: z.string(), allowed: z.boolean() })).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => saveRoleOp(context.userId, data));

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listInvitationsOp(context.userId));

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        first_name: z.string().max(80).nullable().optional(),
        last_name: z.string().max(80).nullable().optional(),
        middle_name: z.string().max(80).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        position: z.string().max(120).nullable().optional(),
        department: z.string().max(120).nullable().optional(),
        role_key: z.string().min(1),
        manager_id: z.string().uuid().nullable().optional(),
        scope: scopeEnum,
        temporary: z.boolean().optional(),
        access_expires_at: z.string().nullable().optional(),
        admin_note: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => createInvitationOp(context.userId, data));

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => revokeInvitationOp(context.userId, data.id));

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => acceptInvitationOp(context.userId, data.token));

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listAccessRequestsOp(context.userId));

export const createAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["recovery", "elevation", "temporary"]),
        requested_role_key: z.string().nullable().optional(),
        requested_module: z.string().nullable().optional(),
        requested_action: z.string().nullable().optional(),
        reason: z.string().max(2000).nullable().optional(),
        temporary_until: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => createAccessRequestOp(context.userId, data));

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "info_requested"]),
        note: z.string().max(2000).nullable().optional(),
        role_key: z.string().nullable().optional(),
        scope: scopeEnum.optional(),
        position: z.string().max(120).nullable().optional(),
        department: z.string().max(120).nullable().optional(),
        manager_id: z.string().uuid().nullable().optional(),
        temporary_until: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => reviewAccessRequestOp(context.userId, data));

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        actorId: z.string().uuid().nullable().optional(),
        module: z.string().nullable().optional(),
        action: z.string().nullable().optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        criticalOnly: z.boolean().optional(),
        search: z.string().max(200).nullable().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => listAuditOp(context.userId, data));

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => securityOverviewOp(context.userId));

export const terminateUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => terminateSessionsOp(context.userId, data.userId));

export const transferWorkload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fromUserId: z.string().uuid(), toUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => transferWorkloadOp(context.userId, data.fromUserId, data.toUserId));

export const listNotificationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listNotificationRulesOp(context.userId));

export const saveNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        threshold: z.number().nullable().optional(),
        digest: z.string().optional(),
        channel: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => saveNotificationRuleOp(context.userId, data));

export const verifyOwnerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(6).max(200) }).parse(d))
  .handler(async ({ data, context }) => verifyOwnerPasswordOp(context.userId, data.password));

/**
 * Чи має поточний користувач право бачити внутрішні ціни (собівартість/маржа).
 * Перевірка виконується на сервері; UI лише відображає результат.
 */
export const getInternalPricesAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { canViewInternalPrices } = await import("./access.server");
    return { allowed: await canViewInternalPrices(context.userId) };
  });
