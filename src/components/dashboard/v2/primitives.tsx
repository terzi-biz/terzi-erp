import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { pct } from "./format";

/** Дельта-пілюля: ▲ зелена / ▼ червона. Для «менше = краще» передайте invert. */
export function DeltaPill({ d, invert = false, suffix }: { d: number | null | undefined; invert?: boolean; suffix?: string }) {
  if (d == null || !Number.isFinite(d)) return null;
  const good = invert ? d <= 0 : d >= 0;
  const Icon = d >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`tz-pill ${good ? "tz-pill--done" : "tz-pill--overdue"}`}>
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {pct(Math.abs(d))}
      {suffix ? <span className="font-medium opacity-80">{suffix}</span> : null}
    </span>
  );
}

/** Міні-графік (спарклайн) з реальних значень; &lt;2 точок — нічого не малюємо. */
export function Sparkline({ values, color = "var(--color-primary)", target, height = 36, fill = true }: {
  values: number[]; color?: string; target?: number | null; height?: number; fill?: boolean;
}) {
  if (values.length < 2) return <div style={{ height }} className="flex items-end text-[11px] text-muted-foreground">недостатньо точок для графіка</div>;
  const w = 160;
  const h = height;
  const max = Math.max(...values, target ?? 0) || 1;
  const min = Math.min(0, ...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const id = `sg${Math.abs(values.reduce((s, v, i) => s + v * (i + 1), 0)).toString(36).slice(0, 6)}${values.length}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".18" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
        </>
      ) : null}
      {target != null && target > 0 ? (
        <line x1="0" x2={w} y1={y(target)} y2={y(target)} stroke="var(--color-gold)" strokeDasharray="3 3" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      ) : null}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

export function Card({ children, className = "", as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={`tz-card ${className}`}>{children}</As>;
}

export function CardHead({ icon, title, sub, action }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-gold-soft)] text-[var(--color-primary)]">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="tz-h text-[17px] leading-tight md:text-[18px]">{title}</h2>
          {sub ? <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md", ariaLabel }: {
  value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; size?: "sm" | "md"; ariaLabel?: string;
}) {
  return (
    <div className="tz-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} data-on={value === o.key}
          onClick={() => onChange(o.key)} className={size === "sm" ? "!px-2.5 !py-1 !text-[12px]" : ""}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Muted = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`text-muted-foreground ${className}`}>{children}</span>
);
