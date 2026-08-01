/** Операції модуля «Доступи і ролі» (виконуються лише на сервері). */
import {
  admin,
  hashToken,
  loadActor,
  newToken,
  requireAccessManager,
  requireOwner,
  writeAudit,
} from "./access.server";
import type { AccessScope, AccessStatus } from "./access-constants";

export type AccessUserRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  role_key: string | null;
  role_name: string | null;
  scope: AccessScope;
  status: AccessStatus;
  manager_id: string | null;
  manager_name: string | null;
  temporary: boolean;
  access_expires_at: string | null;
  last_sign_in_at: string | null;
  devices: number;
  created_at: string | null;
  admin_note: string | null;
  overrides: number;
};

export async function listUsersOp(userId: string): Promise<AccessUserRow[]> {
  await requireAccessManager(userId);
  const db = await admin();
  const [{ data: access }, { data: profiles }, { data: roles }, { data: overrides }] = await Promise.all([
    db.from("user_access").select("*"),
    db.from("profiles").select("user_id,display_name,email,avatar_url,phone,position,department,created_at"),
    db.from("access_roles").select("key,name"),
    db.from("user_permission_overrides").select("user_id"),
  ]);
  const roleName = new Map((roles ?? []).map((r: any) => [r.key, r.name]));
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.display_name]));
  const overrideCount = new Map<string, number>();
  (overrides ?? []).forEach((o: any) => overrideCount.set(o.user_id, (overrideCount.get(o.user_id) ?? 0) + 1));

  let authUsers: any[] = [];
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    authUsers = data?.users ?? [];
  } catch {
    authUsers = [];
  }
  const authMap = new Map(authUsers.map((u) => [u.id, u]));

  const rows: AccessUserRow[] = (access ?? []).map((a: any) => {
    const p: any = profileMap.get(a.user_id) ?? {};
    const au: any = authMap.get(a.user_id);
    return {
      user_id: a.user_id,
      display_name: p.display_name ?? au?.email ?? null,
      email: p.email ?? au?.email ?? null,
      avatar_url: p.avatar_url ?? null,
      phone: p.phone ?? null,
      position: a.position ?? p.position ?? null,
      department: a.department ?? p.department ?? null,
      role_key: a.role_key,
      role_name: a.role_key ? (roleName.get(a.role_key) ?? a.role_key) : null,
      scope: a.scope,
      status: au?.banned_until && new Date(au.banned_until) > new Date() ? "blocked" : a.status,
      manager_id: a.manager_id,
      manager_name: a.manager_id ? (nameMap.get(a.manager_id) ?? null) : null,
      temporary: a.temporary,
      access_expires_at: a.access_expires_at,
      last_sign_in_at: au?.last_sign_in_at ?? a.last_sign_in_at ?? null,
      devices: au?.last_sign_in_at ? 1 : 0,
      created_at: p.created_at ?? au?.created_at ?? a.created_at,
      admin_note: a.admin_note,
      overrides: overrideCount.get(a.user_id) ?? 0,
    };
  });
  rows.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "uk"));
  return rows;
}

export type UpdateUserAccessInput = {
  userId: string;
  role_key?: string | null;
  scope?: AccessScope;
  status?: AccessStatus;
  manager_id?: string | null;
  position?: string | null;
  department?: string | null;
  temporary?: boolean;
  access_expires_at?: string | null;
  admin_note?: string | null;
  reason?: string | null;
};

