import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2, Plug, PlugZap, RefreshCw } from "lucide-react";
import {
  disconnectExternal, listExternalConnections, startExternalOAuth, testExternalConnection,
} from "@/lib/integrations/external.functions";
import { EXTERNAL_STATUS_LABEL } from "@/lib/integrations/external/registry";

const GROUP_LABEL: Record<string, string> = {
  ads: "Реклама",
  analytics: "Аналітика",
  workspace: "Робочі сервіси",
  marketplace: "Майданчики",
  messenger: "Месенджери",
};

const TONE: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-800",
  oauth_connected: "bg-amber-100 text-amber-900",
  authorization_required: "bg-amber-100 text-amber-900",
  not_configured: "bg-muted text-muted-foreground",
  token_expired: "bg-orange-100 text-orange-900",
  permission_error: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/** Зовнішні підключення: авторизація, реальний тест API і стан без жодних токенів у клієнті. */
export function ExternalConnectionsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listExternalConnections);
  const start = useServerFn(startExternalOAuth);
  const test = useServerFn(testExternalConnection);
  const off = useServerFn(disconnectExternal);

  const items = useQuery({ queryKey: ["external-connections"], queryFn: () => list() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["external-connections"] });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const connect = useMutation({
    mutationFn: (provider: string) => start({ data: { provider, origin } }),
    onSuccess: (res: any) => { window.location.href = res.url; },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });
  const runTest = useMutation({
    mutationFn: (provider: string) => test({ data: { provider, origin } }),
    onSuccess: (res: any) => { res.ok ? toast.success(res.message) : toast.error(res.message); invalidate(); },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });
  const disconnect = useMutation({
    mutationFn: (provider: string) => off({ data: { provider } }),
    onSuccess: () => { toast.success("Підключення відключено"); invalidate(); },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  if (items.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження…</div>;
  }
  if (items.error) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">Не вдалося завантажити підключення: {String((items.error as any)?.message ?? items.error)}</div>;
  }

  const rows = (items.data ?? []) as any[];
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Статус «Підключено» виставляється лише після фактично успішної відповіді API провайдера. Ключі зберігаються тільки на сервері.
      </p>
      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g] ?? g}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.filter((r) => r.group === g).map((r) => (
              <article key={r.provider} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.accountLabel ?? "Обліковий запис не визначено"}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONE[r.status] ?? TONE.error}`}>
                    {EXTERNAL_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>

                <dl className="text-[11px] text-muted-foreground space-y-1">
                  <div className="flex justify-between gap-2"><dt>Останній успіх</dt><dd>{fmt(r.lastSuccessAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Останній тест</dt><dd>{fmt(r.lastTestAt)}</dd></div>
                  {r.tokenExpiresAt && <div className="flex justify-between gap-2"><dt>Термін токена</dt><dd>{fmt(r.tokenExpiresAt)}</dd></div>}
                  {r.webhookPath && <div className="break-all"><dt className="inline">Вебхук: </dt><dd className="inline">{origin}{r.webhookPath}</dd></div>}
                </dl>

                {r.missingEnv.length > 0 && (
                  <div className="text-[11px] rounded-md bg-muted px-2 py-1.5">
                    Потрібні ключі: <span className="font-mono">{r.missingEnv.join(", ")}</span>
                  </div>
                )}
                {r.optionalMissingEnv.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">Необов'язково: <span className="font-mono">{r.optionalMissingEnv.join(", ")}</span></div>
                )}
                {r.lastError && <div className="text-[11px] text-destructive break-words">{r.lastError}</div>}
                <p className="text-[11px] text-muted-foreground">{r.note}</p>

                <div className="flex flex-wrap gap-2">
                  {r.auth !== "token" && (
                    <button
                      onClick={() => connect.mutate(r.provider)}
                      disabled={r.missingEnv.length > 0 || connect.isPending}
                      className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Plug className="w-3.5 h-3.5" /> {r.status === "not_configured" ? "Підключити" : "Переавторизувати"}
                    </button>
                  )}
                  <button
                    onClick={() => runTest.mutate(r.provider)}
                    disabled={runTest.isPending}
                    className="px-3 py-1.5 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Перевірити
                  </button>
                  {(r.status === "connected" || r.status === "oauth_connected") && (
                    <button
                      onClick={() => disconnect.mutate(r.provider)}
                      className="px-3 py-1.5 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <PlugZap className="w-3.5 h-3.5" /> Відключити
                    </button>
                  )}
                  <a
                    href={r.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Де взяти ключі
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
