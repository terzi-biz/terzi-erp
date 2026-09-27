import { Link } from "@tanstack/react-router";
import { Card } from "./primitives";
import { moneyShort, num, pct } from "./format";

export interface ManagerRow { id: string | null; name: string; value: number; contracts: number; plan: number | null }

const PALETTE = ["#E8ECF4", "#FBF3E0", "#E6F5EC", "#EFE9FB", "#FDECEC"];

function initials(name: string) {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
}

export function ManagersPlan({ rows, monthLabel }: { rows: ManagerRow[]; monthLabel: string }) {
  const maxV = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="flex flex-col p-4 md:p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="tz-h text-[17px]">Менеджери · план продажів</h2>
          <p className="text-[12.5px] text-muted-foreground">{monthLabel}</p>
        </div>
        <Link to="/settings/sales-plan" className="text-[12.5px] font-semibold text-[var(--color-primary)] hover:underline">План →</Link>
      </header>
      {!rows.length ? (
        <div className="mt-4 rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">Договорів менеджерів за місяць немає</div>
      ) : (
        <ul className="mt-3 space-y-3.5">
          {rows.slice(0, 6).map((r, i) => {
            const p = r.plan ? (r.value / r.plan) * 100 : null;
            const tone = p == null ? "draft" : p >= 100 ? "done" : p >= 90 ? "risk" : "overdue";
            const barColor = p == null ? "#8A93A6" : p >= 100 ? "var(--color-success)" : p >= 90 ? "var(--color-warning)" : "var(--color-destructive)";
            const w = p == null ? (r.value / maxV) * 100 : Math.min(100, p);
            return (
              <li key={r.id ?? `none-${i}`} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-[var(--color-primary)]" style={{ background: PALETTE[i % PALETTE.length] }}>{r.id ? initials(r.name) : "—"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{r.id ? r.name : "Без менеджера"}</span>
                    <span className={`tz-pill tz-pill--${tone}`}>{p == null ? "ціль не задана" : pct(p, 0)}</span>
                  </div>
                  <div className="truncate text-[11.5px] tabular-nums text-muted-foreground">
                    {moneyShort(r.value)}{r.plan ? ` / ${moneyShort(r.plan)}` : ""} · {num(r.contracts)} угод
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EEF1F6]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, w)}%`, background: barColor }} /></div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
