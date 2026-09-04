import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Boxes, ArrowLeftRight, ClipboardList, Lock, AlertTriangle, Check, X, Layers, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatUah } from "@/lib/screed-calc";
import { availableQty, documentTotal, isBelowMin, STOCK_DOC_LABELS, STOCK_STATUS_LABELS, WAREHOUSE_KINDS } from "@/lib/warehouse-calc";
import { reservedByUnit } from "@/lib/warehouse-import";
import { MaterialVariantCard } from "@/components/warehouse/MaterialVariantCard";
import { WarehouseImportWizard } from "@/components/warehouse/WarehouseImportWizard";
import {
  listWarehouses, saveWarehouse, listStockItems, saveStockItem,
  listStockDocuments, saveStockDocument, postStockDocument, cancelStockDocument,
  listReservations, deleteReservation,
} from "@/lib/warehouse.functions";
import { listOrders } from "@/lib/orders.functions";

export const Route = createFileRoute("/warehouse")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Склад — TERZI ERP" },
    { name: "description", content: "Склад TERZI: номенклатура, залишки, прихід і видача матеріалів, резерв під замовлення, інвентаризація." },
    { property: "og:title", content: "Склад — TERZI ERP" },
    { property: "og:description", content: "Залишки, рух матеріалів, резерв під замовлення та інвентаризація." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: WarehousePage,
});

