import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { formatUah } from "@/lib/screed-calc";
import { documentTotal, STOCK_DOC_LABELS, STOCK_STATUS_LABELS } from "@/lib/warehouse-calc";
import { saveStockDocument, postStockDocument, cancelStockDocument } from "@/lib/warehouse.functions";
import { whBtn, whInput, whLabel } from "./ui";
import { StockDocFinmap } from "./StockDocFinmap";

type DraftLine = { item_id: string; qty: number; price: number };

export function DocsPanel({
  docs,
  items,
  warehouses,
  orders,
  onChange,
  allowedTypes,
  defaultDocType = "in",
  emptyLabel = "Документів ще немає.",
}: {
  docs: any[];
  items: any[];
  warehouses: any[];
  orders: any[];
  onChange: () => void;
  allowedTypes?: readonly string[];
  defaultDocType?: string;
  emptyLabel?: string;
}) {
  const save = useServerFn(saveStockDocument);
  const post = useServerFn(postStockDocument);
  const cancel = useServerFn(cancelStockDocument);
  const [open, setOpen] = useState(false);
  const [finmapDoc, setFinmapDoc] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);

  const typeEntries = Object.entries(STOCK_DOC_LABELS).filter(
    ([k]) => !allowedTypes || allowedTypes.includes(k),
  );
  const filtered = allowedTypes ? docs.filter((d) => allowedTypes.includes(d.doc_type)) : docs;

  const emptyDoc = () => ({
    doc_type:
      (allowedTypes?.includes(defaultDocType) ? defaultDocType : typeEntries[0]?.[0]) ?? "in",
    doc_date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouses[0]?.id ?? "",
    target_warehouse_id: null as string | null,
    order_id: null as string | null,
    supplier: "",
    note: "",
    lines: [] as DraftLine[],
  });

  const saveMut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Документ збережено");
      setOpen(false);
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const postMut = useMutation({
    mutationFn: (id: string) => post({ data: { id } }),
    onSuccess: () => {
      toast.success("Документ проведено — залишки оновлено");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося провести"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => {
      toast.success("Документ скасовано");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося скасувати"),
  });

  return (
    <div className="space-y-3">
      <button
        className={`${whBtn} bg-primary text-primary-foreground`}
        onClick={() => {
          setDoc(emptyDoc());
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" /> Новий документ
      </button>

      {open && doc && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <div className={whLabel}>Тип</div>
              <select
                className={whInput}
                value={doc.doc_type}
                onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}
              >
                {typeEntries.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={whLabel}>Дата</div>
              <input
                type="date"
                className={whInput}
                value={doc.doc_date}
                onChange={(e) => setDoc({ ...doc, doc_date: e.target.value })}
              />
            </div>
            <div>
              <div className={whLabel}>Склад</div>
              <select
                className={whInput}
                value={doc.warehouse_id}
                onChange={(e) => setDoc({ ...doc, warehouse_id: e.target.value })}
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            {doc.doc_type === "transfer" ? (
              <div>
                <div className={whLabel}>Склад-отримувач</div>
                <select
                  className={whInput}
                  value={doc.target_warehouse_id ?? ""}
                  onChange={(e) =>
                    setDoc({ ...doc, target_warehouse_id: e.target.value || null })
                  }
                >
                  <option value="">—</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <div className={whLabel}>Замовлення</div>
                <select
                  className={whInput}
                  value={doc.order_id ?? ""}
                  onChange={(e) => setDoc({ ...doc, order_id: e.target.value || null })}
                >
                  <option value="">—</option>
                  {orders.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {(doc.lines as DraftLine[]).map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <div className={whLabel}>Позиція</div>
                  <select
                    className={whInput}
                    value={l.item_id}
                    onChange={(e) => {
                      const lines = [...doc.lines];
                      lines[idx] = { ...l, item_id: e.target.value };
                      setDoc({ ...doc, lines });
                    }}
                  >
                    <option value="">—</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <div className={whLabel}>К-сть</div>
                  <input
                    type="number"
                    step="0.001"
                    className={whInput}
                    value={l.qty}
                    onChange={(e) => {
                      const lines = [...doc.lines];
                      lines[idx] = { ...l, qty: Number(e.target.value) };
                      setDoc({ ...doc, lines });
                    }}
                  />
                </div>
                <div className="col-span-3">
                  <div className={whLabel}>Ціна, грн</div>
                  <input
                    type="number"
                    step="0.01"
                    className={whInput}
                    value={l.price}
                    onChange={(e) => {
                      const lines = [...doc.lines];
                      lines[idx] = { ...l, price: Number(e.target.value) };
                      setDoc({ ...doc, lines });
                    }}
                  />
                </div>
                <button
                  className="col-span-1 p-2 text-destructive"
                  onClick={() =>
                    setDoc({ ...doc, lines: doc.lines.filter((_: any, i: number) => i !== idx) })
                  }
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              className="text-sm text-primary font-semibold"
              onClick={() =>
                setDoc({ ...doc, lines: [...doc.lines, { item_id: "", qty: 1, price: 0 }] })
              }
            >
              + Додати позицію
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="text-sm">
              Сума документа: <b className="text-primary">{formatUah(documentTotal(doc.lines))}</b>
            </div>
            <div className="flex gap-2">
              <button className={`${whBtn} border border-border`} onClick={() => setOpen(false)}>
                Скасувати
              </button>
              <button
                className={`${whBtn} bg-primary text-primary-foreground`}
                disabled={!doc.warehouse_id || saveMut.isPending}
                onClick={() =>
                  saveMut.mutate({
                    ...doc,
                    lines: (doc.lines as DraftLine[]).filter((l) => l.item_id),
                  })
                }
              >
                Зберегти чернетку
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Номер</th>
                <th className="text-left px-3 py-2">Дата</th>
                <th className="text-left px-3 py-2">Тип</th>
                <th className="text-left px-3 py-2">Склад</th>
                <th className="text-left px-3 py-2">Замовлення</th>
                <th className="text-right px-3 py-2">Сума</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {emptyLabel}
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <Fragment key={d.id}>
                <tr className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono text-xs">{d.number}</td>
                  <td className="px-3 py-2 text-xs">{d.doc_date}</td>
                  <td className="px-3 py-2 text-xs">{STOCK_DOC_LABELS[d.doc_type] ?? d.doc_type}</td>
                  <td className="px-3 py-2 text-xs">{d.warehouse?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.order ? `${d.order.number}` : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {formatUah(Number(d.total_cost) || documentTotal(d.lines ?? []))}
                  </td>
                  <td className="px-3 py-2 text-xs">{STOCK_STATUS_LABELS[d.status] ?? d.status}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {d.status === "draft" && (
                      <button
                        className="text-xs text-primary font-semibold inline-flex items-center gap-1"
                        onClick={() => postMut.mutate(d.id)}
                        disabled={postMut.isPending}
                      >
                        <Check className="w-3 h-3" /> Провести
                      </button>
                    )}
                    {d.doc_type === "in" && d.status !== "cancelled" && (
                      <button
                        className="mr-3 text-xs text-primary font-semibold"
                        onClick={() => setFinmapDoc(finmapDoc === d.id ? null : d.id)}
                      >
                        Оплата Finmap
                      </button>
                    )}
                    {d.status === "posted" && (
                      <button
                        className="text-xs text-destructive font-semibold"
                        onClick={() => cancelMut.mutate(d.id)}
                        disabled={cancelMut.isPending}
                      >
                        Скасувати
                      </button>
                    )}
                  </td>
                </tr>
                {finmapDoc === d.id && (
                  <tr className="border-t border-border bg-secondary/20">
                    <td colSpan={8} className="px-3 py-3"><StockDocFinmap docId={d.id} /></td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
