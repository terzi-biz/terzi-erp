/**
 * «Витратні матеріали і гази» — довідник config_entries (kind=dictionary, key=calc_consumables).
 * Кожне збереження = нова опублікована версія (історія зберігається, rollback — у Системі → Довідники).
 * «Видалити» архівує позицію: у довіднику елементи не видаляються фізично.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Save, X, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getResolvedConfig, saveConfigDraft, publishConfig } from "@/lib/config-kernel/config.functions";
import type { Dictionary, DictionaryItem } from "@/lib/config-kernel/dictionaries";

const KEY = "calc_consumables";
const SCOPE = { type: "company" as const, id: "terzi" };
const QK = ["config", "dictionary", KEY];

type Row = { code: string; name: string; unit: string; norm: number; price: number; required: boolean; archived: boolean };
const EMPTY: Omit<Row, "code" | "archived"> = { name: "", unit: "", norm: 0, price: 0, required: false };

function toRow(i: DictionaryItem): Row {
  const m = i.metadata ?? {};
  return {
    code: i.code, name: i.label_uk, archived: i.archived === true,
    unit: String(m.unit ?? ""), norm: Number(m.norm_per_m2 ?? 0), price: Number(m.price_uah ?? 0), required: m.required === true,
  };
}
function toItem(r: Row, order: number): DictionaryItem {
  return {
    code: r.code, label_uk: r.name.trim(), order, ...(r.archived ? { archived: true } : {}),
    metadata: { unit: r.unit.trim(), norm_per_m2: r.norm, price_uah: r.price, required: r.required },
  };
}
const uah = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n);

export function ConsumablesAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getResolvedConfig);
  const save = useServerFn(saveConfigDraft);
  const publish = useServerFn(publishConfig);
  const q = useQuery({ queryKey: QK, queryFn: () => load({ data: { kind: "dictionary", key: KEY } }) });
  const rows = useMemo(() => ((q.data?.value as Dictionary | null)?.items ?? []).map(toRow), [q.data]);
  const [edit, setEdit] = useState<(Omit<Row, "code" | "archived"> & { code: string | null }) | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const persist = useMutation({
    mutationFn: async ({ next, note }: { next: Row[]; note: string }) => {
      const payload: Dictionary = {
        label_uk: "Витратні матеріали і гази",
        description: "Норма на м² і ціна за одиницю для калькуляторів",
        items: next.map(toItem),
      };
      await save({ data: { kind: "dictionary", key: KEY, scope: SCOPE, payload } });
      await publish({ data: { kind: "dictionary", key: KEY, scope: SCOPE, note } });
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: QK }); setEdit(null); toast.success("Збережено"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!edit) return;
    if (!edit.name.trim() || !edit.unit.trim()) return toast.error("Вкажіть назву та одиницю виміру");
    if (!(edit.norm >= 0) || !(edit.price >= 0)) return toast.error("Норма і ціна не можуть бути від'ємними");
    const code = edit.code ?? `c_${Date.now().toString(36)}`;
    const row: Row = { code, name: edit.name, unit: edit.unit, norm: edit.norm, price: edit.price, required: edit.required, archived: false };
    const next = edit.code ? rows.map((r) => (r.code === code ? row : r)) : [...rows, row];
    persist.mutate({ next, note: edit.code ? `Змінено: ${row.name}` : `Додано: ${row.name}` });
  };
  const setArchived = (r: Row, archived: boolean) =>
    persist.mutate({ next: rows.map((x) => (x.code === r.code ? { ...x, archived } : x)), note: `${archived ? "Видалено (архів)" : "Відновлено"}: ${r.name}` });

  if (q.isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження…</div>;
  if (q.isError) return <div className="panel p-5 text-sm text-destructive">Не вдалося завантажити довідник.</div>;

  const visible = rows.filter((r) => showArchived || !r.archived);
  const cell = "px-2 py-2 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Кожна зміна зберігає нову версію; видалені позиції переходять в архів і лишаються в старих кошторисах.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Сховати архів" : "Показати архів"}</Button>
          {canEdit && <Button size="sm" onClick={() => setEdit({ ...EMPTY, code: null })}><Plus className="w-3.5 h-3.5 mr-1" />Додати</Button>}
        </div>
      </div>

      {edit && (
        <div className="panel p-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] items-end">
          <label className="text-xs space-y-1"><span>Назва</span><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <label className="text-xs space-y-1"><span>Од. виміру</span><Input value={edit.unit} placeholder="кг, л, шт" onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></label>
          <label className="text-xs space-y-1"><span>Витрата на м²</span><Input type="number" step="0.001" min="0" value={edit.norm} onChange={(e) => setEdit({ ...edit, norm: Number(e.target.value) })} /></label>
          <label className="text-xs space-y-1"><span>Ціна за од., грн</span><Input type="number" step="0.01" min="0" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></label>
          <label className="text-xs flex items-center gap-2 min-h-[40px]"><input type="checkbox" checked={edit.required} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} />Обов'язково для кошторису</label>
          <div className="flex gap-1">
            <Button size="sm" onClick={submit} disabled={persist.isPending}><Save className="w-3.5 h-3.5 mr-1" />Зберегти</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="text-xs text-muted-foreground text-left border-b border-border">
            <tr><th className={cell}>Назва</th><th className={cell}>Од.</th><th className={`${cell} text-right`}>Витрата на м²</th><th className={`${cell} text-right`}>Ціна, грн</th><th className={cell}>Обов'язково</th><th className={cell}></th></tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6} className={`${cell} text-muted-foreground text-center py-6`}>Позицій ще немає — додайте першу.</td></tr>}
            {visible.map((r) => (
              <tr key={r.code} className={`border-b border-border last:border-0 ${r.archived ? "opacity-50" : ""}`}>
                <td className={cell}>{r.name}{r.archived && " (архів)"}</td>
                <td className={cell}>{r.unit}</td>
                <td className={`${cell} text-right tabular-nums`}>{uah(r.norm)}</td>
                <td className={`${cell} text-right tabular-nums`}>{uah(r.price)}</td>
                <td className={cell}>{r.required ? "Так" : "—"}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  {canEdit && !r.archived && <>
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ code: r.code, name: r.name, unit: r.unit, norm: r.norm, price: r.price, required: r.required })}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Видалити «${r.name}»? Позиція перейде в архів.`)) setArchived(r, true); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </>}
                  {canEdit && r.archived && <Button size="sm" variant="ghost" onClick={() => setArchived(r, false)}><ArchiveRestore className="w-3.5 h-3.5" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
