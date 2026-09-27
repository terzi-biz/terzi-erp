/**
 * Авторизація cron/worker-ендпоінтів: ЛИШЕ заголовок x-terzi-worker-secret.
 * Секрет береться з env INTEGRATIONS_WORKER_SECRET або з private.cron_worker_secret
 * (через rpc verify_cron_worker_secret). Публічний publishable/anon ключ
 * (заголовок apikey) як авторизація НЕ приймається.
 */
export async function authorizeWorkerRequest(request: Request, endpoint: string): Promise<boolean> {
  try {
    const provided = request.headers.get("x-terzi-worker-secret") ?? "";
    if (!provided) {
      console.warn(
        `[worker-auth] rejected ${endpoint}: missing x-terzi-worker-secret${
          request.headers.get("apikey") ? " (legacy apikey-only auth is no longer accepted)" : ""
        }`,
      );
      return false;
    }

    const { default: process } = await import("node:process");

    // (a) сталий час: SHA-256 обох рядків, XOR по 32 байтах, без раннього виходу.
    const envSecret = process.env.INTEGRATIONS_WORKER_SECRET ?? "";
    if (envSecret) {
      const encoder = new TextEncoder();
      const [providedBuf, envBuf] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(provided)),
        crypto.subtle.digest("SHA-256", encoder.encode(envSecret)),
      ]);
      const a = new Uint8Array(providedBuf);
      const b = new Uint8Array(envBuf);
      let diff = 0;
      for (let i = 0; i < 32; i++) diff |= a[i] ^ b[i];
      if (diff === 0) return true;
    }

    // (b) секрет з private.cron_worker_secret (SECURITY DEFINER rpc).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("verify_cron_worker_secret", { p_secret: provided });
    if (!error && data === true) return true;

    console.warn(`[worker-auth] rejected ${endpoint}: invalid secret`);
    return false;
  } catch (e) {
    console.warn(`[worker-auth] rejected ${endpoint}: ${e instanceof Error ? e.message : "auth failed"}`);
    return false;
  }
}

export function workerUnauthorized() {
  return Response.json({ ok: false, error: "worker_secret_required" }, { status: 401 });
}
