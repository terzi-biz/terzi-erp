import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { WAREHOUSE_KINDS } from "@/lib/warehouse-calc";
import { saveWarehouse, saveStockItem } from "@/lib/warehouse.functions";
import { whBtn, whInput } from "./ui";

export function RefsPanel({
  warehouses,
  items,
  onChange,
}: {
  warehouses: any[];
  items: any[];
  onChange: () => void;
}) {
  const saveWh = useServerFn(saveWarehouse);
  const saveItem = useServerFn(saveStockItem);
  const [wh, setWh] = useState({ name: "", kind: "main", address: "" });
  const [it, setIt] = useState({ name: "", sku: "", unit: "шт", category: "", min_qty: 0 });

  const whMut = useMutation({
    mutationFn: () =>
      saveWh({ data: { name: wh.name, kind: wh.kind, address: wh.address || null } }),
    onSuccess: () => {
      toast.success("Склад збережено");
      setWh({ name: "", kind: "main", address: "" });
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const itMut = useMutation({
    mutationFn: () =>
      saveItem({
        data: {
          name: it.name,
          sku: it.sku || null,
          unit: it.unit,
          category: it.category || null,
          min_qty: Number(it.min_qty) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Позицію додано");
      setIt({ name: "", sku: "", unit: "шт", category: "", min_qty: 0 });
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h2 className="font-bold">Склади</h2>
        <div className="space-y-1 text-sm">
          {warehouses.map((w) => (
            <div key={w.id} className="flex justify-between border-b border-border/50 py-1.5">
              <span className="font-semibold">{w.name}</span>
              <span className="text-xs text-muted-foreground">
                {WAREHOUSE_KINDS[w.kind] ?? w.kind}
              </span>
            </div>
          ))}
          {warehouses.length === 0 && (
            <div className="text-xs text-muted-foreground">Складів ще немає.</div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={whInput}
            placeholder="Назва складу"
            value={wh.name}
            onChange={(e) => setWh({ ...wh, name: e.target.value })}
          />
          <select
            className={whInput}
            value={wh.kind}
            onChange={(e) => setWh({ ...wh, kind: e.target.value })}
          >
            {Object.entries(WAREHOUSE_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className={`${whInput} col-span-2`}
            placeholder="Адреса"
            value={wh.address}
            onChange={(e) => setWh({ ...wh, address: e.target.value })}
          />
        </div>
        <button
          className={`${whBtn} bg-primary text-primary-foreground`}
          disabled={!wh.name || whMut.isPending}
          onClick={() => whMut.mutate()}
        >
          <Plus className="w-4 h-4" /> Додати склад
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h2 className="font-bold">Нова позиція номенклатури</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={`${whInput} col-span-2`}
            placeholder="Назва"
            value={it.name}
            onChange={(e) => setIt({ ...it, name: e.target.value })}
          />
          <input
            className={whInput}
            placeholder="Артикул"
            value={it.sku}
            onChange={(e) => setIt({ ...it, sku: e.target.value })}
          />
          <input
            className={whInput}
            placeholder="Одиниця"
            value={it.unit}
            onChange={(e) => setIt({ ...it, unit: e.target.value })}
          />
          <input
            className={whInput}
            placeholder="Категорія"
            value={it.category}
            onChange={(e) => setIt({ ...it, category: e.target.value })}
          />
          <input
            className={whInput}
            type="number"
            step="0.01"
            placeholder="Мін. запас"
            value={it.min_qty}
            onChange={(e) => setIt({ ...it, min_qty: Number(e.target.value) })}
          />
        </div>
        <button
          className={`${whBtn} bg-primary text-primary-foreground`}
          disabled={!it.name || itMut.isPending}
          onClick={() => itMut.mutate()}
        >
          <Plus className="w-4 h-4" /> Додати позицію
        </button>
        <div className="text-xs text-muted-foreground">Усього позицій: {items.length}</div>
      </div>
    </div>
  );
}
