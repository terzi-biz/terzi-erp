import { useRef, useState, type UIEvent } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Filter, Megaphone, TrendingUp } from "lucide-react";
import { cabinetEconomy, cabinetMeta, CABINETS, type CabinetKey } from "@/lib/marketing/cabinets";
import { CabinetFunnelCard, romiTone, ROMI_TARGET, type CabinetFunnelData } from "./CabinetFunnelCard";
import { CabinetGlyph } from "./CabinetGlyph";
import { Card, CardHead } from "./primitives";
import { money, num, pct } from "./format";

export interface CabinetFunnelsPayload {
  cabinets: CabinetFunnelData[];
  totals: {
    spend: number | null; leads: number; measurements: number; proposals: number; deals: number; dealValue: number;
    paidLeads: number; paidDeals: number; paidDealValue: number;
  };
  otherSources: Array<{ source: string; n: number }>;
}

function Tile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "risk" | "bad" }) {
  const cls = tone === "good" ? "bg-[var(--status-done-soft)] text-[var(--status-done-ink)]"
    : tone === "risk" ? "bg-[var(--status-risk-soft)] text-[var(--status-risk-ink)]"
    : tone === "bad" ? "bg-[var(--status-overdue-soft)] text-[var(--status-overdue-ink)]"
    : "bg-[#F4F6FA] text-foreground";
  return (
    <div className={`min-w-0 rounded-lg px-3 py-2 ${cls}`}>
      <div title={label} className={`truncate text-[11.5px] ${tone ? "" : "text-muted-foreground"}`}>{label}</div>
      <div className="tz-num mt-0.5 truncate text-[17px] md:text-[18px]">{value}</div>
    </div>
  );
}

function insights(cabs: CabinetFunnelData[]) {
  const out: Array<{ tone: "good" | "info" | "risk"; text: string }> = [];
  const withCpl = cabs.map((c) => ({ c, e: cabinetEconomy(c) })).filter((x) => x.e.cpl != null);
  if (withCpl.length) {
    const best = withCpl.reduce((a, b) => ((b.e.cpl ?? Infinity) < (a.e.cpl ?? Infinity) ? b : a));
    out.push({ tone: "good", text: `Найдешевший лід — ${cabinetMeta(best.c.key).short}: ${money(best.e.cpl!)}` });
  }
  const conv = cabs.filter((c) => c.leads >= 5 && c.deals > 0).map((c) => ({ c, v: (c.deals / c.leads) * 100 }));
  if (conv.length) {
    const best = conv.reduce((a, b) => (b.v > a.v ? b : a));
    out.push({ tone: "info", text: `Найкраща конверсія лід → угода — ${cabinetMeta(best.c.key).short}: ${pct(best.v)}` });
  }
  for (const c of cabs) {
    const e = cabinetEconomy(c);
    if ((c.spend ?? 0) > 0 && c.deals === 0) out.push({ tone: "risk", text: `Ризик: ${cabinetMeta(c.key).short} — витрати ${money(c.spend!)}, угод 0` });
    else if (e.romi != null && e.romi < ROMI_TARGET) out.push({ tone: "risk", text: `Ризик: ${cabinetMeta(c.key).short} ROMI ${pct(e.romi, 0)} — нижче цілі ${ROMI_TARGET}%` });
  }
  return out.slice(0, 4);
}

