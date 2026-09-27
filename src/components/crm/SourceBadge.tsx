import { cabinetMeta, type CabinetKey } from "@/lib/marketing/cabinets";
import { CabinetGlyph } from "@/components/dashboard/v2/CabinetGlyph";

/** Бейдж джерела ліда (UI v2): кабінет + сире значення в підказці. */
export function SourceBadge({ cabinet, source, size = "sm" }: { cabinet: CabinetKey; source?: string | null; size?: "sm" | "md" }) {
  const meta = cabinetMeta(cabinet);
  const label = cabinet === "other" ? (source?.trim() || "Без джерела") : meta.short;
  return (
    <span
      title={source ? `Джерело: ${source}` : "Джерело не вказане"}
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold text-foreground ${size === "md" ? "px-2 py-0.5 text-[12px]" : "px-1.5 py-[1px] text-[11px]"}`}
      style={{ background: meta.tint }}
    >
      <CabinetGlyph k={cabinet} size={size === "md" ? 16 : 14} />
      <span className="truncate">{label}</span>
    </span>
  );
}
