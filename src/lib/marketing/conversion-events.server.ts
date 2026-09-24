/**
 * W2.1 — канонічна емісія подій конверсій у ІСНУЮЧИЙ Integration Core (`integration_events`).
 * Жодних мережевих викликів Google/Meta: тільки dry-run драфти, одразу позначені done.
 * Без увімкненого рядка провайдера в `integrations` → not_configured (нічого не пишеться).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildConversionDraft, type ConversionKind, type ConversionProvider,
} from "@/lib/integrations/conversions";

type Db = SupabaseClient<any, any, any>;
const PROVIDERS: ConversionProvider[] = ["google_ads", "meta_ads"];
export type SendMode = "off" | "dry_run";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export type EmitInput = {
  kind: ConversionKind;
  leadId: string;
  sourceType: string;
  sourceId: string;
  occurredAt?: string;
  paymentAmount?: number | null;
  currency?: string | null;
};

export type EmitDeps = {
  enqueue: (i: {
    integrationId: string; providerKey: string; direction: "outbound"; eventType: string;
    payload: Record<string, unknown>; idempotencyKey: string; entityType: string; entityId: string; providerEventId: string;
  }) => Promise<{ id: string | null; duplicate: boolean }>;
  complete: (id: string | null, result: unknown) => Promise<void>;
};

async function defaultDeps(): Promise<EmitDeps> {
  const core = await import("@/lib/integrations/core.server");
  return { enqueue: core.enqueueEvent as never, complete: core.completeEvent };
}

/** W2.1: будь-яке значення, крім "off", трактується як dry_run. Live-режиму немає. */
export function resolveSendMode(config: unknown): SendMode {
  return (config as any)?.send_mode === "off" ? "off" : "dry_run";
}

export type LeadAttribution = {
  click: { gclid: string | null; gbraid: string | null; wbraid: string | null; fbclid: string | null };
  metaLeadId: string | null;
  phoneE164: string | null;
  email: string | null;
  adUserDataConsent: boolean;
  origin: "website" | "crm";
};

export async function loadLeadAttribution(db: Db, leadId: string): Promise<LeadAttribution | null> {
  const { data: lead } = await db.from("crm_leads")
    .select("id, external_id, external_source, phone_e164, utm, contact_id").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const { data: tps } = await db.from("marketing_touchpoints")
    .select("gclid, gbraid, wbraid, fbclid, is_first_touch, occurred_at")
    .eq("crm_lead_id", leadId).order("occurred_at", { ascending: true }).limit(20);
  const utm = ((lead as any).utm ?? {}) as Record<string, unknown>;
  const pick = (k: string) => {
    for (const t of (tps ?? []) as any[]) if (t?.[k]) return String(t[k]);
    const v = String(utm[k] ?? "").trim();
    return v || null;
  };
  const ext = String((lead as any).external_id ?? "");
  let email: string | null = null;
  if ((lead as any).contact_id) {
    const { data: c } = await db.from("crm_contacts").select("email").eq("id", (lead as any).contact_id).maybeSingle();
    email = (c as any)?.email ?? null;
  }
  return {
    click: { gclid: pick("gclid"), gbraid: pick("gbraid"), wbraid: pick("wbraid"), fbclid: pick("fbclid") },
    metaLeadId: ext.startsWith("meta_lead:") ? ext.slice("meta_lead:".length) : null,
    phoneE164: (lead as any).phone_e164 ?? null,
    email,
    // Згода лише явна (записана з форми/CMP). Зараз такого запису немає → false.
    adUserDataConsent: utm.ad_user_data_consent === "granted",
    origin: utm.landing_url ? "website" : "crm",
  };
}

export type EmitResult = {
  status: "not_configured" | "processed" | "no_lead";
  providers: { provider: ConversionProvider; outcome: "off" | "blocked" | "queued_dry_run" | "duplicate"; reason?: string | null }[];
};