export async function updateUserAccessOp(actorId: string, input: UpdateUserAccessInput) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { data: current } = await db.from("user_access").select("*").eq("user_id", input.userId).maybeSingle();
  if (!current) throw new Error("Картку доступу не знайдено");

  // Роль власника призначає лише власник
  if (input.role_key === "owner" && !actor.isOwner) throw new Error("Роль власника може призначити лише власник");
  if (current.role_key === "owner" && !actor.isOwner) throw new Error("Змінювати доступ власника може лише власник");
  if (input.userId === actorId && input.role_key && input.role_key !== current.role_key) {
    throw new Error("Не можна змінювати власну роль");
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["role_key", "scope", "status", "manager_id", "position", "department", "temporary", "access_expires_at", "admin_note"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (input.status === "blocked" || input.status === "dismissed") {
    patch.blocked_at = new Date().toISOString();
    patch.blocked_by = actorId;
  }
  const { data: updated, error } = await db.from("user_access").update(patch as any).eq("user_id", input.userId).select("*").single();
  if (error) throw new Error("Не вдалося зберегти доступ");

  // Блокування / розблокування реальних сесій
  try {
    if (input.status === "blocked" || input.status === "dismissed" || input.status === "archived") {
      await db.auth.admin.updateUserById(input.userId, { ban_duration: "876000h" } as any);
    } else if (input.status === "active") {
      await db.auth.admin.updateUserById(input.userId, { ban_duration: "none" } as any);
    }
  } catch {
    /* адмін-API недоступний — статус усе одно перевіряється сервером */
  }

  await writeAudit(actor, {
    module: "staff",
    action: "access_updated",
    entityType: "user",
    entityId: input.userId,
    oldValue: current,
    newValue: updated,
    reason: input.reason ?? null,
    isCritical: true,
  });
  return updated;
}

export async function setOverrideOp(
  actorId: string,
  input: { userId: string; module: string; action: string; effect: "allow" | "deny"; reason?: string | null; expires_at?: string | null },
) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { data, error } = await db
    .from("user_permission_overrides")
    .upsert(
      {
        user_id: input.userId,
        module: input.module,
        action: input.action,
        effect: input.effect,
        reason: input.reason ?? null,
        expires_at: input.expires_at ?? null,
        created_by: actorId,
      },
      { onConflict: "user_id,module,action" },
    )
    .select("*")
    .single();
  if (error) throw new Error("Не вдалося зберегти індивідуальне право");
  await writeAudit(actor, {
    module: "staff",
    action: "permission_override_set",
    entityType: "user",
    entityId: input.userId,
    newValue: data,
    reason: input.reason ?? null,
    isCritical: true,
  });
  return data;
}

export async function removeOverrideOp(actorId: string, id: string) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { data: old } = await db.from("user_permission_overrides").select("*").eq("id", id).maybeSingle();
  const { error } = await db.from("user_permission_overrides").delete().eq("id", id);
  if (error) throw new Error("Не вдалося видалити виняток");
  await writeAudit(actor, { module: "staff", action: "permission_override_removed", entityType: "user", entityId: old?.user_id ?? null, oldValue: old, isCritical: true });
  return { ok: true };
}

export async function listOverridesOp(actorId: string, userId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  const { data } = await db.from("user_permission_overrides").select("*").eq("user_id", userId);
  return data ?? [];
}

export async function listRolesOp(actorId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  const [{ data: roles }, { data: perms }, { data: access }] = await Promise.all([
    db.from("access_roles").select("*").order("sort_order"),
    db.from("role_permissions").select("role_key,module,action,allowed"),
    db.from("user_access").select("role_key"),
  ]);
  const counts = new Map<string, number>();
  (access ?? []).forEach((a: any) => a.role_key && counts.set(a.role_key, (counts.get(a.role_key) ?? 0) + 1));
  return {
    roles: (roles ?? []).map((r: any) => ({ ...r, users: counts.get(r.key) ?? 0 })),
    permissions: perms ?? [],
  };
}

