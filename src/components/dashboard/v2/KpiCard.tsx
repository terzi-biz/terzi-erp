import type { ReactNode } from "react";
import { DeltaPill, Sparkline } from "./primitives";

export function KpiCard({ icon, title, sub, value, d, deltaSuffix, note, spark, sparkColor, bar, iconTint, onClick, muted }: {
  icon: ReactNode; title: string; sub?: string; value: string; d?: number | null; deltaSuffix?: string; note?: ReactNode;
  spark?: number[]; sparkColor?: string; bar: string; iconTint: string; onClick?: () => void; muted?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`tz-card relative flex min-w-0 flex-col overflow-hidden p-3.5 pt-4 text-left md:p-4 md:pt-5 ${onClick ? "transition-shadow hover:shadow-[0_6px_18px_-6px_rgb(11_27_58/0.18)]" : ""}`}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: bar }} aria-hidden />
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg md:h-9 md:w-9" style={{ background: iconTint, color: "#0B1B3A" }}>{icon}</span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold leading-tight text-foreground md:text-[14px]">{title}</div>
          {sub ? <div className="truncate text-[11.5px] text-muted-foreground">{sub}</div> : null}
        </div>
      </div>
      <div className={`tz-num mt-3 truncate ${muted ? "text-[15px] font-semibold text-muted-foreground" : "text-[24px] leading-none md:text-[30px]"}`}>{value}</div>
      <div className="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
        <DeltaPill d={d} suffix={deltaSuffix} />
        {note}
      </div>
      {spark ? <div className="mt-2 hidden md:block"><Sparkline values={spark} color={sparkColor} /></div> : null}
    </Tag>
  );
}