const TABS = [
  { key: "stock", label: "Залишки", icon: Boxes },
  { key: "nomenclature", label: "Номенклатура", icon: Layers },
  { key: "docs", label: "Рух матеріалів", icon: ArrowLeftRight },
  { key: "reserve", label: "Резерв", icon: Lock },
  { key: "import", label: "Імпорт і перевірка", icon: Upload },
  { key: "refs", label: "Склади та номенклатура", icon: ClipboardList },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const label = "text-[11px] uppercase tracking-wider text-muted-foreground";
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold";

function WarehousePage() {
  const [tab, setTab] = useState<TabKey>("stock");
  const qc = useQueryClient();

  const whFn = useServerFn(listWarehouses);
  const itemsFn = useServerFn(listStockItems);
  const docsFn = useServerFn(listStockDocuments);
  const resFn = useServerFn(listReservations);
  const ordersFn = useServerFn(listOrders);

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => whFn() });
  const { data: items = [], isLoading } = useQuery({ queryKey: ["stock-items"], queryFn: () => itemsFn() });
  const { data: docs = [] } = useQuery({ queryKey: ["stock-docs"], queryFn: () => docsFn() });
  const { data: reservations = [] } = useQuery({ queryKey: ["stock-reservations"], queryFn: () => resFn({ data: {} }) });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => ordersFn() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-items"] });
    qc.invalidateQueries({ queryKey: ["stock-docs"] });
    qc.invalidateQueries({ queryKey: ["stock-reservations"] });
  };

  const totals = useMemo(() => {
    const rows = items as any[];
    return {
      positions: rows.length,
      value: rows.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.avg_cost) || 0), 0),
      reserved: rows.reduce((s, i) => s + (Number(i.reserved_qty) || 0), 0),
      low: rows.filter((i) => isBelowMin(Number(i.qty) || 0, Number(i.min_qty) || 0)).length,
    };
  }, [items]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
            <Package className="w-7 h-7 text-primary" /> Склад
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Номенклатура, залишки, прихід/видача, резерв під замовлення</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Позицій", String(totals.positions)],
            ["Вартість запасів", formatUah(totals.value)],
            ["У резерві (од.)", totals.reserved.toFixed(2)],
            ["Нижче мінімуму", String(totals.low)],
          ].map(([l, v]) => (
            <div key={l as string} className="bg-card border border-border rounded-lg p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>
              <div className="text-xl font-black mt-1 text-primary">{v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap border-b border-border">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {tab === "stock" && <StockTab items={items as any[]} isLoading={isLoading} />}
        {tab === "docs" && <DocsTab docs={docs as any[]} items={items as any[]} warehouses={warehouses as any[]} orders={orders as any[]} onChange={invalidate} />}
        {tab === "reserve" && <ReserveTab rows={reservations as any[]} onChange={invalidate} />}
        {tab === "refs" && <RefsTab warehouses={warehouses as any[]} items={items as any[]} onChange={() => { qc.invalidateQueries({ queryKey: ["warehouses"] }); invalidate(); }} />}
      </div>
    </AppShell>
  );
}

function StockTab({ items, isLoading }: { items: any[]; isLoading: boolean }) {
  const [q, setQ] = useState("");
  const rows = items.filter((i) => !q || `${i.name} ${i.sku ?? ""} ${i.category ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук по номенклатурі…" className={`${input} max-w-md`} />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Позиція</th>
                <th className="text-left px-3 py-2">Категорія</th>
                <th className="text-right px-3 py-2">Залишок</th>
                <th className="text-right px-3 py-2">Резерв</th>
                <th className="text-right px-3 py-2">Вільно</th>
                <th className="text-right px-3 py-2">Сер. собівартість</th>
                <th className="text-right px-3 py-2">Вартість</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Завантаження…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Номенклатура порожня — додайте позиції у вкладці «Склади та номенклатура».</td></tr>}
              {rows.map((i) => {
                const low = isBelowMin(Number(i.qty) || 0, Number(i.min_qty) || 0);
                return (
                  <tr key={i.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2">
                      <div className="font-semibold flex items-center gap-2">
                        {low && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}{i.name}
                      </div>
                      {i.sku && <div className="text-[11px] text-muted-foreground font-mono">{i.sku}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{Number(i.qty).toFixed(2)} {i.unit}</td>
                    <td className="px-3 py-2 text-right text-warning">{Number(i.reserved_qty).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{availableQty(i).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{formatUah(Number(i.avg_cost) || 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatUah((Number(i.qty) || 0) * (Number(i.avg_cost) || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type DraftLine = { item_id: string; qty: number; price: number };

function DocsTab({ docs, items, warehouses, orders, onChange }: { docs: any[]; items: any[]; warehouses: any[]; orders: any[]; onChange: () => void }) {
  const save = useServerFn(saveStockDocument);
  const post = useServerFn(postStockDocument);
  const cancel = useServerFn(cancelStockDocument);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<any>(null);

  const emptyDoc = () => ({
    doc_type: "in" as const,
    doc_date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouses[0]?.id ?? "",
    target_warehouse_id: null,
    order_id: null,
    supplier: "",
    note: "",
    lines: [] as DraftLine[],
  });

  const saveMut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => { toast.success("Документ збережено"); setOpen(false); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const postMut = useMutation({
    mutationFn: (id: string) => post({ data: { id } }),
    onSuccess: () => { toast.success("Документ проведено — залишки оновлено"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося провести"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => { toast.success("Документ скасовано"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося скасувати"),
  });

  return (
    <div className="space-y-3">
      <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => { setDoc(emptyDoc()); setOpen(true); }}>
        <Plus className="w-4 h-4" /> Новий документ
      </button>

      {open && doc && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div><div className={label}>Тип</div>
              <select className={input} value={doc.doc_type} onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}>
                {Object.entries(STOCK_DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><div className={label}>Дата</div>
              <input type="date" className={input} value={doc.doc_date} onChange={(e) => setDoc({ ...doc, doc_date: e.target.value })} />
            </div>
            <div><div className={label}>Склад</div>
              <select className={input} value={doc.warehouse_id} onChange={(e) => setDoc({ ...doc, warehouse_id: e.target.value })}>
                <option value="">—</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {doc.doc_type === "transfer" ? (
              <div><div className={label}>Склад-отримувач</div>
                <select className={input} value={doc.target_warehouse_id ?? ""} onChange={(e) => setDoc({ ...doc, target_warehouse_id: e.target.value || null })}>
                  <option value="">—</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            ) : (
              <div><div className={label}>Замовлення</div>
                <select className={input} value={doc.order_id ?? ""} onChange={(e) => setDoc({ ...doc, order_id: e.target.value || null })}>
                  <option value="">—</option>
                  {orders.map((o: any) => <option key={o.id} value={o.id}>{o.number} · {o.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {(doc.lines as DraftLine[]).map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6"><div className={label}>Позиція</div>
                  <select className={input} value={l.item_id} onChange={(e) => {
                    const lines = [...doc.lines]; lines[idx] = { ...l, item_id: e.target.value }; setDoc({ ...doc, lines });
                  }}>
                    <option value="">—</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div className="col-span-2"><div className={label}>К-сть</div>
                  <input type="number" step="0.001" className={input} value={l.qty}
                    onChange={(e) => { const lines = [...doc.lines]; lines[idx] = { ...l, qty: Number(e.target.value) }; setDoc({ ...doc, lines }); }} />
                </div>
                <div className="col-span-3"><div className={label}>Ціна, грн</div>
                  <input type="number" step="0.01" className={input} value={l.price}
                    onChange={(e) => { const lines = [...doc.lines]; lines[idx] = { ...l, price: Number(e.target.value) }; setDoc({ ...doc, lines }); }} />
                </div>
                <button className="col-span-1 p-2 text-destructive" onClick={() => setDoc({ ...doc, lines: doc.lines.filter((_: any, i: number) => i !== idx) })}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button className="text-sm text-primary font-semibold" onClick={() => setDoc({ ...doc, lines: [...doc.lines, { item_id: "", qty: 1, price: 0 }] })}>
              + Додати позицію
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="text-sm">Сума документа: <b className="text-primary">{formatUah(documentTotal(doc.lines))}</b></div>
            <div className="flex gap-2">
              <button className={`${btn} border border-border`} onClick={() => setOpen(false)}>Скасувати</button>
              <button className={`${btn} bg-primary text-primary-foreground`} disabled={!doc.warehouse_id || saveMut.isPending}
                onClick={() => saveMut.mutate({ ...doc, lines: (doc.lines as DraftLine[]).filter((l) => l.item_id) })}>
                Зберегти чернетку
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
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
              {docs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Документів ще немає.</td></tr>}
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono text-xs">{d.number}</td>
                  <td className="px-3 py-2 text-xs">{d.doc_date}</td>
                  <td className="px-3 py-2 text-xs">{STOCK_DOC_LABELS[d.doc_type] ?? d.doc_type}</td>
                  <td className="px-3 py-2 text-xs">{d.warehouse?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.order ? `${d.order.number}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{formatUah(Number(d.total_cost) || documentTotal(d.lines ?? []))}</td>
                  <td className="px-3 py-2 text-xs">{STOCK_STATUS_LABELS[d.status] ?? d.status}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {d.status === "draft" && (
                      <button className="text-xs text-primary font-semibold inline-flex items-center gap-1"
                        onClick={() => postMut.mutate(d.id)} disabled={postMut.isPending}>
                        <Check className="w-3 h-3" /> Провести
                      </button>
                    )}
                    {d.status === "posted" && (
                      <button className="text-xs text-destructive font-semibold" onClick={() => cancelMut.mutate(d.id)} disabled={cancelMut.isPending}>
                        Скасувати
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReserveTab({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const del = useServerFn(deleteReservation);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Резерв знято"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Замовлення</th>
              <th className="text-left px-3 py-2">Позиція</th>
              <th className="text-left px-3 py-2">Склад</th>
              <th className="text-right px-3 py-2">Зарезервовано</th>
              <th className="text-right px-3 py-2">Видано</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Резервів немає. Резерв створюється з картки замовлення.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-3 py-2 text-xs">{r.order ? `${r.order.number} · ${r.order.name}` : "—"}</td>
                <td className="px-3 py-2">{r.item?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.warehouse?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right">{Number(r.qty).toFixed(2)} {r.item?.unit}</td>
                <td className="px-3 py-2 text-right">{Number(r.issued_qty ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-xs">{r.status}</td>
                <td className="px-3 py-2 text-right">
                  <button className="text-xs text-destructive font-semibold" onClick={() => delMut.mutate(r.id)}>Зняти</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RefsTab({ warehouses, items, onChange }: { warehouses: any[]; items: any[]; onChange: () => void }) {
  const saveWh = useServerFn(saveWarehouse);
  const saveItem = useServerFn(saveStockItem);
  const [wh, setWh] = useState({ name: "", kind: "main", address: "" });
  const [it, setIt] = useState({ name: "", sku: "", unit: "шт", category: "", min_qty: 0 });

  const whMut = useMutation({
    mutationFn: () => saveWh({ data: { name: wh.name, kind: wh.kind, address: wh.address || null } }),
    onSuccess: () => { toast.success("Склад збережено"); setWh({ name: "", kind: "main", address: "" }); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const itMut = useMutation({
    mutationFn: () => saveItem({ data: { name: it.name, sku: it.sku || null, unit: it.unit, category: it.category || null, min_qty: Number(it.min_qty) || 0 } }),
    onSuccess: () => { toast.success("Позицію додано"); setIt({ name: "", sku: "", unit: "шт", category: "", min_qty: 0 }); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-bold">Склади</h2>
        <div className="space-y-1 text-sm">
          {warehouses.map((w) => (
            <div key={w.id} className="flex justify-between border-b border-border/50 py-1.5">
              <span className="font-semibold">{w.name}</span>
              <span className="text-xs text-muted-foreground">{WAREHOUSE_KINDS[w.kind] ?? w.kind}</span>
            </div>
          ))}
          {warehouses.length === 0 && <div className="text-xs text-muted-foreground">Складів ще немає.</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Назва складу" value={wh.name} onChange={(e) => setWh({ ...wh, name: e.target.value })} />
          <select className={input} value={wh.kind} onChange={(e) => setWh({ ...wh, kind: e.target.value })}>
            {Object.entries(WAREHOUSE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className={`${input} col-span-2`} placeholder="Адреса" value={wh.address} onChange={(e) => setWh({ ...wh, address: e.target.value })} />
        </div>
        <button className={`${btn} bg-primary text-primary-foreground`} disabled={!wh.name || whMut.isPending} onClick={() => whMut.mutate()}>
          <Plus className="w-4 h-4" /> Додати склад
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-bold">Нова позиція номенклатури</h2>
        <div className="grid grid-cols-2 gap-2">
          <input className={`${input} col-span-2`} placeholder="Назва" value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} />
          <input className={input} placeholder="Артикул" value={it.sku} onChange={(e) => setIt({ ...it, sku: e.target.value })} />
          <input className={input} placeholder="Одиниця" value={it.unit} onChange={(e) => setIt({ ...it, unit: e.target.value })} />
          <input className={input} placeholder="Категорія" value={it.category} onChange={(e) => setIt({ ...it, category: e.target.value })} />
          <input className={input} type="number" step="0.01" placeholder="Мін. запас" value={it.min_qty} onChange={(e) => setIt({ ...it, min_qty: Number(e.target.value) })} />
        </div>
        <button className={`${btn} bg-primary text-primary-foreground`} disabled={!it.name || itMut.isPending} onClick={() => itMut.mutate()}>
          <Plus className="w-4 h-4" /> Додати позицію
        </button>
        <div className="text-xs text-muted-foreground">Усього позицій: {items.length}</div>
      </div>
    </div>
  );
}
