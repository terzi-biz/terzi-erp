import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { moneyShort, num, pct } from "./format";

export interface HeroData {
  monthLabel: string;
  contractValue: number | null;
  plan: number | null;
  contracts: number | null;
  avgCheck: number | null;
  romi: number | null;
  prevContracts: number | null;
  prevAvgCheck: number | null;
  /** Підпис порівняння, напр. «до 04.08–31.08» (попередній період тієї ж довжини). */
  prevLabel: string;
  daysLeft: number;
  /** Сума активних замовлень місяця (усі, крім відмов) за датою замовлення. */
  ordersValue?: number | null;
  ordersActive?: number | null;
  ordersBySource?: Split[];
  ordersByManager?: Split[];
}

export interface Split { label: string; value: number; count: number }

function SplitList({ title, rows, total }: { title: string; rows: Split[]; total: number | null }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">{title}</div>
      {rows.length === 0 ? <div className="text-[12px] text-white/50">немає даних</div> : (
        <ul className="space-y-1">
          {rows.slice(0, 6).map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="truncate text-white/85">{r.label}</span>
              <span className="shrink-0 tz-num text-white">{moneyShort(r.value)}<span className="ml-1 text-white/50">· {num(r.count)}{total ? ` · ${pct((r.value / total) * 100, 0)}` : ""}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Delta({ cur, prev, label, abs = false }: { cur: number | null; prev: number | null; label: string; abs?: boolean }) {
  if (cur == null || prev == null) return null;
  const diff = abs ? cur - prev : prev === 0 ? null : ((cur - prev) / prev) * 100;
  if (diff == null) return null;
  const up = diff >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`mt-1 inline-flex items-center gap-0.5 text-[12px] font-semibold ${up ? "text-[#5EDB9A]" : "text-[#FF8A80]"}`}>
      <Icon className="h-3.5 w-3.5" />{abs ? num(Math.abs(diff)) : pct(Math.abs(diff))} {label}
    </span>
  );
}

/** Верхня navy-смуга: сума договорів місяця vs план + ключові показники. */
export function HeroStrip({ d }: { d: HeroData }) {
  const progress = d.plan && d.contractValue != null ? (d.contractValue / d.plan) * 100 : null;
  const need = d.plan && d.contractValue != null ? Math.max(0, d.plan - d.contractValue) : null;
  return (
    <section
      className="relative -mx-3 -mt-3 overflow-hidden rounded-b-2xl px-4 pb-4 pt-4 text-white md:mx-0 md:mt-0 md:rounded-xl md:px-6 md:py-5"
      style={{ background: "linear-gradient(120deg, #0B1B3A 0%, #10275A 70%, #173370 100%)" }}
      aria-label="Підсумок місяця"
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.04]" />
      <span aria-hidden className="pointer-events-none absolute right-40 top-16 h-56 w-56 rounded-full bg-white/[0.03]" />
      <div className="relative grid gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">Сума договорів · {d.monthLabel}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="tz-num text-[30px] leading-tight md:text-[40px]">{d.contractValue == null ? "немає даних" : moneyShort(d.contractValue)}</span>
            <span className="text-[13px] text-white/60">{d.plan ? `з ${moneyShort(d.plan)} плану` : "план місяця не задано"}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.12]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress == null ? undefined : Math.round(progress)}>
            {progress != null ? <div className="h-full rounded-full" style={{ width: `${Math.min(100, progress)}%`, background: "linear-gradient(90deg,#D4960A,#E0A21A)" }} /> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[12px]">
            <span className="font-semibold text-[var(--color-gold-2)]">{progress == null ? "—" : `${pct(progress, 0)} плану`}</span>
            <span className="text-white/60">
              до кінця місяця {d.daysLeft} дн{need != null ? (need > 0 ? ` · потрібно ще ${moneyShort(need)}` : " · план виконано") : ""}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <div className="min-w-0">
            <div className="truncate text-[11.5px] text-white/60">Угод закрито</div>
            <div className="tz-num mt-1 text-[20px] md:text-[26px]">{d.contracts == null ? "—" : num(d.contracts)}</div>
            <span className="hidden md:inline"><Delta cur={d.contracts} prev={d.prevContracts} label={d.prevLabel} abs /></span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11.5px] text-white/60">Середній чек</div>
            <div className="tz-num mt-1 truncate text-[20px] md:text-[26px]">{d.avgCheck == null ? "—" : moneyShort(d.avgCheck)}</div>
            <span className="hidden md:inline"><Delta cur={d.avgCheck} prev={d.prevAvgCheck} label={d.prevLabel} /></span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11.5px] text-white/60">ROMI маркетингу</div>
            <div className="tz-num mt-1 text-[20px] md:text-[26px]">{d.romi == null ? "—" : pct(d.romi, 0)}</div>
            <div className="mt-1 hidden text-[12px] text-[var(--color-gold-2)] md:block">за сумою договорів</div>
          </div>
        </div>
      </div>
      {d.ordersValue !== undefined ? (
        <div className="relative mt-4 grid gap-4 border-t border-white/10 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">Активні замовлення · {d.monthLabel}</div>
            <div className="tz-num mt-1 text-[26px] leading-tight md:text-[32px]">{d.ordersValue == null ? "немає даних" : moneyShort(d.ordersValue)}</div>
            <div className="mt-1 text-[12px] text-white/60">{d.ordersActive == null ? "" : `${num(d.ordersActive)} замовлень, крім відмов · за датою замовлення`}</div>
          </div>
          <SplitList title="По каналах" rows={d.ordersBySource ?? []} total={d.ordersValue ?? null} />
          <SplitList title="По менеджерах" rows={d.ordersByManager ?? []} total={d.ordersValue ?? null} />
        </div>
      ) : null}
    </section>
  );
}