export async function saveRoleOp(
  actorId: string,
  input: {
    key: string;
    name: string;
    description?: string | null;
    default_scope?: AccessScope;
    is_active?: boolean;
    permissions?: { module: string; action: string; allowed: boolean }[];
  },
) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { data: existing } = await db.from("access_roles").select("*").eq("key", input.key).maybeSingle();
  if (existing?.key === "owner" && !actor.isOwner) throw new Error("Роль власника змінює лише власник");

  const { error: roleError } = await db.from("access_roles").upsert(
    {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      default_scope: input.default_scope ?? existing?.default_scope ?? "company",
      is_active: input.is_active ?? existing?.is_active ?? true,
      is_system: existing?.is_system ?? false,
      sort_order: existing?.sort_order ?? 100,
      updated_by: actorId,
      updated_by_name: actor.name,
    },
    { onConflict: "key" },
  );
  if (roleError) throw new Error("Не вдалося зберегти роль");

  if (input.permissions?.length) {
    if (input.key === "owner") throw new Error("Права власника змінювати не можна");
    const rows = input.permissions.map((p) => ({ role_key: input.key, module: p.module, action: p.action, allowed: p.allowed }));
    const { error } = await db.from("role_permissions").upsert(rows, { onConflict: "role_key,module,action" });
    if (error) throw new Error("Не вдалося зберегти матрицю прав");
  }

  await writeAudit(actor, {
    module: "settings",
    action: existing ? "role_updated" : "role_created",
    entityType: "role",
    entityId: input.key,
    oldValue: existing,
    newValue: { ...input, permissions: input.permissions?.length ?? 0 },
    isCritical: true,
  });
  return { ok: true };
}

export async function listInvitationsOp(actorId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  const { data } = await db.from("user_invitations").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function createInvitationOp(
  actorId: string,
  input: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    middle_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    position?: string | null;
    department?: string | null;
    role_key: string;
    manager_id?: string | null;
    scope: AccessScope;
    temporary?: boolean;
    access_expires_at?: string | null;
    admin_note?: string | null;
  },
) {
  const actor = await requireAccessManager(actorId);
  if (input.role_key === "owner" && !actor.isOwner) throw new Error("Роль власника може призначити лише власник");
  const db = await admin();
  const token = newToken();
  const token_hash = await hashToken(token);
  const { data, error } = await db
    .from("user_invitations")
    .insert({ ...input, email: input.email.trim().toLowerCase(), token_hash, created_by: actorId })
    .select("*")
    .single();
  if (error) throw new Error("Не вдалося створити запрошення");

  // Створюємо картку доступу зі статусом «Запрошений», якщо користувач уже існує
  await writeAudit(actor, { module: "staff", action: "invitation_created", entityType: "invitation", entityId: data.id, newValue: { email: data.email, role_key: data.role_key }, isCritical: true });
  return { invitation: data, token };
}

export async function revokeInvitationOp(actorId: string, id: string) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { error } = await db.from("user_invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw new Error("Не вдалося відкликати запрошення");
  await writeAudit(actor, { module: "staff", action: "invitation_revoked", entityType: "invitation", entityId: id, isCritical: true });
  return { ok: true };
}

/** Прийняття запрошення авторизованим користувачем: одноразово, з перевіркою терміну та пошти. */
export async function acceptInvitationOp(userId: string, token: string) {
  const db = await admin();
  const token_hash = await hashToken(token);
  const { data: inv } = await db.from("user_invitations").select("*").eq("token_hash", token_hash).maybeSingle();
  if (!inv) throw new Error("Запрошення не знайдено");
  if (inv.status !== "sent") throw new Error("Запрошення вже використане або відкликане");
  if (new Date(inv.expires_at) < new Date()) {
    await db.from("user_invitations").update({ status: "expired" }).eq("id", inv.id);
    throw new Error("Термін дії запрошення завершився");
  }
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const email = authUser?.user?.email?.toLowerCase();
  if (!email || email !== inv.email.toLowerCase()) throw new Error("Запрошення надіслано на іншу електронну пошту");

  const displayName = [inv.last_name, inv.first_name, inv.middle_name].filter(Boolean).join(" ") || email;
  await db.from("profiles").upsert(
    {
      user_id: userId,
      email,
      display_name: displayName,
      avatar_url: inv.avatar_url,
      phone: inv.phone,
      position: inv.position,
      department: inv.department,
      is_active: true,
    },
    { onConflict: "user_id" },
  );
  await db.from("user_access").upsert(
    {
      user_id: userId,
      role_key: inv.role_key,
      scope: inv.scope,
      status: "active",
      manager_id: inv.manager_id,
      position: inv.position,
      department: inv.department,
      temporary: inv.temporary,
      access_expires_at: inv.access_expires_at,
      admin_note: inv.admin_note,
    },
    { onConflict: "user_id" },
  );
  await db.from("registration_approvals").upsert(
    { user_id: userId, email, display_name: displayName, status: "approved", reviewed_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  const overrides = Array.isArray(inv.overrides) ? (inv.overrides as any[]) : [];
  if (overrides.length) {
    await db.from("user_permission_overrides").upsert(
      overrides.map((o) => ({ user_id: userId, module: o.module, action: o.action, effect: o.effect, reason: o.reason ?? "Запрошення", expires_at: o.expires_at ?? null })),
      { onConflict: "user_id,module,action" },
    );
  }
  await db.from("user_invitations").update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_user_id: userId }).eq("id", inv.id);

  const actor = await loadActor(userId);
  await writeAudit(actor, { module: "staff", action: "invitation_accepted", entityType: "invitation", entityId: inv.id, newValue: { role_key: inv.role_key }, isCritical: true });
  return { ok: true, role_key: inv.role_key };
}

