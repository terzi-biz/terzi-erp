import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Copy, Loader2, ShieldCheck } from "lucide-react";
import { getKeyCrmOneWayStatus, setKeyCrmOneWay } from "@/lib/integrations.functions";

function fmt(d?: string | null) {
  if (!d) return "ще не надходили";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/** Односторонній режим keyCRM → ERP через вебхуки (без зворотного запису). */
export function OneWayPanel({ integrationId }: { integrationId: string }) {
  const qc = useQueryClient();
  const fnStatus = useServerFn(getKeyCrmOneWayStatus);
  const fnSet = useServerFn(setKeyCrmOneWay);
  const [showToken, setShowToken] = useState(false);

  const status = useQuery({
    queryKey: ["int-oneway", integrationId],
    queryFn: () => fnStatus({ data: { integrationId } }),
    enabled: !!integrationId,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => fnSet({ data: { integrationId, enabled } }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? "Односторонній режим keyCRM → ERP увімкнено" : "Односторонній режим вимкнено");
      qc.invalidateQueries({ queryKey: ["int-oneway", integrationId] });
      qc.invalidateQueries({ queryKey: ["int-sync", integrationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const s = status.data as any;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = s?.webhook ? `${origin}/api/public/integrations/webhook/${s.webhook.slug}` : null;
  const token = s?.webhook?.token as string | null;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success("Скопійовано");
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-primary" /> Односторонній режим: keyCRM → ERP
        </div>
        <button
          disabled={toggle.isPending || status.isLoading}
          onClick={() => toggle.mutate(!s?.one_way)}
          className={`px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50 flex items-center gap-2 ${
            s?.one_way ? "bg-secondary hover:bg-accent" : "bg-primary text-primary-foreground"
          }`}
        >
          {toggle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {s?.one_way ? "Вимкнути односторонній режим" : "Увімкнути односторонній режим"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Усі сутності переводяться в режим «keyCRM — головна», зворотний запис в keyCRM блокується.
        Зміни в keyCRM надходять у ERP автоматично вебхуками, довідники доопитуються за розкладом.
      </p>

      {status.isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження…</div>
      )}

      {s && (
        <div className="space-y-2 text-sm">
          <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${s.one_way ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {s.one_way ? "Увімкнено · зворотний запис заблоковано" : "Вимкнено"}
          </div>
          {!s.one_way && s.outbound_entities?.length > 0 && (
            <div className="text-xs text-destructive">
              Зараз пишуть у keyCRM: {s.outbound_entities.join(", ")}
            </div>
          )}

          {url && (
            <div className="space-y-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">URL вебхука для keyCRM</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all bg-secondary rounded px-2 py-1 text-xs">{url}</code>
                  <button onClick={() => copy(url)} className="p-1.5 rounded hover:bg-accent"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Секретний токен (заголовок x-endpoint-token або ?token=)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all bg-secondary rounded px-2 py-1 text-xs">
                    {token ? (showToken ? token : `${token.slice(0, 6)}••••••${token.slice(-4)}`) : "—"}
                  </code>
                  <button onClick={() => setShowToken((v) => !v)} className="px-2 py-1 rounded text-xs hover:bg-accent">
                    {showToken ? "Сховати" : "Показати"}
                  </button>
                  {token && <button onClick={() => copy(`${url}?token=${token}`)} className="p-1.5 rounded hover:bg-accent"><Copy className="w-4 h-4" /></button>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Події keyCRM: {(s.webhook.events ?? []).join(", ")} · останній виклик: {fmt(s.webhook.last_call_at)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
