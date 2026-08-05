import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wallet, Plus, Receipt, ArrowDownCircle, PieChart, Landmark, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatUah } from "@/lib/screed-calc";
import {
  ACCOUNT_KINDS, EXPENSE_CATEGORIES, INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS,
  debt, invoiceTotal, paidSum,
} from "@/lib/finance-calc";
import {
  listAccounts, saveAccount, listInvoices, saveInvoice,
  listPayments, savePayment, deletePayment,
  listExpenses, saveExpense, deleteExpense, getOrderPnl,
} from "@/lib/finance.functions";
import { listOrders } from "@/lib/orders.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/finance")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Фінанси — TERZI ERP" },
    { name: "description", content: "Фінанси TERZI: рахунки на оплату, платежі, витрати, каса компанії та P&L по замовленнях." },
    { property: "og:title", content: "Фінанси — TERZI ERP" },
    { property: "og:description", content: "Рахунки, оплати, витрати та прибутковість замовлень." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: FinancePage,
});

const TABS = [
  { key: "invoices", label: "Рахунки", icon: Receipt },
  { key: "payments", label: "Платежі", icon: Wallet },
  { key: "expenses", label: "Витрати", icon: ArrowDownCircle },
  { key: "pnl", label: "P&L по замовленню", icon: PieChart },
  { key: "accounts", label: "Каса та рахунки", icon: Landmark },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const label = "text-[11px] uppercase tracking-wider text-muted-foreground";
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold";
const today = () => new Date().toISOString().slice(0, 10);

function FinancePage() {
  const [tab, setTab] = useState<TabKey>("invoices");
  const qc = useQueryClient();

  const accFn = useServerFn(listAccounts);
  const invFn = useServerFn(listInvoices);
  const payFn = useServerFn(listPayments);
  const expFn = useServerFn(listExpenses);
  const ordersFn = useServerFn(listOrders);
  const clientsFn = useServerFn(listClients);

  const { data: accounts = [] } = useQuery({ queryKey: ["fin-accounts"], queryFn: () => accFn() });
  const { data: invoices = [] } = useQuery({ queryKey: ["fin-invoices"], queryFn: () => invFn() });
  const { data: payments = [] } = useQuery({ queryKey: ["fin-payments"], queryFn: () => payFn() });
  const { data: expenses = [] } = useQuery({ queryKey: ["fin-expenses"], queryFn: () => expFn() });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => ordersFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const invalidate = () => {
    for (const k of ["fin-accounts", "fin-invoices", "fin-payments", "fin-expenses"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const kpi = useMemo(() => {
    const inv = invoices as any[];
    const totalInvoiced = inv.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalPaid = paidSum((payments as any[]).map((p) => ({ amount: Number(p.amount) || 0, direction: p.direction })));
    const totalExpenses = (expenses as any[]).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      invoiced: totalInvoiced,
      paid: totalPaid,
      debt: debt(totalInvoiced, inv.reduce((s, i) => s + (Number(i.paid) || 0), 0)),
      profit: totalPaid - totalExpenses,
    };
  }, [invoices, payments, expenses]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" /> Фінанси
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Рахунки, оплати, витрати та прибутковість замовлень</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Виставлено", formatUah(kpi.invoiced)],
            ["Отримано", formatUah(kpi.paid)],
            ["Дебіторка", formatUah(kpi.debt)],
            ["Грошовий результат", formatUah(kpi.profit)],
          ].map(([l, v]) => (
            <div key={l} className="bg-card border border-border rounded-lg p-4">
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

        {tab === "invoices" && <InvoicesTab invoices={invoices as any[]} orders={orders as any[]} clients={clients as any[]} onChange={invalidate} />}
        {tab === "payments" && <PaymentsTab rows={payments as any[]} invoices={invoices as any[]} orders={orders as any[]} accounts={accounts as any[]} onChange={invalidate} />}
        {tab === "expenses" && <ExpensesTab rows={expenses as any[]} orders={orders as any[]} accounts={accounts as any[]} onChange={invalidate} />}
        {tab === "pnl" && <PnlTab orders={orders as any[]} />}
        {tab === "accounts" && <AccountsTab accounts={accounts as any[]} onChange={invalidate} />}
      </div>
    </AppShell>
  );
}

type Line = { name: string; unit: string; qty: number; price: number };

function InvoicesTab({ invoices, orders, clients, onChange }: { invoices: any[]; orders: any[]; clients: any[]; onChange: () => void }) {
  const save = useServerFn(saveInvoice);
  const [form, setForm] = useState<any>(null);
  const mut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => { toast.success("Рахунок збережено"); setForm(null); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="space-y-3">
      <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => setForm({
        order_id: null, client_id: null, kind: "stage", status: "issued",
        issue_date: today(), due_date: null, note: "", lines: [] as Line[],
      })}>
        <Plus className="w-4 h-4" /> Новий рахунок
      </button>

      {form && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div><div className={label}>Замовлення</div>
              <select className={input} value={form.order_id ?? ""} onChange={(e) => {
                const o = orders.find((x) => x.id === e.target.value);
                setForm({ ...form, order_id: e.target.value || null, client_id: o?.client_id ?? form.client_id });
              }}>
                <option value="">—</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.name}</option>)}
              </select>
            </div>
            <div><div className={label}>Клієнт</div>
              <select className={input} value={form.client_id ?? ""} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}>
                <option value="">—</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><div className={label}>Тип</div>
              <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(INVOICE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><div className={label}>Дата виставлення</div>
              <input type="date" className={input} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            {(form.lines as Line[]).map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><div className={label}>Найменування</div>
                  <input className={input} value={l.name} onChange={(e) => { const lines = [...form.lines]; lines[idx] = { ...l, name: e.target.value }; setForm({ ...form, lines }); }} />
                </div>
                <div className="col-span-2"><div className={label}>Од.</div>
                  <input className={input} value={l.unit} onChange={(e) => { const lines = [...form.lines]; lines[idx] = { ...l, unit: e.target.value }; setForm({ ...form, lines }); }} />
                </div>
                <div className="col-span-2"><div className={label}>К-сть</div>
                  <input type="number" step="0.01" className={input} value={l.qty} onChange={(e) => { const lines = [...form.lines]; lines[idx] = { ...l, qty: Number(e.target.value) }; setForm({ ...form, lines }); }} />
                </div>
                <div className="col-span-2"><div className={label}>Ціна</div>
                  <input type="number" step="0.01" className={input} value={l.price} onChange={(e) => { const lines = [...form.lines]; lines[idx] = { ...l, price: Number(e.target.value) }; setForm({ ...form, lines }); }} />
                </div>
                <button className="col-span-1 p-2 text-destructive" onClick={() => setForm({ ...form, lines: form.lines.filter((_: any, i: number) => i !== idx) })}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button className="text-sm text-primary font-semibold" onClick={() => setForm({ ...form, lines: [...form.lines, { name: "", unit: "шт", qty: 1, price: 0 }] })}>
              + Додати позицію
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-sm">Сума: <b className="text-primary">{formatUah(invoiceTotal(form.lines))}</b></div>
            <div className="flex gap-2">
              <button className={`${btn} border border-border`} onClick={() => setForm(null)}>Скасувати</button>
              <button className={`${btn} bg-primary text-primary-foreground`} disabled={mut.isPending}
                onClick={() => mut.mutate({ ...form, lines: (form.lines as Line[]).filter((l) => l.name) })}>
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Номер</th>
                <th className="text-left px-3 py-2">Дата</th>
                <th className="text-left px-3 py-2">Замовлення</th>
                <th className="text-left px-3 py-2">Клієнт</th>
                <th className="text-left px-3 py-2">Тип</th>
                <th className="text-right px-3 py-2">Сума</th>
                <th className="text-right px-3 py-2">Оплачено</th>
                <th className="text-right px-3 py-2">Борг</th>
                <th className="text-left px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Рахунків ще немає.</td></tr>}
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono text-xs">{i.number}</td>
                  <td className="px-3 py-2 text-xs">{i.issue_date}</td>
                  <td className="px-3 py-2 text-xs">{i.order?.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{i.client?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{INVOICE_KIND_LABELS[i.kind] ?? i.kind}</td>
                  <td className="px-3 py-2 text-right">{formatUah(Number(i.total) || 0)}</td>
                  <td className="px-3 py-2 text-right text-success">{formatUah(Number(i.paid) || 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatUah(debt(Number(i.total) || 0, Number(i.paid) || 0))}</td>
                  <td className="px-3 py-2 text-xs">{INVOICE_STATUS_LABELS[i.status] ?? i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ rows, invoices, orders, accounts, onChange }: { rows: any[]; invoices: any[]; orders: any[]; accounts: any[]; onChange: () => void }) {
  const save = useServerFn(savePayment);
  const del = useServerFn(deletePayment);
  const [form, setForm] = useState<any>(null);
  const mut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => { toast.success("Платіж збережено"); setForm(null); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Платіж видалено"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="space-y-3">
      <button className={`${btn} bg-primary text-primary-foreground`}
        onClick={() => setForm({ invoice_id: null, order_id: null, account_id: accounts[0]?.id ?? null, direction: "in", amount: 0, paid_at: today(), method: "", note: "" })}>
        <Plus className="w-4 h-4" /> Новий платіж
      </button>

      {form && (
        <div className="bg-card border border-border rounded-lg p-4 grid md:grid-cols-6 gap-3 items-end">
          <div><div className={label}>Рахунок (інвойс)</div>
            <select className={input} value={form.invoice_id ?? ""} onChange={(e) => {
              const inv = invoices.find((x) => x.id === e.target.value);
              setForm({ ...form, invoice_id: e.target.value || null, order_id: inv?.order_id ?? form.order_id });
            }}>
              <option value="">—</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}
            </select>
          </div>
          <div><div className={label}>Замовлення</div>
            <select className={input} value={form.order_id ?? ""} onChange={(e) => setForm({ ...form, order_id: e.target.value || null })}>
              <option value="">—</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
            </select>
          </div>
          <div><div className={label}>Каса / рахунок</div>
            <select className={input} value={form.account_id ?? ""} onChange={(e) => setForm({ ...form, account_id: e.target.value || null })}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><div className={label}>Напрям</div>
            <select className={input} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="in">Надходження</option>
              <option value="out">Виплата</option>
            </select>
          </div>
          <div><div className={label}>Сума, грн</div>
            <input type="number" step="0.01" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div><div className={label}>Дата</div>
            <input type="date" className={input} value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end">
            <button className={`${btn} border border-border`} onClick={() => setForm(null)}>Скасувати</button>
            <button className={`${btn} bg-primary text-primary-foreground`} disabled={mut.isPending} onClick={() => mut.mutate(form)}>Зберегти</button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Дата</th>
                <th className="text-left px-3 py-2">Рахунок</th>
                <th className="text-left px-3 py-2">Замовлення</th>
                <th className="text-left px-3 py-2">Каса</th>
                <th className="text-left px-3 py-2">Напрям</th>
                <th className="text-right px-3 py-2">Сума</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Платежів ще немає.</td></tr>}
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 text-xs">{p.paid_at}</td>
                  <td className="px-3 py-2 text-xs font-mono">{p.invoice?.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.order?.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.account?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.direction === "in" ? "Надходження" : "Виплата"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${p.direction === "in" ? "text-success" : "text-destructive"}`}>{formatUah(Number(p.amount) || 0)}</td>
                  <td className="px-3 py-2 text-right"><button className="text-xs text-destructive" onClick={() => delMut.mutate(p.id)}>Видалити</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpensesTab({ rows, orders, accounts, onChange }: { rows: any[]; orders: any[]; accounts: any[]; onChange: () => void }) {
  const save = useServerFn(saveExpense);
  const del = useServerFn(deleteExpense);
  const [form, setForm] = useState<any>(null);
  const mut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => { toast.success("Витрату збережено"); setForm(null); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Витрату видалено"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="space-y-3">
      <button className={`${btn} bg-primary text-primary-foreground`}
        onClick={() => setForm({ order_id: null, account_id: accounts[0]?.id ?? null, category: "materials", name: "", amount: 0, spent_at: today(), supplier: "" })}>
        <Plus className="w-4 h-4" /> Нова витрата
      </button>

      {form && (
        <div className="bg-card border border-border rounded-lg p-4 grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2"><div className={label}>Опис</div>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><div className={label}>Категорія</div>
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div><div className={label}>Замовлення</div>
            <select className={input} value={form.order_id ?? ""} onChange={(e) => setForm({ ...form, order_id: e.target.value || null })}>
              <option value="">—</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
            </select>
          </div>
          <div><div className={label}>Сума, грн</div>
            <input type="number" step="0.01" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div><div className={label}>Дата</div>
            <input type="date" className={input} value={form.spent_at} onChange={(e) => setForm({ ...form, spent_at: e.target.value })} />
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end">
            <button className={`${btn} border border-border`} onClick={() => setForm(null)}>Скасувати</button>
            <button className={`${btn} bg-primary text-primary-foreground`} disabled={!form.name || mut.isPending} onClick={() => mut.mutate(form)}>Зберегти</button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Дата</th>
                <th className="text-left px-3 py-2">Опис</th>
                <th className="text-left px-3 py-2">Категорія</th>
                <th className="text-left px-3 py-2">Замовлення</th>
                <th className="text-right px-3 py-2">Сума</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Витрат ще немає.</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 text-xs">{e.spent_at}</td>
                  <td className="px-3 py-2">{e.name}</td>
                  <td className="px-3 py-2 text-xs">{EXPENSE_CATEGORIES.find((c) => c.key === e.category)?.label ?? e.category}</td>
                  <td className="px-3 py-2 text-xs">{e.order?.number ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-destructive">{formatUah(Number(e.amount) || 0)}</td>
                  <td className="px-3 py-2 text-right"><button className="text-xs text-destructive" onClick={() => delMut.mutate(e.id)}>Видалити</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PnlTab({ orders }: { orders: any[] }) {
  const [orderId, setOrderId] = useState<string>("");
  const pnlFn = useServerFn(getOrderPnl);
  const { data: pnl } = useQuery({
    queryKey: ["order-pnl", orderId],
    queryFn: () => pnlFn({ data: { order_id: orderId } }),
    enabled: !!orderId,
  });

  return (
    <div className="space-y-4">
      <select className={`${input} max-w-md`} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
        <option value="">Оберіть замовлення…</option>
        {orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.name}</option>)}
      </select>

      {pnl && (
        <div className="grid md:grid-cols-3 gap-3">
          {[
            ["Виручка (план з кошторисів)", formatUah(pnl.revenuePlan)],
            ["Виручка (факт, оплати)", formatUah(pnl.revenueFact)],
            ["Виставлено рахунків", formatUah(pnl.invoiced)],
            ["Собівартість (план)", formatUah(pnl.costPlan)],
            ["Витрати (факт)", formatUah(pnl.costFact)],
            ["Відхилення прибутку", formatUah(pnl.deviation)],
            ["Прибуток (план)", formatUah(pnl.profitPlan)],
            ["Прибуток (факт)", formatUah(pnl.profitFact)],
            ["Маржа план / факт", `${pnl.marginPlan.toFixed(1)}% / ${pnl.marginFact.toFixed(1)}%`],
          ].map(([l, v]) => (
            <div key={l} className="bg-card border border-border rounded-lg p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>
              <div className="text-lg font-black mt-1 text-primary">{v}</div>
            </div>
          ))}
        </div>
      )}
      {!orderId && <div className="text-sm text-muted-foreground">Оберіть замовлення, щоб побачити план-факт прибутковості.</div>}
    </div>
  );
}

function AccountsTab({ accounts, onChange }: { accounts: any[]; onChange: () => void }) {
  const save = useServerFn(saveAccount);
  const [form, setForm] = useState({ name: "", kind: "bank", opening_balance: 0 });
  const mut = useMutation({
    mutationFn: () => save({ data: { name: form.name, kind: form.kind as any, opening_balance: Number(form.opening_balance) || 0 } }),
    onSuccess: () => { toast.success("Рахунок збережено"); setForm({ name: "", kind: "bank", opening_balance: 0 }); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <h2 className="font-bold">Каси та рахунки</h2>
        {accounts.length === 0 && <div className="text-xs text-muted-foreground">Рахунків ще немає.</div>}
        {accounts.map((a) => (
          <div key={a.id} className="flex justify-between items-center border-b border-border/50 py-2">
            <div>
              <div className="font-semibold text-sm">{a.name}</div>
              <div className="text-[11px] text-muted-foreground">{ACCOUNT_KINDS[a.kind] ?? a.kind}</div>
            </div>
            <div className="font-black text-primary">{formatUah(Number(a.balance) || 0)}</div>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-bold">Новий рахунок</h2>
        <input className={input} placeholder="Назва" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          {Object.entries(ACCOUNT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" step="0.01" className={input} placeholder="Початковий залишок" value={form.opening_balance}
          onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} />
        <button className={`${btn} bg-primary text-primary-foreground`} disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>
          <Plus className="w-4 h-4" /> Додати
        </button>
      </div>
    </div>
  );
}
