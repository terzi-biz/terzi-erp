/**
 * Спільний список дзвінків із програвачем запису.
 * Використовується в картці клієнта, замовлення і заміру.
 * Тільки презентація: дані — listEntityCalls, запис — getCallRecording (тимчасове посилання).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone, PhoneMissed, Play } from "lucide-react";
import { listEntityCalls } from "@/lib/calls.functions";
import { getCallRecording } from "@/lib/crm.functions";

const fmtDT = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("uk-UA", {
        timeZone: "Europe/Kyiv",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Row({ call }: { call: any }) {
  const recFn = useServerFn(getCallRecording);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const r: any = await recFn({ data: { call_id: call.id } });
      if (r?.url) setUrl(r.url);
      else setMsg(r?.reason ?? "Запис недоступний");
    } catch (e: any) {
      setMsg(e?.message ?? "Запис недоступний");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border border-border bg-secondary/30 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold inline-flex items-center gap-2">
          {call.is_missed ? (
            <PhoneMissed className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-primary" />
          )}
          {call.direction === "inbound" ? "Вхідний" : "Вихідний"} · {call.counterparty ?? "—"}
          {call.employee_name && <span className="text-muted-foreground">· {call.employee_name}</span>}
        </span>
        <span className="text-muted-foreground">
          {fmtDT(call.started_at)} · {fmtDur(Number(call.duration_sec ?? 0))}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {url ? (
          <audio controls preload="none" src={url} className="w-full h-8" />
        ) : (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 font-semibold disabled:opacity-60"
          >
            <Play className="w-3 h-3" /> {loading ? "Завантаження…" : "Прослухати запис"}
          </button>
        )}
        {msg && <span className="text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

export function CallsPlayerList({
  clientId,
  orderId,
  measurementId,
  title = "Дзвінки",
  limit = 20,
}: {
  clientId?: string | null;
  orderId?: string | null;
  measurementId?: string | null;
  title?: string;
  limit?: number;
}) {
  const fn = useServerFn(listEntityCalls);
  const key = measurementId ? ["m", measurementId] : orderId ? ["o", orderId] : ["c", clientId];
  const q = useQuery({
    queryKey: ["entity-calls", ...key, limit],
    queryFn: () => fn({ data: { clientId, orderId, measurementId, limit } }) as any,
    enabled: Boolean(clientId || orderId || measurementId),
  });

  const rows = (q.data ?? []) as any[];

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {q.isLoading && <div className="text-xs text-muted-foreground">Завантаження…</div>}
      {!q.isLoading && !rows.length && <div className="text-xs text-muted-foreground">Дзвінків ще немає.</div>}
      {rows.map((c) => (
        <Row key={c.id} call={c} />
      ))}
    </div>
  );
}
