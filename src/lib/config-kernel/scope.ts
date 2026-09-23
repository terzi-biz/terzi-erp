/**
 * Control Plane — scope chain.
 * Порядок перевизначень: system → company → branch → department → role → user.
 * Зараз runtime резолвить system/company/role; branch/department/user уже
 * присутні в типах і в CHECK-обмеженні таблиці, тож додаються без редизайну.
 */
export const SCOPE_CHAIN = ["system", "company", "branch", "department", "role", "user"] as const;
export type ScopeType = (typeof SCOPE_CHAIN)[number];

/** Скоупи, які runtime вже підтримує (решта ігнорується резолвером до ввімкнення). */
export const ACTIVE_SCOPES: readonly ScopeType[] = ["system", "company", "role"];

export const COMPANY_ID = "terzi";

export interface ScopeRef {
  type: ScopeType;
  /** '' для system; 'terzi' для company; role_key для role; uuid для user тощо. */
  id: string;
}

/** Контекст виконання, з якого будується ланцюг. */
export interface ScopeContext {
  companyId?: string;
  branchId?: string | null;
  departmentId?: string | null;
  roleKey?: string | null;
  userId?: string | null;
}

/** Ланцюг від найзагальнішого до найспецифічнішого (пізніший перемагає). */
export function buildScopeChain(ctx: ScopeContext, active: readonly ScopeType[] = ACTIVE_SCOPES): ScopeRef[] {
  const all: (ScopeRef | null)[] = [
    { type: "system", id: "" },
    { type: "company", id: ctx.companyId ?? COMPANY_ID },
    ctx.branchId ? { type: "branch", id: ctx.branchId } : null,
    ctx.departmentId ? { type: "department", id: ctx.departmentId } : null,
    ctx.roleKey ? { type: "role", id: ctx.roleKey } : null,
    ctx.userId ? { type: "user", id: ctx.userId } : null,
  ];
  return all.filter((s): s is ScopeRef => !!s && active.includes(s.type));
}

export function scopeKey(s: ScopeRef): string {
  return `${s.type}:${s.id}`;
}