export function MarketingFunnels({ data, periodLabel, loading, error }: {
  data: CabinetFunnelsPayload | null | undefined; periodLabel: string; loading?: boolean; error?: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : el.clientWidth;
    setSlide(Math.round(el.scrollLeft / w));
  };
  const goTo = (i: number) => {
    const el = scroller.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (el && child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft - 16, behavior: "smooth" });
  };

  const five = (data?.cabinets ?? []).filter((c) => c.key !== "other");
  const other = data?.cabinets.find((c) => c.key === "other");
  const t = data?.totals;
  const spend = t?.spend ?? null;
  const cpl = spend && t?.paidLeads ? spend / t.paidLeads : null;
  const costDeal = spend && t?.paidDeals ? spend / t.paidDeals : null;
  const romi = spend ? ((t!.paidDealValue - spend) / spend) * 100 : null;
  const tips = insights(five);
  // CPL / вартість угоди / ROMI рахуються лише по кабінетах із витратами — позначаємо це в підписі.
  const paidTag = five.some((c) => c.hasAdMetrics) ? `(${five.filter((c) => c.hasAdMetrics).map((c) => cabinetMeta(c.key).short).join(" + ")})` : "";
  const adSources = five.filter((c) => c.hasAdMetrics).map((c) => cabinetMeta(c.key).short);

  return (
    <Card className="p-4 md:p-5">
      <CardHead
        icon={<Megaphone className="h-[18px] w-[18px]" />}
        title={<><span className="md:hidden">Воронки по кабінетах</span><span className="hidden md:inline">Маркетинг: воронки по рекламних кабінетах</span></>}
        sub={<>{periodLabel} · Покази → Кліки → Ліди → Заміри → КП → Угоди<span className="hidden md:inline"> · дані рекламних кабінетів + CRM</span></>}
        action={<Link to="/marketing" className="text-[12.5px] font-semibold text-[var(--color-primary)] hover:underline">Маркетинг →</Link>}
      />

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Не вдалося завантажити воронки: {error}</div>
      ) : loading || !data ? (
        <div className="mt-4 grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[420px] animate-pulse rounded-xl bg-muted/60" />)}</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label={adSources.length ? `Витрати на рекламу (${adSources.join(" + ")})` : "Витрати на рекламу"} value={spend == null ? <span className="text-[14px] font-semibold text-muted-foreground">немає даних</span> : money(spend)} />
            <Tile label="Ліди" value={num(t!.leads)} />
            <Tile label={`CPL ${paidTag}`.trim()} value={cpl == null ? "—" : money(cpl)} />
            <Tile label="Угоди" value={num(t!.deals)} />
            <Tile label={`Вартість угоди ${paidTag}`.trim()} value={costDeal == null ? "—" : money(costDeal)} />
            <Tile label={`ROMI ${paidTag}`.trim()} value={romi == null ? "—" : pct(romi, 0)} tone={romi == null ? undefined : romiTone(romi) === "done" ? "good" : romiTone(romi) === "risk" ? "risk" : "bad"} />
          </div>

          {/* Desktop: 5 колонок; mobile/tablet: горизонтальний свайп зі snap */}
          <div
            ref={scroller}
            onScroll={onScroll}
            className="tz-snap-x -mx-4 mt-4 items-start gap-3 px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-5 lg:items-stretch lg:overflow-visible lg:px-0"
          >
            {five.map((f) => (
              <CabinetFunnelCard key={f.key} f={f} className="w-[84%] sm:w-[46%] lg:w-auto" />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 lg:hidden" role="tablist" aria-label="Кабінети">
            {five.map((f, i) => (
              <button key={f.key} type="button" onClick={() => goTo(i)} aria-label={cabinetMeta(f.key).label} aria-selected={slide === i} role="tab"
                className="grid !min-h-0 place-items-center p-1">
                <span className={`block h-1.5 rounded-full transition-all ${slide === i ? "w-5 bg-[var(--color-primary)]" : "w-1.5 bg-border"}`} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar lg:hidden">
            {five.map((f, i) => (
              <button key={f.key} type="button" onClick={() => goTo(i)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${slide === i ? "border-[var(--color-primary)] bg-[var(--color-gold-soft)] font-semibold" : "border-border bg-card"}`}>
                <CabinetGlyph k={f.key as CabinetKey} size={16} />{cabinetMeta(f.key).short}
              </button>
            ))}
          </div>

          {tips.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {tips.map((x) => (
                <span key={x.text} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
                  x.tone === "good" ? "bg-[var(--status-done-soft)] text-[var(--status-done-ink)]" : x.tone === "risk" ? "bg-[var(--status-risk-soft)] text-[var(--status-risk-ink)]" : "bg-[#E8ECF4] text-[var(--color-primary)]"}`}>
                  {x.tone === "good" ? <TrendingUp className="h-3.5 w-3.5" /> : x.tone === "risk" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
                  {x.text}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Ліди, створені за період. Етапи накопичувальні (угода ⇒ КП ⇒ замір). Угода — лід «виграно» / етап «Успешно» або замовлення в статусі договору; сума угоди — сума замовлення (або бюджет ліда). ROMI = (сума угод − витрати) / витрати, по кабінетах із витратами.
            {other && other.leads ? (
              <> «Інше» — {num(other.leads)} лідів{data.otherSources.length ? `: ${data.otherSources.slice(0, 5).map((s) => `${s.source} ${s.n}`).join(", ")}` : ""}
                {other.deals ? `; угод ${num(other.deals)} на ${money(other.dealValue)}` : ""}.</>
            ) : null}
            {five.some((c) => !c.adsConnected) ? (
              <> Не підключено: {CABINETS.filter((c) => !five.find((f) => f.key === c.key)?.adsConnected).map((c) => `${c.short} (${c.connectHint})`).join(", ")}.</>
            ) : null}
          </p>
        </>
      )}
    </Card>
  );
}
