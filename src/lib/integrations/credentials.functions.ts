import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDENTIAL_NAMES, CREDENTIAL_PROVIDER } from "./credential-fields";

async function assertOwner(userId: string) {
  const { loadActor } = await import("@/lib/access.server");
  const actor = await loadActor(userId);
  if (!actor.isOwner) throw new Error("Ключі інтеграцій може змінювати лише власник/адміністратор");
}

/** Стан ключів без значень: задано / звідки / підказка з маскою. */
export const listCredentialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const { hydrateCredentials, credentialSource } = await import("./credentials.server");
    await hydrateCredentials(true);
    const { admin } = await import("@/lib/access.server");
    const { data } = await (await admin()).from("integration_credentials").select("name,hint,updated_at");
    const byName = new Map((data ?? []).map((r) => [r.name, r]));
    return [...CREDENTIAL_NAMES].map((name) => ({
      name,
      source: credentialSource(name),
      hint: byName.get(name)?.hint ?? null,
      updatedAt: byName.get(name)?.updated_at ?? null,
    }));
  });

export const saveCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string(), value: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!CREDENTIAL_NAMES.has(data.name)) throw new Error("Невідоме поле");
    await assertOwner(context.userId);
    const { encryptValue, hydrateCredentials } = await import("./credentials.server");
    const enc = await encryptValue(data.value);
    const hint = data.value.length <= 6 ? "***" : `${data.value.slice(0, 3)}***${data.value.slice(-3)}`;
    const { admin } = await import("@/lib/access.server");
    const db = await admin();
    const { error } = await db.from("integration_credentials").upsert({
      name: data.name, provider: CREDENTIAL_PROVIDER.get(data.name) ?? "other",
      ...enc, hint, updated_by: context.userId, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Не вдалося зберегти ключ");
    await db.from("audit_logs").insert({ actor_id: context.userId, action: "integration_credential_saved", entity: "integration_credentials", entity_id: data.name } as never);
    await hydrateCredentials(true);
    return { ok: true };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!CREDENTIAL_NAMES.has(data.name)) throw new Error("Невідоме поле");
    await assertOwner(context.userId);
    const { admin } = await import("@/lib/access.server");
    const db = await admin();
    await db.from("integration_credentials").delete().eq("name", data.name);
    await db.from("audit_logs").insert({ actor_id: context.userId, action: "integration_credential_deleted", entity: "integration_credentials", entity_id: data.name } as never);
    const { hydrateCredentials } = await import("./credentials.server");
    await hydrateCredentials(true);
    return { ok: true };
  });
