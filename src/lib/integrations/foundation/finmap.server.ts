/**
 * Finmap: контракт синхронізації фактичних фінансових операцій.
 *
 * Правила:
 *  - Finmap — джерело істини по фактичних грошах; ERP не створює власних дублікатів;
 *  - кожна операція має idempotency-ключ provider + external id + версія/hash;
 *  - курсор last_sync та остання помилка зберігаються поруч із підключенням;
 *  - реальні виклики API вимкнено до отримання credentials (стан blocked).
 */

export type FinmapEntity = "account" | "category" | "operation";

export const FINMAP_ENTITIES: { entity: FinmapEntity; event: string; erpTarget: string; mirrorOnly: true }[] = [
  { entity: "account", event: "finmap.account", erpTarget: "finance_accounts", mirrorOnly: true },
  { entity: "category", event: "finmap.category", erpTarget: "finance_categories (довідник)", mirrorOnly: true },
  { entity: "operation", event: "finmap.operation", erpTarget: "payments / expenses", mirrorOnly: true },
];

export function finmapIdempotencyKey(input: { entity: FinmapEntity; externalId: unknown; updatedAt?: unknown; hash?: string | null }): string {
  const version = input.hash ?? (input.updatedAt != null ? String(input.updatedAt) : "");
  return ["finmap", input.entity, String(input.externalId ?? ""), version].join(":");
}

export type FinmapSyncPlan = {
  provider: "finmap";
  entity: FinmapEntity | null;
  idempotencyKey: string | null;
  lastSyncAt: string | null;
  cursor: string | null;
  mirrorOnly: true;
  state: "blocked";
  message: string;
  error: string | null;
};

/** Планує синхронізацію: що і з якого курсора читати. Нічого не надсилає й не пише. */
export function planFinmapSync(
  config: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown>,
  eventType: string,
): FinmapSyncPlan {
  const map = FINMAP_ENTITIES.find((e) => e.event === eventType);
  const cfg = (config ?? {}) as Record<string, any>;
  const lastSyncAt = typeof cfg.last_sync_at === "string" ? cfg.last_sync_at : null;
  const entity = map?.entity ?? null;
  return {
    provider: "finmap",
    entity,
    idempotencyKey: entity
      ? finmapIdempotencyKey({ entity, externalId: (payload as any).id ?? (payload as any).external_id, updatedAt: (payload as any).updated_at })
      : null,
    lastSyncAt,
    cursor: lastSyncAt,
    mirrorOnly: true,
    state: "blocked",
    message: entity
      ? `Finmap ${entity}: підготовлено до синхронізації (дзеркало, без дублювання). Реальні виклики API вимкнено.`
      : `Finmap: подія «${eventType}» не описана контрактом`,
    error: null,
  };
}
