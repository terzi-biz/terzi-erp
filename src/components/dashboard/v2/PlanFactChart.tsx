import { useState } from "react";
import { mln, moneyShort, pct, MONTHS_SHORT, MONTHS_NOM } from "./format";

export interface PlanFactMonth { month: number; fact: number | null; plan: number | null }

/** Стовпці «факт» (navy) + лінія «план» (золото) по місяцях року. Порожні місяці не домальовуються. */
export function PlanFactChart({ months, currentMonth }: { months: PlanFactMonth[]; currentMonth: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 230, L = 30, B = 26, T = 34;
  const innerW = W - L - 6;
  const innerH = H - B - T;
  const maxV = Math.max(1, ...months.map((m) => Math.max(m.fact ?? 0, m.plan ?? 0)));
  const step = niceStep(maxV / 1_000_000);
  const top = Math.ceil(maxV / 1_000_000 / step) * step * 1_000_000 || 1;
  const col = innerW / 12;
  const x = (i: number) => L + col * i + col / 2;
  const y = (v: number) => T + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / 1_000_000 / step) + 1 }, (_, i) => i * step * 1_000_000);
  const planPts = months.map((m, i) => (m.plan != null ? { x: x(i), y: y(m.plan) } : null));
  const segs: string[] = [];
  let cur: string[] = [];
  planPts.forEach((p) => { if (p) cur.push(`${p.x},${p.y}`); else if (cur.length) { segs.push(cur.join(" ")); cur = []; } });
  if (cur.length) segs.push(cur.join(" "));
  const focus = hover ?? currentMonth - 1;
  const fm = months[focus];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Сума договорів: план і факт по місяцях">
      <defs>
        <linearGradient id="pf-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1F4A8A" /><stop offset="1" stopColor="#0B1B3A" /></linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} stroke="#E3E7EF" strokeWidth="1" />
          <text x={L - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#5B6478" className="tabular-nums">{mln(t)}</text>
        </g>
      ))}
      {months.map((m, i) => {
        const isCur = i === currentMonth - 1;
        const bw = Math.min(26, col * 0.56);
        return (
          <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={L + col * i} y={T} width={col} height={innerH} fill="transparent" />
            {m.fact != null && m.fact > 0 ? (
              <rect x={x(i) - bw / 2} y={y(m.fact)} width={bw} height={Math.max(1, y(0) - y(m.fact))} rx="3" fill={isCur ? "#0B1B3A" : "url(#pf-bar)"} opacity={hover != null && hover !== i ? 0.55 : 1} />
            ) : null}
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight={isCur ? 700 : 400} fill={m.fact == null ? "#A3AAB8" : isCur ? "#0B1B3A" : "#5B6478"}>{MONTHS_SHORT[i]}</text>
          </g>
        );
      })}
      {segs.map((s) => <polyline key={s} points={s} fill="none" stroke="#D4960A" strokeWidth="2" strokeLinejoin="round" />)}
      {planPts.map((p, i) => (p ? <circle key={i} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#D4960A" strokeWidth="1.8" /> : null))}
      {fm && (fm.fact != null || fm.plan != null) ? (() => {
        const anchorY = y(Math.max(fm.fact ?? 0, fm.plan ?? 0));
        const label = `${fm.fact != null ? moneyShort(fm.fact).replace(" ₴", "") : "—"} / ${fm.plan != null ? moneyShort(fm.plan) : "план —"}`;
        const bw = Math.max(118, label.length * 6.3);
        const bx = Math.min(W - bw - 4, Math.max(L, x(focus) - bw / 2));
        const by = Math.max(2, anchorY - 44);
        const pctTxt = fm.fact != null && fm.plan ? ` · ${pct((fm.fact / fm.plan) * 100, 0)}` : "";
        return (
          <g pointerEvents="none">
            <rect x={bx} y={by} width={bw} height={36} rx="6" fill="#0B1B3A" />
            <text x={bx + 9} y={by + 14} fontSize="10" fill="#C9D1E3">{MONTHS_NOM[focus]}{pctTxt}</text>
            <text x={bx + 9} y={by + 28} fontSize="11.5" fontWeight="700" fill="#fff" className="tabular-nums">{label}</text>
          </g>
        );
      })() : null}
    </svg>
  );
}

function niceStep(maxMln: number) {
  if (maxMln <= 0.5) return 0.1;
  if (maxMln <= 1.2) return 0.25;
  if (maxMln <= 3) return 0.5;
  if (maxMln <= 8) return 2;
  if (maxMln <= 20) return 5;
  return 10;
}
