import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Layers, Package2, ShieldCheck, X } from "lucide-react";
import { formatUah } from "@/lib/screed-calc";
import { ATTRIBUTE_LABELS } from "@/lib/warehouse-import";
import { getStockItemCard } from "@/lib/warehouse-variants.functions";
import { moduleLabel as terziModuleLabel } from "@/lib/modules";

const STATUS_LABELS: Record<string, string> = {
  unknown: "Невідомо",
  source_only: "Лише джерело",
  review_required: "Потребує перевірки",
  verified: "Перевірено",
};

const moduleLabel = (id: string) => terziModuleLabel(id) || id;

function attrText(a: any): string {
  if (a.data_type === "number" && a.numeric_value != null) return `${a.numeric_value}${a.unit ? ` ${a.unit}` : ""}`;
  if (a.data_type === "range" && (a.min_value != null || a.max_value != null))
    return `${a.min_value ?? "…"}–${a.max_value ?? "…"}${a.unit ? ` ${a.unit}` : ""}`;
  if (a.text_value) return a.text_value;
  return a.source_text ? `${a.source_text} (не підтверджено)` : "невідомо";
}

/** Картка сімейства/варіанта: типізовані характеристики, упаковки, застосування, залишки. */
export function MaterialVariantCard({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const fn = useServerFn(getStockItemCard);
  const q = useQuery({ queryKey: ["stock-item-card", itemId], queryFn: () => fn({ data: { itemId } }) });
  const d = q.data as any;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <div className="text-lg font-black">{d?.item?.name ?? "Позиція"}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {d?.item?.sku ?? "без артикулу"} · {d?.item?.unit ?? ""} · {d?.item?.module ? moduleLabel(d.item.module) : "напрямок не вказаний"}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Завантаження…</div>}
        {d && (
          <div className="p-4 space-y-4 text-sm">
            <div className="grid sm:grid-cols-3 gap-3">
              <Info label="Сімейство" value={d.item.family_key ?? "—"} />
              <Info label="Варіант" value={d.item.variant_label ?? "—"} />
              <Info label="Статус перевірки" value={STATUS_LABELS[d.item.verification_status] ?? d.item.verification_status} />
              <Info label="Джерело" value={d.item.origin_external_key ?? "внесено вручну"} />
              <Info label="Сер. собівартість" value={d.cost_available ? formatUah(Number(d.avg_cost)) : "немає доступу або невідомо"} />
              <Info label="Мін. запас" value={`${Number(d.item.min_qty ?? 0)} ${d.item.unit}`} />
            </div>

            <Section icon={<ShieldCheck className="w-4 h-4 text-primary" />} title="Характеристики">
              {d.attributes.length === 0 && <Empty>Характеристик ще немає.</Empty>}
              <div className="grid sm:grid-cols-2 gap-2">
                {d.attributes.map((a: any) => (
                  <div key={a.id} className="rounded-md border border-border px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {ATTRIBUTE_LABELS[a.attribute_key] ?? a.attribute_key}
                    </div>
                    <div className="font-semibold">{attrText(a)}</div>
                    <div className="text-[11px] text-muted-foreground">{STATUS_LABELS[a.verification_status] ?? a.verification_status}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section icon={<Package2 className="w-4 h-4 text-primary" />} title="Упаковки та коефіцієнти">
              {d.pack_units.length === 0 && <Empty>Упаковки не задані.</Empty>}
              {d.pack_units.map((p: any) => (
                <div key={p.id} className="flex justify-between border-b border-border/50 py-1.5">
                  <span className="font-semibold">{p.unit_label}</span>
                  <span className="text-xs">{Number(p.base_qty_per_pack)} {d.item.unit} / уп · {STATUS_LABELS[p.verification_status] ?? p.verification_status}</span>
                </div>
              ))}
            </Section>

            <Section icon={<Layers className="w-4 h-4 text-primary" />} title="Застосування в напрямках">
              {d.applications.length === 0 && <Empty>Напрямки ще не зіставлені.</Empty>}
              {d.applications.map((a: any) => (
                <div key={a.id} className="flex justify-between border-b border-border/50 py-1.5">
                  <span className="font-semibold">{moduleLabel(a.module)}</span>
                  <span className="text-xs text-muted-foreground">{a.catalog?.name ?? (a.link_type === "none" ? "без позиції каталогу" : "—")}</span>
                </div>
              ))}
              <div className="text-[11px] text-muted-foreground mt-1">Один фізичний SKU використовується в кількох напрямках і не дублюється.</div>
            </Section>

            <Section icon={<Package2 className="w-4 h-4 text-primary" />} title="Залишки за складами">
              {d.balances.length === 0 && <Empty>Рухів по позиції ще не було.</Empty>}
              {d.balances.map((b: any) => (
                <div key={b.warehouse_id} className="flex justify-between border-b border-border/50 py-1.5">
                  <span>{b.warehouse?.name ?? "—"}</span>
                  <span className="text-xs">{Number(b.qty).toFixed(2)} {d.item.unit} · резерв {Number(b.reserved_qty ?? 0).toFixed(2)} {d.item.unit}</span>
                </div>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm break-words">{value}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="font-bold flex items-center gap-2">{icon}{title}</div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-muted-foreground">{children}</div>;
