import { cn } from "@/lib/utils";

export type JournalRow = {
  id: string;
  rule_id: string | null;
  entity_type: string;
  entity_id: string;
  action_type: string;
  action_payload: Record<string, unknown> | null;
  plan_at: string | null;
  fact_at: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

const STATUS_CLS: Record<string, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  done: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = { rows: JournalRow[]; loading?: boolean };

export function JournalPanel({ rows, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Завантаження журналу…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Час</th>
            <th className="px-3 py-2 font-semibold">Сутність</th>
            <th className="px-3 py-2 font-semibold">Дія</th>
            <th className="px-3 py-2 font-semibold">План</th>
            <th className="px-3 py-2 font-semibold">Факт</th>
            <th className="px-3 py-2 font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                Журнал порожній — після підключення runner з’являться записи.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">{fmt(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-[11px]">
                  {r.entity_type}
                  <div className="truncate text-muted-foreground" title={r.entity_id}>
                    {r.entity_id.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-semibold">{r.action_type}</div>
                  {r.error ? <div className="mt-0.5 text-destructive">{r.error}</div> : null}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">{fmt(r.plan_at)}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{fmt(r.fact_at)}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      STATUS_CLS[r.status] ?? STATUS_CLS.pending,
                    )}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
