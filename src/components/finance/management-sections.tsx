import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatUah } from "@/lib/screed-calc";
import { Metric, type Period } from "./sections";
import { getServiceEconomics, getPayables, getUpcomingPayments, getManagementKpi } from "@/lib/finance/management.functions";
import { moduleLabel } from "@/lib/modules";

const card = "rounded-2xl border border-border bg-card p-4 shadow-sm";
const thead = "bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground";
const note = "rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground";

const serviceLabel = (key: string) => moduleLabel(key) || key;
const nfmt = (v: number | null, unit?: string | null) =>
  v == null ? "—" : `${v.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

/* --------------------------- Економіка робіт --------------------------- */

export function ServiceEconomicsSection({ period }: { period: Period }) {
  const fn = useServerFn(getServiceEconomics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["fin-service-econ", period.from, period.to],
    queryFn: () => fn({ data: period }),
  });

  if (isLoading) return <div className={note}>Завантаження…</div>;
  if (error) return <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{(error as Error).message}</div>;

  const rows = data?.rows ?? [];
  const un = data?.unallocated ?? { revenue: 0, cost: 0 };

  return (
    <div className="space-y-3">
      <div className={note}>
        Факт із Finmap за розподілом по проєктах і статтях. Собівартість одиниці — зважена
        (сума прямих витрат ÷ сума фактичної кількості), не середнє по обʼєктах.
        Офісний ФОП, маркетинг, податки й банк не входять у пряму собівартість.
      </div>
      {(un.revenue > 0 || un.cost > 0) && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3 text-xs">
          Нерозподілено по напрямках: дохід {formatUah(un.revenue)}, витрати {formatUah(un.cost)} — потребує перевірки.
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 text-left">Напрямок</th>
              <th className="px-3 py-2 text-right">Кількість</th>
              <th className="px-3 py-2 text-right">Виручка</th>
              <th className="px-3 py-2 text-right">Пряма собівартість</th>
              <th className="px-3 py-2 text-right">Собівартість / од.</th>
              <th className="px-3 py-2 text-right">Повна / од.</th>
              <th className="px-3 py-2 text-right">Виручка / од.</th>
              <th className="px-3 py-2 text-right">Валовий прибуток</th>
              <th className="px-3 py-2 text-right">Маржа</th>
              <th className="px-3 py-2 text-right">Обʼєктів</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Немає фактичних операцій за період.</td></tr>}
            {rows.map((r) => (
              <tr key={r.service} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{serviceLabel(r.service)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.hasQuantity ? nfmt(r.quantity, r.unit) : <span className="text-muted-foreground">{r.note}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.directCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.costPerUnit == null ? "—" : formatUah(r.costPerUnit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.fullCostPerUnit == null ? "—" : formatUah(r.fullCostPerUnit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.revenuePerUnit == null ? "—" : formatUah(r.revenuePerUnit)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.grossProfit < 0 ? "text-destructive" : ""}`}>{formatUah(r.grossProfit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.grossMargin == null ? "—" : `${r.grossMargin.toFixed(1)}%`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.objects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------ Кредиторка (постачальники) ------------------------ */

export function SupplierPayablesSection() {
  const fn = useServerFn(getPayables);
  const { data, isLoading, error } = useQuery({ queryKey: ["fin-payables"], queryFn: () => fn() });
  const [tab, setTab] = useState<"suppliers" | "invoices">("suppliers");

  if (isLoading) return <div className={note}>Завантаження…</div>;
  if (error) return <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{(error as Error).message}</div>;

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-3">
      <div className={note}>
        Борг створює зобовʼязання ERP (рахунок постачальника / закупівля). Планова операція Finmap
        підтверджує майбутню оплату, фактична — закриває зобовʼязання. Витрата без зобовʼязання боргу не створює.
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric title="Зобовʼязання" value={formatUah(t?.obligations ?? 0)} />
        <Metric title="Заплановано у Finmap" value={formatUah(t?.scheduled ?? 0)} />
        <Metric title="Фактично сплачено" value={formatUah(t?.paid ?? 0)} />
        <Metric title="Залишок до сплати" value={formatUah(t?.remaining ?? 0)} tone="warn" />
        <Metric title="Прострочено" value={formatUah(t?.overdue ?? 0)} tone={(t?.overdue ?? 0) > 0 ? "bad" : "neutral"} />
      </div>

      <div className="flex gap-2">
        {(["suppliers", "invoices"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {k === "suppliers" ? "Постачальники" : `Рахунки Finmap (${invoices.length})`}
          </button>
        ))}
      </div>

      {tab === "suppliers" ? (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={thead}>
              <tr>
                <th className="px-3 py-2 text-left">Постачальник</th>
                <th className="px-3 py-2 text-right">Зобовʼязання</th>
                <th className="px-3 py-2 text-right">Заплановано</th>
                <th className="px-3 py-2 text-right">Сплачено</th>
                <th className="px-3 py-2 text-right">Залишок</th>
                <th className="px-3 py-2 text-right">Прострочено</th>
                <th className="px-3 py-2 text-right">Остання оплата</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Зобовʼязань перед постачальниками немає.</td></tr>}
              {rows.map((r) => (
                <tr key={r.counterpartyId ?? r.supplier} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{r.supplier}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.obligations)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.scheduled)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatUah(r.remaining)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.overdue > 0 ? "text-destructive" : ""}`}>{formatUah(r.overdue)}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.lastPayment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={thead}>
              <tr>
                <th className="px-3 py-2 text-left">Рахунок</th>
                <th className="px-3 py-2 text-left">Постачальник</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-right">Дата</th>
                <th className="px-3 py-2 text-right">Строк</th>
                <th className="px-3 py-2 text-right">Звірка</th>
              </tr>
            </thead>
            <tbody>
              {!invoices.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Рахунків Finmap немає (або API їх не віддає).</td></tr>}
              {invoices.map((i: any) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{i.number ?? i.finmap_id}</td>
                  <td className="px-3 py-2">{i.counterparty_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(Number(i.amount_uah ?? i.amount) || 0)}</td>
                  <td className="px-3 py-2 text-right text-xs">{i.issue_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">{i.due_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">{i.match_status === "matched" ? "звірено" : i.match_status === "needs_review" ? "потребує перевірки" : "без звʼязку"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Очікувані платежі ------------------------- */

export function UpcomingSection() {
  const fn = useServerFn(getUpcomingPayments);
  const { data, isLoading, error } = useQuery({ queryKey: ["fin-upcoming"], queryFn: () => fn() });
  const [side, setSide] = useState<"receipts" | "payments">("receipts");

  if (isLoading) return <div className={note}>Завантаження…</div>;
  if (error) return <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{(error as Error).message}</div>;

  const list = data?.[side];
  const rows = list?.rows ?? [];

  return (
    <div className="space-y-3">
      <div className={note}>
        Просте зведення: планові операції Finmap + строки за договорами й зобовʼязаннями ERP.
        Прогнозних формул і касового розриву тут немає.
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric title="Надходження 7 днів" value={formatUah(data?.receipts.d7 ?? 0)} tone="good" />
        <Metric title="Надходження 30 днів" value={formatUah(data?.receipts.d30 ?? 0)} tone="good" />
        <Metric title="Надходження цього місяця" value={formatUah(data?.receipts.month ?? 0)} />
        <Metric title="Виплати 7 днів" value={formatUah(data?.payments.d7 ?? 0)} tone="warn" />
        <Metric title="Виплати 30 днів" value={formatUah(data?.payments.d30 ?? 0)} tone="warn" />
        <Metric title="Виплати цього місяця" value={formatUah(data?.payments.month ?? 0)} />
      </div>
      <div className="flex gap-2">
        {(["receipts", "payments"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setSide(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${side === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {k === "receipts" ? "Очікувані надходження" : "Очікувані виплати"}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 text-left">Дата</th>
              <th className="px-3 py-2 text-left">Контрагент</th>
              <th className="px-3 py-2 text-left">Стаття</th>
              <th className="px-3 py-2 text-right">Сума</th>
              <th className="px-3 py-2 text-right">Статус</th>
              <th className="px-3 py-2 text-right">Джерело</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Очікуваних операцій немає.</td></tr>}
            {rows.map((r) => (
              <tr key={`${r.source}-${r.id}`} className="border-t border-border">
                <td className="px-3 py-2 text-xs">{r.date ?? "—"}</td>
                <td className="px-3 py-2">{r.counterparty ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.category ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatUah(r.amount)}</td>
                <td className="px-3 py-2 text-right text-xs">{r.status}</td>
                <td className="px-3 py-2 text-right text-xs">{r.source === "finmap" ? "Finmap (план)" : "ERP"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Канонічні KPI (Overview + Dashboard) ---------------- */

export function ManagementKpiStrip({ period }: { period: Period }) {
  const fn = useServerFn(getManagementKpi);
  const { data } = useQuery({ queryKey: ["fin-kpi", period.from, period.to], queryFn: () => fn({ data: period }) });
  const k = data;
  const items = useMemo(() => ([
    { t: "Гроші на рахунках", v: k?.cashBalance ?? 0 },
    { t: "Дохід (факт)", v: k?.income ?? 0, tone: "good" as const },
    { t: "Витрати (факт)", v: k?.expense ?? 0, tone: "bad" as const },
    { t: "Прибуток", v: k?.profit ?? 0, tone: (k?.profit ?? 0) >= 0 ? ("good" as const) : ("bad" as const) },
    { t: "Дебіторка — залишок", v: k?.receivableRemaining ?? 0 },
    { t: "Дебіторка — прострочено", v: k?.receivableOverdue ?? 0, tone: "bad" as const },
    { t: "Кредиторка — залишок", v: k?.payableRemaining ?? 0 },
    { t: "ФОП нараховано", v: k?.payrollAccrued ?? 0 },
    { t: "ФОП до виплати", v: k?.payrollRemaining ?? 0, tone: "warn" as const },
    { t: "План надходжень 30 днів", v: k?.scheduledReceipts30 ?? 0 },
    { t: "План виплат 30 днів", v: k?.scheduledPayments30 ?? 0 },
  ]), [k]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => <Metric key={i.t} title={i.t} value={formatUah(i.v)} tone={i.tone} />)}
    </div>
  );
}
