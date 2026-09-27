import { Globe, Infinity as InfinityIcon, Music2, Shapes } from "lucide-react";
import type { CabinetKey } from "@/lib/marketing/cabinets";

/** Невеликі знаки рекламних кабінетів (без сторонніх логотип-файлів). */
export function CabinetGlyph({ k, size = 28 }: { k: CabinetKey; size?: number }) {
  const box = `grid shrink-0 place-items-center rounded-md bg-white ${size >= 20 ? "border border-border" : ""}`;
  const s = { width: size, height: size };
  const i = Math.round(size * 0.58);
  switch (k) {
    case "google":
      return (
        <span className={box} style={s} aria-hidden>
          <svg width={i} height={i} viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
        </span>
      );
    case "meta":
      return <span className={box} style={s} aria-hidden><InfinityIcon className="text-[#0866FF]" style={{ width: i, height: i }} strokeWidth={2.4} /></span>;
    case "olx":
      return <span className="grid shrink-0 place-items-center rounded-md bg-[#002F34] font-extrabold lowercase leading-none tracking-tight text-[#23E5DB]" style={{ ...s, fontSize: Math.max(6, Math.round(size * 0.36)) }} aria-hidden>olx</span>;
    case "site":
      return <span className={box} style={s} aria-hidden><Globe className="text-[#2E7D5B]" style={{ width: i, height: i }} strokeWidth={2} /></span>;
    case "tiktok":
      return <span className="grid shrink-0 place-items-center rounded-md bg-[#161823] text-white" style={s} aria-hidden><Music2 style={{ width: i, height: i }} strokeWidth={2.2} /></span>;
    default:
      return <span className={box} style={s} aria-hidden><Shapes className="text-muted-foreground" style={{ width: i, height: i }} /></span>;
  }
}
