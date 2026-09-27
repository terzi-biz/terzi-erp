import { Filter, XCircle } from "lucide-react";
import { cabinetMeta, CABINET_KEYS, stageConversion, type CabinetKey } from "@/lib/marketing/cabinets";
import { CabinetGlyph } from "@/components/dashboard/v2/CabinetGlyph";
import { num, pct } from "@/components/dashboard/v2/format";

export interface LeadsFunnelData {
  stages: Array<{ key: string; label: string; n: number }>;
  lost: number;
  junk: number;
  lostReasons: Array<{ label: string; n: number }>;
  bySource: Record<CabinetKey, number>;
  cabinet: CabinetKey | null;
}

const WIDTHS = [100, 93, 86, 79, 72, 65];
const SHADES = ["#3F6BD8", "#2F57B8", "#244699", "#1B377C", "#132A60"];

/** Права картка «Воронка CRM»: реальні етапи з конверсіями, програні та ліди за джерелами. */
export function LeadsFunnelCard({ data, periodLabel, loading, compact = false }: {
  data: LeadsFunnelData | null | undefined; periodLabel: string; loading?: boolean; compact?: boolean;
}) {
  if (loading || !data) return <div className="tz-card h-[560px] animate-pulse bg-muted/50" aria-busy />;
  const first = data.stages[0]?.n ?? 0;
  const won = data.stages[data.stages.length - 1]?.n ?? 0;
  const conv = stageConversion(first, won);
  const lostPct = first ? (data.lost / first) * 100 : null;
  const srcMax = Math.max(1, ...CABINET_KEYS.map((k) => data.bySource[k] ?? 0));
  return (
    <section className="tz-card p-4" aria-label="Воронка CRM">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-gold-soft)] text-[var(--color-primary)]"><Filter className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
          <h2 className="tz-h text-[16px] leading-tight">Воронка CRM</h2>
          <p className="truncate text-[12px] text-muted-foreground">{periodLabel} · {data.cabinet ? cabinetMeta(data.cabinet).label : "всі джерела"}</p>
        </div>
      </header>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F4F6FA] px-3 py-2 text-[12.5px]">
        <span className="text-muted-foreground">Конверсія лід → угода</span>
        <span className={`tz-pill ${conv == null ? "tz-pill--draft" : "tz-pill--done"}`}>{conv == null ? "—" : pct(conv, 1)}</span>
      </div>

      <ol className="mt-3 flex flex-col items-center">
        {data.stages.map((s, i) => {
          const last = i === data.stages.length - 1;
          const c = i > 0 ? stageConversion(data.stages[i - 1].n, s.n) : null;
          return (
            <li key={s.key} className="flex w-full flex-col items-center">
              {i > 0 ? <div className="py-[3px] text-[11px] tabular-nums leading-none text-muted-foreground">↓ {c == null ? "—" : pct(c, 0)}</div> : null}
              <div
                className={`flex h-8 items-center justify-between gap-2 px-3 text-[12.5px] ${last ? "text-[#0B1B3A]" : "text-white"}`}
                style={{
                  width: `${WIDTHS[i] ?? 50}%`,
                  background: last ? "linear-gradient(90deg,#D4960A,#E0A21A)" : SHADES[i] ?? SHADES[SHADES.length - 1],
                  clipPath: "polygon(0 0, 100% 0, calc(100% - 7px) 100%, 7px 100%)",
                }}
              >
                <span className={`truncate ${last ? "font-bold" : "font-medium"}`}>{s.label}</span>
                <span className="font-bold tabular-nums">{num(s.n)}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg bg-[var(--status-overdue-soft)] px-3 py-2.5 text-[12px] text-[var(--status-overdue-ink)]">
        <div className="flex items-center justify-between gap-2 font-semibold">
          <span className="inline-flex items-center gap-1.5"><XCircle className="h-4 w-4" />Програно</span>
          <span className="tabular-nums">{num(data.lost)}{lostPct != null ? ` · ${pct(lostPct, 0)}` : ""}</span>
        </div>
        {data.lostReasons.length ? (
          <div className="mt-1 text-[11.5px] opacity-90">{data.lostReasons.slice(0, compact ? 3 : 4).map((r) => `${r.label.toLowerCase()} ${r.n}`).join(" · ")}</div>
        ) : null}
        {data.junk ? <div className="mt-1 text-[11px] opacity-75">з них нецільові (спам/дубль/тест): {num(data.junk)}</div> : null}
      </div>

      {!compact ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-bold">Ліди за джерелами</h3>
          <ul className="mt-2 space-y-2">
            {CABINET_KEYS.map((k) => {
              const n = data.bySource[k] ?? 0;
              const m = cabinetMeta(k);
              return (
                <li key={k} className="grid grid-cols-[minmax(0,108px)_1fr_auto] items-center gap-2 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-1.5"><CabinetGlyph k={k} size={16} /><span className="truncate">{m.label}</span></span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[#EEF1F6]"><span className="block h-full rounded-full" style={{ width: `${(n / srcMax) * 100}%`, background: m.bar }} /></span>
                  <span className="w-8 text-right font-semibold tabular-nums">{num(n)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">Ліди, створені за період; етапи накопичувальні (замір, КП, угода — за записами замірів/кошторисів/замовлень і поточним етапом).</p>
    </section>
  );
}
