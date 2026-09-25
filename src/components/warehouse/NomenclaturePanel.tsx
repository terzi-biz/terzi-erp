import { useMemo, useState } from "react";
import { MaterialVariantCard } from "@/components/warehouse/MaterialVariantCard";
import { whInput } from "./ui";

const VERIFICATION_LABELS: Record<string, string> = {
  unknown: "Невідомо",
  source_only: "Лише джерело",
  review_required: "Потребує перевірки",
  verified: "Перевірено",
};

export function NomenclaturePanel({ items, isLoading }: { items: any[]; isLoading: boolean }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = items.filter(
    (i) =>
      !q ||
      `${i.name} ${i.sku ?? ""} ${i.family_key ?? ""} ${i.variant_label ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const families = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const i of rows) {
      const key = i.family_key || i.category || "Без сімейства";
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "uk"));
  }, [rows]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук по сімействах і варіантах…"
        className={`${whInput} max-w-md`}
      />
      {isLoading && <div className="text-sm text-muted-foreground">Завантаження…</div>}
      {!isLoading && families.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          Номенклатура порожня. Позиції створюються вручну або з черги перевірки у розділі «Імпорт».
        </div>
      )}
      {families.map(([family, list]) => (
        <div key={family} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-secondary/60 text-xs uppercase tracking-wider font-bold">
            {family} · {list.length}
          </div>
          <div className="divide-y divide-border">
            {list.map((i) => (
              <button
                key={i.id}
                onClick={() => setOpenId(i.id)}
                className="w-full text-left px-3 py-2 hover:bg-secondary/30 flex flex-wrap items-center gap-2"
              >
                <span className="font-semibold text-sm">{i.variant_label || i.name}</span>
                {i.sku && <span className="text-[11px] font-mono text-muted-foreground">{i.sku}</span>}
                <span className="text-[11px] text-muted-foreground">{i.unit}</span>
                <span className="ml-auto text-[11px] rounded px-2 py-0.5 bg-secondary">
                  {VERIFICATION_LABELS[i.verification_status] ?? "Невідомо"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {openId && <MaterialVariantCard itemId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