export async function emitConversionEvent(db: Db, input: EmitInput, deps?: EmitDeps): Promise<EmitResult> {
  const { data: rows } = await db.from("integrations")
    .select("id, provider_key, enabled, config").in("provider_key", PROVIDERS).eq("enabled", true);
  const configs = (rows ?? []) as { id: string; provider_key: ConversionProvider; config: unknown }[];
  if (!configs.length) return { status: "not_configured", providers: [] };

  const attr = await loadLeadAttribution(db, input.leadId);
  if (!attr) return { status: "no_lead", providers: [] };
  const d = deps ?? (await defaultDeps());
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const out: EmitResult["providers"] = [];

  for (const cfg of configs) {
    if (resolveSendMode(cfg.config) === "off") { out.push({ provider: cfg.provider_key, outcome: "off" }); continue; }
    const draft = buildConversionDraft({
      provider: cfg.provider_key, kind: input.kind, sourceType: input.sourceType, sourceId: input.sourceId,
      occurredAt, click: attr.click, adUserDataConsent: attr.adUserDataConsent,
      phoneE164: attr.phoneE164, email: attr.email, metaLeadId: attr.metaLeadId,
      paymentAmount: input.paymentAmount, currency: input.currency, origin: attr.origin, sha256,
    });
    const res = await d.enqueue({
      integrationId: cfg.id, providerKey: cfg.provider_key, direction: "outbound",
      eventType: `conversion.${input.kind}`, idempotencyKey: draft.key, providerEventId: draft.key,
      entityType: input.sourceType, entityId: input.sourceId,
      payload: { send_mode: "dry_run", lead_id: input.leadId, ready: draft.ready, blocked: draft.blocked, draft: draft.payload },
    });
    if (res.duplicate) { out.push({ provider: cfg.provider_key, outcome: "duplicate" }); continue; }
    // Dry-run: подію одразу закриваємо, щоб воркер її не обробляв і нічого не надсилав.
    await d.complete(res.id, { dry_run: true, ready: draft.ready, blocked: draft.blocked });
    out.push({ provider: cfg.provider_key, outcome: draft.ready ? "queued_dry_run" : "blocked", reason: draft.blocked });
  }
  return { status: "processed", providers: out };
}

/** Best-effort обгортка: помилка емісії НІКОЛИ не ламає основну дію CRM. */
export async function safeEmitConversion(input: EmitInput, run?: (i: EmitInput) => Promise<unknown>): Promise<void> {
  try {
    if (run) { await run(input); return; }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await emitConversionEvent(supabaseAdmin as never, input);
  } catch (e) {
    console.error("conversion emit failed", { kind: input.kind, sourceType: input.sourceType, sourceId: input.sourceId, error: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

/** Read-only dry-run сканування історичних кандидатів (без записів). */
export async function scanConversionCandidates(db: Db, opts: { from?: string; to?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 5000, 20000);
  let tq = db.from("marketing_touchpoints")
    .select("crm_lead_id, gclid, gbraid, wbraid, fbclid, occurred_at")
    .not("crm_lead_id", "is", null)
    .or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,fbclid.not.is.null")
    .limit(limit);
  if (opts.from) tq = tq.gte("occurred_at", opts.from);
  if (opts.to) tq = tq.lte("occurred_at", opts.to);
  const { data: tps } = await tq;
  const { data: metaLeads } = await db.from("crm_leads").select("id, created_at").like("external_id", "meta_lead:%").limit(limit);
  return classifyCandidates((tps ?? []) as any[], (metaLeads ?? []) as any[]);
}

export function classifyCandidates(
  touchpoints: { crm_lead_id: string; gclid?: string | null; gbraid?: string | null; wbraid?: string | null; fbclid?: string | null }[],
  metaLeads: { id: string }[],
) {
  const google = new Set<string>(); const meta = new Set<string>(); let rejected = 0;
  for (const t of touchpoints) {
    const g = !!(t.gclid || t.gbraid || t.wbraid); const f = !!t.fbclid;
    if (!g && !f) { rejected += 1; continue; }
    if (g) google.add(t.crm_lead_id);
    if (f) meta.add(t.crm_lead_id);
  }
  for (const l of metaLeads) meta.add(l.id);
  return { dryRun: true as const, googleCandidates: google.size, metaCandidates: meta.size, rejectedNoIdentity: rejected };
}
