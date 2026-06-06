import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, RotateCcw, Save } from "lucide-react";
import { listCatalog, upsertCatalogItem, deleteCatalogItem, seedCatalogDefaults } from "@/lib/catalog.functions";

type Module = "screed" | "roofing" | "insulation" | "demolition" | "common";
type Kind = "material" | "work" | "equipment";

interface Row {
  id?: string;
  module: Module;
  kind: Kind;
  code?: string | null;
  name: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  lifetime_months?: number | null;
  is_custom: boolean;
  is_active: boolean;
  sort_order: number;
}

const MODULE_LABEL: Record<Module, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж", common: "Спільні",
};
const KIND_LABEL: Record<Kind, string> = { material: "Матеріали", work: "Роботи", equipment: "Обладнання" };

function margin(buy: number, sell: number) {
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
}

export function CatalogPage({ module, kind }: { module: Module; kind: Kind }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCatalog);
  const upsert = useServerFn(upsertCatalogItem);
  const del = useServerFn(deleteCatalogItem);
  const seed = useServerFn(seedCatalogDefaults);
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});

  const queryKey = ["catalog", module, kind];
  const { data: items = [], isLoading } = useQuery({
    queryKey, queryFn: () => fetchList({ data: { module, kind } }),
  });

  const saveMut = useMutation({
    mutationFn: (row: Row) => upsert({ data: row }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const seedMut = useMutation({
    mutationFn: () => seed({ data: { module, kind } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const onPatch = (id: string, patch: Partial<Row>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const onSaveRow = (row: Row) => {
    const patch = edits[row.id!];
    if (!patch) return;
    saveMut.mutate({ ...row, ...patch });
    setEdits((e) => { const c = { ...e }; delete c[row.id!]; return c; });
  };

  const onAdd = () => {
    saveMut.mutate({
      module, kind, name: "Нова позиція", unit: kind === "equipment" ? "міс." : "шт",
      buy_price: 0, sell_price: 0, lifetime_months: kind === "equipment" ? 36 : null,
      is_custom: true, is_active: true, sort_order: items.length,
    });
  };

  const isEquip = kind === "equipment";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between border-b border-border pb-4 mb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl font-black">{MODULE_LABEL[module]} · {KIND_LABEL[kind]}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isEquip
              ? "Назва, вартість придбання, термін експлуатації, місячна амортизація для клієнта."
              : "Назва, одиниця, закупка, продаж, маржинальність. Можна додавати кастомні позиції."}
          </p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
              className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2">
              <RotateCcw className="w-3 h-3" /> Завантажити дефолти
            </button>
          )}
          <button onClick={onAdd}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
            <Plus className="w-3 h-3" /> Додати позицію
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-muted-foreground text-sm">Завантаження…</div> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Назва</th>
                <th className="text-left p-3 w-20">Од.</th>
                <th className="text-right p-3 w-32">{isEquip ? "Вартість" : "Закупка"}</th>
                <th className="text-right p-3 w-32">{isEquip ? "Амортиз./міс." : "Продаж"}</th>
                {isEquip && <th className="text-right p-3 w-24">Термін, міс.</th>}
                <th className="text-right p-3 w-24">Маржа</th>
                <th className="text-center p-3 w-24">Тип</th>
                <th className="p-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {(items as Row[]).map((r) => {
                const patch = edits[r.id!] ?? {};
                const cur = { ...r, ...patch } as Row;
                const dirty = Object.keys(patch).length > 0;
                const m = margin(cur.buy_price, cur.sell_price);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">
                      <input className="w-full bg-input border border-border rounded px-2 py-1"
                        value={cur.name} onChange={(e) => onPatch(r.id!, { name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <input className="w-full bg-input border border-border rounded px-2 py-1"
                        value={cur.unit} onChange={(e) => onPatch(r.id!, { unit: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <input type="number" step="0.5" className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                        value={cur.buy_price} onChange={(e) => onPatch(r.id!, { buy_price: +e.target.value })} />
                    </td>
                    <td className="p-2">
                      <input type="number" step="0.5" className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                        value={cur.sell_price} onChange={(e) => onPatch(r.id!, { sell_price: +e.target.value })} />
                    </td>
                    {isEquip && (
                      <td className="p-2">
                        <input type="number" className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                          value={cur.lifetime_months ?? 0}
                          onChange={(e) => onPatch(r.id!, { lifetime_months: +e.target.value })} />
                      </td>
                    )}
                    <td className={`p-2 text-right font-bold ${m >= 30 ? "text-success" : m >= 15 ? "text-warning" : "text-destructive"}`}>
                      {m.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${cur.is_custom ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {cur.is_custom ? "Кастом" : "Сист."}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1 justify-end">
                        {dirty && (
                          <button onClick={() => onSaveRow(r)} title="Зберегти"
                            className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
                            <Save className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => confirm(`Видалити "${r.name}"?`) && delMut.mutate(r.id!)} title="Видалити"
                          className="p-1.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={isEquip ? 8 : 7} className="p-8 text-center text-muted-foreground">
                  Каталог порожній. Завантажте дефолти або додайте позицію.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
