import { Info } from "lucide-react";
import { NumberInput } from "@/components/NumberInput";

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded ${highlight ? "bg-primary/10" : "bg-secondary/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

const nf = (n: number, d = 0) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number.isFinite(n) ? n : 0,
  );

export interface TargetMarginPanelProps {
  value: number;
  onChange: (v: number) => void;
  totalClient: number;
  pricePerM2: number;
  grossProfit: number;
  marginPercent: number;
  totalCost?: number;
  showInternal?: boolean;
  perUnitLabel?: string;
  className?: string;
}

/**
 * Єдиний блок регулювання цільової маржі для всіх калькуляторів напрямків.
 * Ціна = Собівартість / (1 − маржа/100); різниця розподіляється переважно на роботи.
 */
export function TargetMarginPanel({
  value,
  onChange,
  totalClient,
  pricePerM2,
  grossProfit,
  marginPercent,
  totalCost,
  showInternal = true,
  perUnitLabel = "грн/м²",
  className = "",
}: TargetMarginPanelProps) {
  const inp =
    "w-full bg-secondary/60 border border-border rounded-md px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40";
  const btn = "px-3 py-1.5 rounded-md text-xs font-bold transition-colors";

  return (
    <section className={`panel p-4 md:p-5 ${className}`}>
      <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary flex items-center gap-1">
        Маржа та ціна
        <span className="group relative inline-flex">
          <Info className="w-3.5 h-3.5 text-primary/70 cursor-help" />
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-64 z-30 hidden group-hover:block bg-popover text-popover-foreground text-[11px] leading-snug border border-border rounded-md p-2 shadow-lg normal-case tracking-normal font-normal">
            Маржа рахується від виручки: Ціна = Собівартість / (1 − маржа/100). Підвищення
            розподіляється переважно на роботи, менше — на логістику й матеріали.
          </span>
        </span>
      </h2>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Цільова маржа, %
          </span>
          <NumberInput className={`${inp} mt-1`} value={value} onChange={onChange} />
        </label>
        <Stat label="Ціна клієнту" value={`${nf(totalClient)} грн`} highlight />
        <Stat label={`Ціна клієнту / ${perUnitLabel}`} value={`${nf(pricePerM2)} ${perUnitLabel}`} />
        {showInternal && (
          <>
            <Stat label="Валовий прибуток" value={`${nf(grossProfit)} грн`} />
            {typeof totalCost === "number" && (
              <Stat label="Собівартість" value={`${nf(totalCost)} грн`} />
            )}
            <Stat label="Маржа" value={`${nf(marginPercent, 1)} %`} />
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[0, 25, 30, 35, 40].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`${btn} ${value === m ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}
          >
            {m === 0 ? "Авто" : `${m}%`}
          </button>
        ))}
      </div>
    </section>
  );
}
