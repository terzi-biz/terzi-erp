import { PlugZap } from "lucide-react";
import {
  cabinetEconomy, cabinetMeta, stageConversion, FUNNEL_LABELS, FUNNEL_STAGES,
  type CabinetFunnel, type FunnelStage,
} from "@/lib/marketing/cabinets";
import { CabinetGlyph } from "./CabinetGlyph";
import { money, num, pct } from "./format";

export type CabinetFunnelData = CabinetFunnel & { account?: string | null };

/** Ширина сходинки воронки (фіксована лісенка, як у макеті). */
const WIDTHS = [100, 88, 76, 64, 54, 44];
const AD_STAGES: FunnelStage[] = ["impressions", "clicks"];

/** Колір сходинки: від акценту кабінету до navy; останній етап (Угоди) — золото з navy-текстом. */
function stageBg(accent: string, i: number) {
  if (i === FUNNEL_STAGES.length - 1) return "linear-gradient(90deg, #D4960A, #E0A21A)";
  const mix = Math.min(85, i * 17);
  return `color-mix(in srgb, #0B1B3A ${mix}%, ${accent})`;
}

/** Орієнтир ROMI з макета (для кольору пілюлі): ≥ цілі — зелений, 0…ціль — помаранчевий, < 0 — червоний. */
export const ROMI_TARGET = 250;

export function romiTone(romi: number | null): "done" | "risk" | "overdue" | "draft" {
  if (romi == null) return "draft";
  if (romi >= ROMI_TARGET) return "done";
  if (romi >= 0) return "risk";
  return "overdue";
}

export function CabinetFunnelCard({ f, className = "" }: { f: CabinetFunnelData; className?: string }) {
  const meta = cabinetMeta(f.key);
  const eco = cabinetEconomy(f);
  const values: Record<FunnelStage, number | null> = {
    impressions: f.impressions, clicks: f.clicks, leads: f.leads,
    measurements: f.measurements, proposals: f.proposals, deals: f.deals,
  };
  const adState: "ok" | "empty" | "off" = f.hasAdMetrics ? "ok" : f.adsConnected ? "empty" : "off";
  const romi = eco.romi;

  return (
    <article className={`tz-card relative flex flex-col overflow-hidden p-3.5 pt-4 ${className}`} aria-label={`Воронка ${meta.label}`}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.bar }} aria-hidden />
      <header className="flex items-center gap-2.5">
        <CabinetGlyph k={f.key} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold leading-tight text-foreground">{meta.label}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">{f.account || (adState === "off" ? "кабінет не підключено" : "дані CRM")}</div>
        </div>
      </header>

      <ol className="mt-3 flex flex-col items-center">
        {FUNNEL_STAGES.map((st, i) => {
          const v = values[st];
          const isAd = AD_STAGES.includes(st);
          const prev = i > 0 ? values[FUNNEL_STAGES[i - 1]] : null;
          const conv = i > 0 ? stageConversion(prev, v) : null;
          const last = i === FUNNEL_STAGES.length - 1;
          return (
            <li key={st} className="flex w-full flex-col items-center">
              {i > 0 ? (
                <div className="py-[3px] text-[11px] tabular-nums leading-none text-muted-foreground">
                  ↓ {conv == null ? "—" : pct(conv, conv < 10 ? 2 : 0)}
                </div>
              ) : null}
              {isAd && adState !== "ok" ? (
                <div
                  className="flex h-7 items-center justify-center rounded-[4px] border border-dashed border-border bg-muted/50 px-2 text-[11px] text-muted-foreground"
                  style={{ width: `${WIDTHS[i]}%` }}
                  title={adState === "off" ? `Підключіть ${meta.connectHint}` : "Кабінет підключено, але метрик за період немає"}
                >
                  <span className="truncate">{FUNNEL_LABELS[st]} · {adState === "off" ? "не підключено" : "немає даних"}</span>
                </div>
              ) : (
                <div
                  className={`flex h-7 items-center justify-between gap-2 px-2.5 text-[12px] ${last ? "text-[#0B1B3A]" : "text-white"}`}
                  style={{
                    width: `${WIDTHS[i]}%`,
                    background: stageBg(meta.accent, i),
                    clipPath: "polygon(0 0, 100% 0, calc(100% - 5px) 100%, 5px 100%)",
                  }}
                >
                  <span className={`truncate ${last ? "font-bold" : "font-medium"}`}>{FUNNEL_LABELS[st]}</span>
                  <span className="font-bold tabular-nums">{v == null ? "—" : num(v)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {adState === "off" ? (
        <div className="mb-3 mt-3 flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <PlugZap className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Кабінет не підключено — покази, кліки й витрати з'являться після підключення {meta.connectHint}.</span>
        </div>
      ) : null}

      <div className="min-h-3 flex-1" aria-hidden />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-[11.5px] [&_dd]:mt-0.5 [&_dd]:text-[13px] [&_dd]:font-bold [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
        <div><dt>Витрати</dt><dd>{f.spend == null ? <span className="font-medium text-muted-foreground">—</span> : money(f.spend)}</dd></div>
        <div><dt>CPL</dt><dd>{eco.cpl == null ? <span className="font-medium text-muted-foreground">—</span> : money(eco.cpl)}</dd></div>
        <div><dt>Вартість угоди</dt><dd>{eco.costPerDeal == null ? <span className="font-medium text-muted-foreground">—</span> : money(eco.costPerDeal)}</dd></div>
        <div>
          <dt>ROMI</dt>
          <dd>{romi == null ? <span className="font-medium text-muted-foreground">—</span> : <span className={`tz-pill tz-pill--${romiTone(romi)}`}>{pct(romi, 0)}</span>}</dd>
        </div>
      </dl>
    </article>
  );
}
