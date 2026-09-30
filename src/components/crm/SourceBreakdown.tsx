/** Показники заявок за джерелами і за відповідальними (з урахуванням поточних фільтрів сторінки). */
import { useMemo, useState } from "react";
import { resolveChannel } from "@/lib/marketing/channels";

export const channelLabel = (raw: unknown) => resolveChannel({ source: raw })?.label ?? (String(raw ?? "").trim() || "Не вказано");

export type BreakdownRow = { source: unknown; person: string | null; won?: boolean; lost?: boolean; value?: number };

export function SourceBreakdown({ rows, personLabel, title }: { rows: BreakdownRow[]; personLabel: string; title: string }) {
  const [by, setBy] = useState<"source" | "person">("source");
  const groups = useMemo(() => {
    const m = new Map<string, { k: string; total: number; won: number; lost: number; value: number }>();
    for (const r of rows) {
      const k = by === "source" ? channelLabel(r.source) : (r.person || "Не призначено");
      const e = m.get(k) ?? { k, total: 0, won: 0, lost: 0, value: 0 };
      e.total++; if (r.won) e.won++; if (r.lost) e.lost++; e.value += Number(r.value || 0);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows, by]);
  const max = groups[0]?.total || 1;

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title} · {rows.length}</div>
        <div className="flex gap-1">
          {([["source", "За джерелами"], ["person", personLabel]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setBy(k)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${by === k ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{l}</button>
          ))}
        </div>
      </div>
      {groups.length ? (
        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.k} className="grid grid-cols-[minmax(90px,1fr)_2fr_auto] items-center gap-2 text-xs">
              <span className="truncate font-medium">{g.k}</span>
              <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(g.total / max) * 100}%` }} /></div>
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                <b className="text-foreground">{g.total}</b> · угод {g.won} ({g.total ? Math.round((g.won / g.total) * 100) : 0}%){g.lost ? ` · втрачено ${g.lost}` : ""}
                {g.value ? ` · ${Math.round(g.value).toLocaleString("uk-UA")} ₴` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : <div className="text-xs text-muted-foreground">Немає даних за фільтром</div>}
    </div>
  );
}