export async function listAccessRequestsOp(actorId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  const { data } = await db.from("access_requests").select("*").order("created_at", { ascending: false }).limit(300);
  return data ?? [];
}

export async function createAccessRequestOp(
  userId: string,
  input: { kind: "recovery" | "elevation" | "temporary"; requested_role_key?: string | null; requested_module?: string | null; requested_action?: string | null; reason?: string | null; temporary_until?: string | null },
) {
  const db = await admin();
  const actor = await loadActor(userId);
  const { data: profile } = await db.from("profiles").select("email,display_name").eq("user_id", userId).maybeSingle();
  const { data, error } = await db
    .from("access_requests")
    .insert({
      user_id: userId,
      email: profile?.email ?? null,
      display_name: profile?.display_name ?? null,
      kind: input.kind,
      current_role_key: actor.roleKey,
      requested_role_key: input.requested_role_key ?? null,
      requested_module: input.requested_module ?? null,
      requested_action: input.requested_action ?? null,
      reason: input.reason ?? null,
      temporary_until: input.temporary_until ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Не вдалося створити запит");
  return data;
}

export async function reviewAccessRequestOp(
  actorId: string,
  input: {
    id: string;
    decision: "approved" | "rejected" | "info_requested";
    note?: string | null;
    role_key?: string | null;
    scope?: AccessScope;
    position?: string | null;
    department?: string | null;
    manager_id?: string | null;
    temporary_until?: string | null;
  },
) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const { data: req } = await db.from("access_requests").select("*").eq("id", input.id).maybeSingle();
  if (!req) throw new Error("Запит не знайдено");

  if (input.decision === "approved" && req.kind === "registration") {
    if (!input.role_key) throw new Error("Без призначення ролі акаунт не активується");
    if (input.role_key === "owner" && !actor.isOwner) throw new Error("Роль власника може призначити лише власник");
    await db.from("user_access").upsert(
      {
        user_id: req.user_id!,
        role_key: input.role_key,
        scope: input.scope ?? "own",
        status: "active",
        position: input.position ?? null,
        department: input.department ?? null,
        manager_id: input.manager_id ?? null,
        temporary: Boolean(input.temporary_until),
        access_expires_at: input.temporary_until ?? null,
      },
      { onConflict: "user_id" },
    );
    if (input.position || input.department) {
      await db.from("profiles").update({ position: input.position ?? null, department: input.department ?? null }).eq("user_id", req.user_id!);
    }
    await db.from("registration_approvals").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: actorId }).eq("user_id", req.user_id!);
    try {
      await db.auth.admin.updateUserById(req.user_id!, { ban_duration: "none" } as any);
    } catch { /* ignore */ }
  }

  if (input.decision === "approved" && (req.kind === "elevation" || req.kind === "temporary") && req.requested_module && req.requested_action) {
    await db.from("user_permission_overrides").upsert(
      {
        user_id: req.user_id!,
        module: req.requested_module,
        action: req.requested_action,
        effect: "allow",
        reason: input.note ?? req.reason ?? null,
        expires_at: input.temporary_until ?? req.temporary_until ?? null,
        created_by: actorId,
      },
      { onConflict: "user_id,module,action" },
    );
  }

  if (input.decision === "rejected" && req.kind === "registration" && req.user_id) {
    await db.from("user_access").upsert({ user_id: req.user_id, status: "blocked" }, { onConflict: "user_id" });
    await db.from("registration_approvals").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: actorId }).eq("user_id", req.user_id);
  }

  const { data: updated, error } = await db
    .from("access_requests")
    .update({
      status: input.decision,
      review_note: input.note ?? null,
      reviewed_by: actorId,
      reviewed_by_name: actor.name,
      reviewed_at: new Date().toISOString(),
      temporary_until: input.temporary_until ?? req.temporary_until,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error("Не вдалося оновити запит");

  await writeAudit(actor, { module: "staff", action: `access_request_${input.decision}`, entityType: "access_request", entityId: input.id, oldValue: req, newValue: updated, isCritical: true });
  return updated;
}

export type AuditFilters = {
  actorId?: string | null;
  module?: string | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
  criticalOnly?: boolean;
  search?: string | null;
  limit?: number;
};

export async function listAuditOp(actorId: string, filters: AuditFilters) {
  await requireAccessManager(actorId);
  const db = await admin();
  let q = db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(Math.min(filters.limit ?? 200, 500));
  if (filters.actorId) q = q.eq("actor_id", filters.actorId);
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.criticalOnly) q = q.eq("is_critical", true);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.search) {
    const safe = filters.search.replace(/[,()%*]/g, " ").trim();
    if (safe) q = q.or(`entity_label.ilike.%${safe}%,actor_name.ilike.%${safe}%,action.ilike.%${safe}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error("Не вдалося завантажити журнал");
  return data ?? [];
}

export async function securityOverviewOp(actorId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  let users: any[] = [];
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    users = data?.users ?? [];
  } catch {
    users = [];
  }
  const { data: access } = await db.from("user_access").select("user_id,status,role_key,access_expires_at,temporary");
  const { data: profiles } = await db.from("profiles").select("user_id,display_name,email");
  const { data: failed } = await db
    .from("audit_logs")
    .select("*")
    .in("action", ["login_failed", "login_new_device"])
    .order("created_at", { ascending: false })
    .limit(50);
  const accessMap = new Map((access ?? []).map((a: any) => [a.user_id, a]));
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
  const sessions = users.map((u) => {
    const a: any = accessMap.get(u.id);
    const p: any = profileMap.get(u.id);
    return {
      user_id: u.id,
      email: p?.email ?? u.email ?? null,
      display_name: p?.display_name ?? u.email ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
      confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
      provider: u.app_metadata?.provider ?? "email",
      banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
      status: a?.status ?? "pending",
      temporary: Boolean(a?.temporary),
      access_expires_at: a?.access_expires_at ?? null,
    };
  });
  sessions.sort((x, y) => (y.last_sign_in_at ?? "").localeCompare(x.last_sign_in_at ?? ""));
  return { sessions, failed: failed ?? [] };
}

export async function terminateSessionsOp(actorId: string, targetUserId: string) {
  const actor = await requireAccessManager(actorId);
  const target = await loadActor(targetUserId);
  if (target.isOwner && !actor.isOwner) throw new Error("Сесії власника може завершити лише власник");
  const db = await admin();
  try {
    await db.auth.admin.updateUserById(targetUserId, { ban_duration: "1h" } as any);
    await db.auth.admin.updateUserById(targetUserId, { ban_duration: "none" } as any);
  } catch {
    throw new Error("Не вдалося завершити сесії");
  }
  await writeAudit(actor, { module: "staff", action: "sessions_terminated", entityType: "user", entityId: targetUserId, isCritical: true });
  return { ok: true };
}

/** Передача клієнтів, об'єктів і кошторисів іншому співробітнику. */
export async function transferWorkloadOp(actorId: string, fromUserId: string, toUserId: string) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const [clients, objects, estimates, assignments] = await Promise.all([
    db.from("clients").update({ owner_id: toUserId }).eq("owner_id", fromUserId).select("id"),
    db.from("objects").update({ manager_id: toUserId }).eq("manager_id", fromUserId).select("id"),
    db.from("estimates").update({ owner_id: toUserId }).eq("owner_id", fromUserId).select("id"),
    db.from("object_assignments").update({ user_id: toUserId }).eq("user_id", fromUserId).select("id"),
  ]);
  const result = {
    clients: clients.data?.length ?? 0,
    objects: objects.data?.length ?? 0,
    estimates: estimates.data?.length ?? 0,
    assignments: assignments.data?.length ?? 0,
  };
  await writeAudit(actor, { module: "staff", action: "workload_transferred", entityType: "user", entityId: fromUserId, newValue: { to: toUserId, ...result }, isCritical: true });
  return result;
}

export async function listNotificationRulesOp(actorId: string) {
  await requireAccessManager(actorId);
  const db = await admin();
  const { data } = await db.from("notification_rules").select("*").order("name");
  return data ?? [];
}

export async function saveNotificationRuleOp(actorId: string, input: { id: string; enabled?: boolean; threshold?: number | null; digest?: string; channel?: string }) {
  const actor = await requireAccessManager(actorId);
  const db = await admin();
  const patch: Record<string, unknown> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.threshold !== undefined) patch.threshold = input.threshold;
  if (input.digest !== undefined) patch.digest = input.digest;
  if (input.channel !== undefined) patch.channel = input.channel;
  const { data, error } = await db.from("notification_rules").update(patch as any).eq("id", input.id).select("*").single();
  if (error) throw new Error("Не вдалося зберегти правило");
  await writeAudit(actor, { module: "settings", action: "notification_rule_updated", entityType: "notification_rule", entityId: input.id, newValue: data });
  return data;
}

/** Критична дія: остаточне видалення — лише власник, з повторним підтвердженням пароля. */
const OWNER_PWD_WINDOW_MIN = 15;
const OWNER_PWD_MAX_FAILS = 5;

export async function verifyOwnerPasswordOp(userId: string, password: string) {
  await requireOwner(userId);
  const db = await admin();

  const since = new Date(Date.now() - OWNER_PWD_WINDOW_MIN * 60_000).toISOString();
  const { count: fails } = await db
    .from("auth_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "verify_owner_password")
    .eq("succeeded", false)
    .gte("created_at", since);
  if ((fails ?? 0) >= OWNER_PWD_MAX_FAILS) {
    throw new Error(`Забагато невдалих спроб. Спробуйте через ${OWNER_PWD_WINDOW_MIN} хв`);
  }

  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) throw new Error("Не вдалося визначити акаунт");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  await db.from("auth_rate_limits").insert({
    user_id: userId, action: "verify_owner_password", succeeded: !error,
  });
  if (error) throw new Error("Пароль не підтверджено");
  await db.from("auth_rate_limits")
    .delete().eq("user_id", userId).eq("action", "verify_owner_password").eq("succeeded", false);
  return { ok: true };
}

export async function myAccessOp(userId: string) {
  const db = await admin();
  const actor = await loadActor(userId);
  const [{ data: access }, { data: overrides }] = await Promise.all([
    db.from("user_access").select("*").eq("user_id", userId).maybeSingle(),
    db.from("user_permission_overrides").select("module,action,effect,expires_at").eq("user_id", userId),
  ]);
  let permissions: { module: string; action: string; allowed: boolean }[] = [];
  if (access?.role_key) {
    const { data } = await db.from("role_permissions").select("module,action,allowed").eq("role_key", access.role_key);
    permissions = data ?? [];
  }
  return { actor, access: access ?? null, overrides: overrides ?? [], permissions };
}
