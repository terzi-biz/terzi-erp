import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  RefreshCw, PlugZap, CheckCircle2, AlertTriangle, Link2, ArrowRight, Calculator, ShieldCheck,
} from "lucide-react";

import { formatUah } from "@/lib/screed-calc";
import {
  getFinanceOverview, listFinanceTransactions, getFinmapStatus, testFinmapConnection,
  runFinmapSyncNow, listFinmapMappings, saveFinmapMapping, suggestTransactionLinks,
  linkFinanceTransaction, getPlanFact,
} from "@/lib/finance/finmap.functions";
import {
  listPayrollProfiles, savePayrollProfile, calculatePayrollPeriod, listPayrollCalculations,
  setPayrollKpiFact, setPayrollStatus, reconcilePayrollPayments,
} from "@/lib/finance/payroll.functions";
import { payrollScheduleFor } from "@/lib/finance/payroll-engine";

export const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
export const label = "text-[11px] uppercase tracking-wider text-muted-foreground";
export const btn = "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
const card = "rounded-2xl border border-border bg-card p-4 shadow-sm";

export type Period = { from: string; to: string };

export function Metric({ title, value, hint, tone = "neutral", onClick }: {
  title: string; value: string; hint?: string; tone?: "neutral" | "good" | "bad" | "warn"; onClick?: () => void;
}) {
  const cls = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-primary" : "";
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`${card} text-left ${onClick ? "hover:border-primary/60" : ""}`}>
      <div className={label}>{title}</div>
      <div className={`mt-1 text-xl font-black tabular-nums ${cls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}

/* ------------------------------- 1. Огляд ------------------------------- */

export function OverviewSection({ period, onDrill }: { period: Period; onDrill: (kind: "all" | "income" | "expense" | "transfer") => void }) {
  const fn = useServerFn(getFinanceOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["fin-overview", period.from, period.to],
    queryFn: () => fn({ data: { ...period, kind: "all", match_status: "all", limit: 200, offset: 0 } as any }),
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Завантаження зведення…</div>;
  if (error) return <div className={`${card} text-sm text-destructive`}>{(error as any)?.message ?? "Помилка"}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric title="Гроші на рахунках" value={formatUah(data.cashOnAccounts)} hint="Фактичні залишки з Finmap" />
        <Metric title="Доходи періоду" value={formatUah(data.income)} tone="good" onClick={() => onDrill("income")} />
        <Metric title="Витрати періоду" value={formatUah(data.expense)} tone="bad" onClick={() => onDrill("expense")} />
        <Metric title="Cash Flow" value={formatUah(data.cashFlow)} tone={data.cashFlow >= 0 ? "good" : "bad"} onClick={() => onDrill("all")} />
        <Metric title="Дебіторка" value={formatUah(data.receivable)} tone="warn" hint={`Прострочено: ${formatUah(data.overdue)}`} />
        <Metric title="Кредиторка (ФОП)" value={formatUah(data.payable)} tone="warn" />
        <Metric title="Валовий прибуток" value={formatUah(data.grossProfit)} tone={data.grossProfit >= 0 ? "good" : "bad"} />
        <Metric title="Маржа" value={`${data.margin.toFixed(1)} %`} />
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Рахунки та залишки</h3>
          <span className="text-xs text-muted-foreground">Операцій у періоді: {data.transactions} · без зв'язку: {data.unmatched}</span>
        </div>
        <div className="mt-3 divide-y divide-border/60">
          {(data.accounts as any[]).length === 0 && <div className="py-4 text-sm text-muted-foreground">Рахунки ще не синхронізовані з Finmap.</div>}
          {(data.accounts as any[]).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {a.currency} · {a.source === "finmap" ? "Finmap" : "ERP"}
                  {a.balance_synced_at ? ` · оновлено ${new Date(a.balance_synced_at).toLocaleString("uk-UA")}` : ""}
                </div>
              </div>
              <div className="font-black tabular-nums text-primary">{formatUah(Number(a.actual_balance ?? a.opening_balance) || 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- 2. Операції ---------------------------- */

const KIND_TABS = [
  { key: "all", label: "Усі" },
  { key: "income", label: "Доходи" },
  { key: "expense", label: "Витрати" },
  { key: "transfer", label: "Перекази" },
] as const;

export function OperationsSection({ period, initialKind = "all" }: { period: Period; initialKind?: "all" | "income" | "expense" | "transfer" }) {
  const [kind, setKind] = useState<"all" | "income" | "expense" | "transfer">(initialKind);
  const [search, setSearch] = useState("");
  const [matchStatus, setMatchStatus] = useState<"all" | "matched" | "unmatched">("all");
  const fn = useServerFn(listFinanceTransactions);
  const { data, isLoading } = useQuery({
    queryKey: ["fin-tx", period.from, period.to, kind, search, matchStatus],
    queryFn: () => fn({ data: { ...period, kind, match_status: matchStatus, search: search || undefined, limit: 200, offset: 0 } as any }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {KIND_TABS.map((t) => (
          <button key={t.key} onClick={() => setKind(t.key)}
            className={`${btn} border ${kind === t.key ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            {t.label}
          </button>
        ))}
        <input className={`${input} max-w-xs`} placeholder="Пошук у коментарях…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${input} max-w-[200px]`} value={matchStatus} onChange={(e) => setMatchStatus(e.target.value as any)}>
          <option value="all">Усі зв'язки</option>
          <option value="matched">Пов'язані</option>
          <option value="unmatched">Без зв'язку</option>
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Тип</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-left">Рахунок</th>
                <th className="px-3 py-2 text-left">Контрагент</th>
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Замовлення</th>
                <th className="px-3 py-2 text-left">Коментар</th>
                <th className="px-3 py-2 text-left">Джерело</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Завантаження…</td></tr>}
              {!isLoading && !(data?.rows ?? []).length && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Операцій за період немає. Виконайте синхронізацію з Finmap.</td></tr>
              )}
              {((data?.rows ?? []) as any[]).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 text-xs tabular-nums">{r.op_date}</td>
                  <td className="px-3 py-2 text-xs">{r.kind === "income" ? "Дохід" : r.kind === "expense" ? "Витрата" : "Переказ"}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.kind === "income" ? "text-success" : r.kind === "expense" ? "text-destructive" : ""}`}>
                    {formatUah(Number(r.amount_uah ?? r.amount) || 0)}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.account?.name ?? "—"}{r.to_account?.name ? ` → ${r.to_account.name}` : ""}</td>
                  <td className="px-3 py-2 text-xs">{r.counterparty?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.category?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.order?.number ? <Link to="/orders/$id" params={{ id: r.order_id }} className="text-primary">{r.order.number}</Link> : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[240px] truncate">{r.comment ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">{r.source === "finmap" ? "Finmap" : "ERP"} · {r.match_status === "matched" ? "зв'язано" : "без зв'язку"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">Усього: {data?.total ?? 0}. Переказ між власними рахунками не впливає на прибуток.</div>
    </div>
  );
}

/* ---------------------------- 7. План / факт ---------------------------- */

const ARTICLE_LABELS: Record<string, string> = {
  revenue: "Виручка", materials: "Матеріали", labour: "Роботи / ФОП", logistics: "Логістика",
  equipment: "Обладнання", subcontract: "Підряд", marketing: "Маркетинг",
  administration: "Адміністративні", other: "Інше",
};

export function PlanFactSection({ period }: { period: Period }) {
  const fn = useServerFn(getPlanFact);
  const { data = [], isLoading } = useQuery({
    queryKey: ["fin-planfact", period.from, period.to],
    queryFn: () => fn({ data: { ...period, kind: "all", match_status: "all", limit: 200, offset: 0 } as any }),
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Розрахунок план/факт…</div>;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Стаття</th>
            <th className="px-3 py-2 text-right">План</th>
            <th className="px-3 py-2 text-right">Факт</th>
            <th className="px-3 py-2 text-right">Відхилення</th>
            <th className="px-3 py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {(data as any[]).map((r) => (
            <tr key={r.article} className="border-t border-border">
              <td className="px-3 py-2 font-semibold">{ARTICLE_LABELS[r.article] ?? r.article}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.plan)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.actual)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.variance >= 0 ? "text-success" : "text-destructive"}`}>{formatUah(r.variance)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.variancePercent == null ? "—" : `${r.variancePercent.toFixed(1)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        План — із незмінних знімків кошторисів періоду. Факт — операції Finmap. Плановий і фактичний контури зберігаються окремо.
      </div>
    </div>
  );
}

/* ------------------------------ 10. Звірка ------------------------------ */

export function ReconcileSection({ period }: { period: Period }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFinanceTransactions);
  const suggestFn = useServerFn(suggestTransactionLinks);
  const linkFn = useServerFn(linkFinanceTransaction);
  const [active, setActive] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["fin-unmatched", period.from, period.to],
    queryFn: () => listFn({ data: { ...period, kind: "all", match_status: "unmatched", limit: 200, offset: 0 } as any }),
  });
  const { data: sug } = useQuery({
    queryKey: ["fin-suggest", active],
    queryFn: () => suggestFn({ data: { transaction_id: active! } }),
    enabled: !!active,
  });
  const mut = useMutation({
    mutationFn: (payload: any) => linkFn({ data: payload }),
    onSuccess: () => { toast.success("Зв'язок збережено"); setActive(null); qc.invalidateQueries({ queryKey: ["fin-unmatched"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Дата</th><th className="px-3 py-2 text-left">Тип</th><th className="px-3 py-2 text-right">Сума</th><th className="px-3 py-2 text-left">Коментар</th><th /></tr>
          </thead>
          <tbody>
            {!((data?.rows ?? []) as any[]).length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Непов'язаних операцій немає.</td></tr>}
            {((data?.rows ?? []) as any[]).map((r) => (
              <tr key={r.id} className={`border-t border-border ${active === r.id ? "bg-primary/5" : ""}`}>
                <td className="px-3 py-2 text-xs">{r.op_date}</td>
                <td className="px-3 py-2 text-xs">{r.kind === "income" ? "Дохід" : r.kind === "expense" ? "Витрата" : "Переказ"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUah(Number(r.amount_uah ?? r.amount) || 0)}</td>
                <td className="px-3 py-2 text-xs max-w-[280px] truncate">{r.comment ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button className="text-xs font-semibold text-primary" onClick={() => setActive(r.id)}>Підібрати</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={card}>
        <h3 className="font-bold flex items-center gap-2"><Link2 className="w-4 h-4" /> Кандидати</h3>
        {!active && <p className="mt-2 text-sm text-muted-foreground">Оберіть операцію ліворуч — система запропонує можливі зв'язки з рівнем впевненості.</p>}
        {active && !(sug?.suggestions ?? []).length && <p className="mt-2 text-sm text-muted-foreground">Надійних кандидатів не знайдено. Залиште операцію непов'язаною або оберіть вручну.</p>}
        <div className="mt-3 space-y-2">
          {((sug?.suggestions ?? []) as any[]).map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.reason} · впевненість {(s.confidence * 100).toFixed(0)}%</div>
              <button className={`${btn} mt-2 bg-primary text-primary-foreground`}
                disabled={mut.isPending}
                onClick={() => mut.mutate({
                  transaction_id: active,
                  order_id: s.entity === "order" ? s.id : undefined,
                  client_id: s.entity === "client" ? s.id : undefined,
                  status: "matched",
                })}>
                <CheckCircle2 className="w-4 h-4" /> Підтвердити
              </button>
            </div>
          ))}
          {active && (
            <button className={`${btn} border border-border w-full justify-center`}
              onClick={() => mut.mutate({ transaction_id: active, status: "needs_review" })}>
              Позначити «потребує перевірки»
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 11. Finmap ------------------------------ */

export function FinmapSection() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getFinmapStatus);
  const testFn = useServerFn(testFinmapConnection);
  const syncFn = useServerFn(runFinmapSyncNow);
  const mapFn = useServerFn(listFinmapMappings);
  const saveMapFn = useServerFn(saveFinmapMapping);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data } = useQuery({ queryKey: ["finmap-status"], queryFn: () => statusFn() });
  const { data: mappings = [] } = useQuery({ queryKey: ["finmap-mappings"], queryFn: () => mapFn() });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (r: any) => { setTestResult(r); r.ok ? toast.success(r.message) : toast.error(r.message); qc.invalidateQueries({ queryKey: ["finmap-status"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const sync = useMutation({
    mutationFn: (mode: "initial" | "incremental") => syncFn({ data: { mode } }),
    onSuccess: (rows: any[]) => {
      const bad = rows.find((r) => r.status === "error");
      bad ? toast.error(`${bad.entity}: ${bad.message}`) : toast.success("Синхронізацію завершено");
      qc.invalidateQueries({ queryKey: ["finmap-status"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка синхронізації"),
  });

  const lastSuccess = useMemo(() => {
    const dates = ((data?.state ?? []) as any[]).map((s) => s.last_success_at).filter(Boolean).sort();
    return dates.length ? new Date(dates[dates.length - 1]).toLocaleString("uk-UA") : null;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold flex items-center gap-2"><PlugZap className="w-4 h-4" /> Підключення Finmap</h3>
            <p className="text-sm text-muted-foreground mt-1">
              API v{data?.apiVersion ?? "2.2"} ·{" "}
              {data?.configured
                ? testResult?.ok
                  ? "перевірено — підключено"
                  : "ключ додано, натисніть «Перевірити зв'язок»"
                : "ключ доступу ще не додано"}
              {lastSuccess ? ` · остання успішна синхронізація: ${lastSuccess}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} border border-border`} disabled={test.isPending} onClick={() => test.mutate()}>
              <ShieldCheck className="w-4 h-4" /> Перевірити зв'язок
            </button>
            <button className={`${btn} bg-primary text-primary-foreground`} disabled={sync.isPending || !data?.configured}
              onClick={() => sync.mutate("incremental")}>
              <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} /> Синхронізувати зараз
            </button>
            <button className={`${btn} border border-border`} disabled={sync.isPending || !data?.configured}
              onClick={() => sync.mutate("initial")}>
              Повна синхронізація
            </button>
          </div>
        </div>
        {testResult && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${testResult.ok ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}`}>
            {testResult.message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Metric title="Рахунки" value={String(data?.counts.accounts ?? 0)} />
        <Metric title="Проєкти" value={String(data?.counts.projects ?? 0)} />
        <Metric title="Контрагенти" value={String(data?.counts.counterparties ?? 0)} />
        <Metric title="Операції" value={String(data?.counts.transactions ?? 0)} />
        <Metric title="Без зв'язку" value={String(data?.counts.unmatched ?? 0)} tone="warn" />
        <Metric title="Події вебхука" value={String(data?.counts.webhookEvents ?? 0)} />
      </div>

      <div className={card}>
        <h3 className="font-bold">Журнал синхронізації</h3>
        <div className="mt-2 max-h-72 overflow-auto text-sm">
          {!((data?.log ?? []) as any[]).length && <div className="text-muted-foreground text-sm">Записів ще немає.</div>}
          {((data?.log ?? []) as any[]).map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 border-b border-border/60 py-2">
              <div>
                <div className="font-semibold text-xs uppercase tracking-wider">{l.entity} · {l.mode}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(l.created_at).toLocaleString("uk-UA")} · {l.message ?? "—"}</div>
              </div>
              <div className={`text-xs font-semibold ${l.status === "ok" ? "text-success" : "text-destructive"}`}>
                {l.status === "ok" ? `+${l.inserted}/~${l.updated}` : "помилка"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-bold">Відповідності (mappings)</h3>
        <p className="text-xs text-muted-foreground mt-1">Зв'язки зберігаються за ID, не за назвою. При низькій впевненості автозв'язок не виконується.</p>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-2 py-1 text-left">Тип</th><th className="px-2 py-1 text-left">Назва у Finmap</th><th className="px-2 py-1 text-left">Статус</th></tr>
            </thead>
            <tbody>
              {!(mappings as any[]).length && <tr><td colSpan={3} className="py-4 text-muted-foreground">Ще немає — виконайте синхронізацію.</td></tr>}
              {(mappings as any[]).slice(0, 200).map((m) => (
                <tr key={m.id} className="border-t border-border/60">
                  <td className="px-2 py-1 text-xs">{m.finmap_kind}</td>
                  <td className="px-2 py-1">{m.finmap_name ?? m.finmap_id}</td>
                  <td className="px-2 py-1 text-xs">{m.status === "matched" ? "зіставлено" : m.status === "needs_review" ? "перевірити" : "не зіставлено"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className={`${btn} mt-2 border border-border`} onClick={() => { void qc.invalidateQueries({ queryKey: ["finmap-mappings"] }); }}>
          Оновити список
        </button>
      </div>
    </div>
  );
}

/* --------------------------- 8. ФОП і зарплати --------------------------- */

const PAYROLL_STATUS_LABELS: Record<string, string> = {
  calculated: "Розраховано", awaiting_verification: "На перевірці", verified: "Перевірено",
  awaiting_approval: "На затвердженні", approved: "Затверджено", scheduled: "Заплановано",
  partially_paid: "Частково виплачено", paid: "Виплачено",
};

export function PayrollSection() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const listFn = useServerFn(listPayrollCalculations);
  const calcFn = useServerFn(calculatePayrollPeriod);
  const statusFn = useServerFn(setPayrollStatus);
  const kpiFn = useServerFn(setPayrollKpiFact);
  const reconcileFn = useServerFn(reconcilePayrollPayments);
  const profilesFn = useServerFn(listPayrollProfiles);
  const saveProfileFn = useServerFn(savePayrollProfile);

  const { data } = useQuery({ queryKey: ["payroll", period], queryFn: () => listFn({ data: { period } }) });
  const { data: profiles } = useQuery({ queryKey: ["payroll-profiles"], queryFn: () => profilesFn() });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["payroll", period] }); };
  const calc = useMutation({
    mutationFn: () => calcFn({ data: { period } }),
    onSuccess: () => { toast.success("Розрахунок виконано"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const rec = useMutation({
    mutationFn: () => reconcileFn({ data: { period } }),
    onSuccess: (r: any) => { toast.success(`Зіставлено виплат: ${r.matched}`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const st = useMutation({
    mutationFn: (p: any) => statusFn({ data: p }),
    onSuccess: () => { toast.success("Статус змінено"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const kpi = useMutation({
    mutationFn: (p: any) => kpiFn({ data: p }),
    onSuccess: () => { toast.success("KPI збережено"); calc.mutate(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const saveProfile = useMutation({
    mutationFn: (p: any) => saveProfileFn({ data: p }),
    onSuccess: () => { toast.success("Схему оплати збережено"); qc.invalidateQueries({ queryKey: ["payroll-profiles"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const schedule = payrollScheduleFor(period);
  const rows = (data?.rows ?? []) as any[];
  const totals = rows.reduce((a, r) => ({
    accrued: a.accrued + (Number(r.total_payable) || 0),
    advance: a.advance + (Number(r.advance_amount) || 0),
    paid: a.paid + (Number(r.paid_amount) || 0),
  }), { accrued: 0, advance: 0, paid: 0 });

  const [newProfile, setNewProfile] = useState<any>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" className={`${input} max-w-[180px]`} value={period} onChange={(e) => setPeriod(e.target.value)} />
        <button className={`${btn} bg-primary text-primary-foreground`} disabled={calc.isPending} onClick={() => calc.mutate()}>
          <Calculator className="w-4 h-4" /> Розрахувати місяць
        </button>
        <button className={`${btn} border border-border`} disabled={rec.isPending} onClick={() => rec.mutate()}>
          <RefreshCw className="w-4 h-4" /> Звірити з фактичними виплатами
        </button>
        <span className="text-xs text-muted-foreground">
          Аванс 50% — {schedule.advanceDate} · остаточний розрахунок — {schedule.settlementDate}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric title="Нараховано" value={formatUah(totals.accrued)} />
        <Metric title="Аванс (20-го)" value={formatUah(totals.advance)} />
        <Metric title="Виплачено (факт)" value={formatUah(totals.paid)} tone="good" />
        <Metric title="Залишок до виплати" value={formatUah(Math.max(totals.accrued - totals.paid, 0))} tone="warn" />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Співробітник</th>
                <th className="px-3 py-2 text-left">Група</th>
                <th className="px-3 py-2 text-right">Ставка</th>
                <th className="px-3 py-2 text-right">Аванс</th>
                <th className="px-3 py-2 text-right">KPI</th>
                <th className="px-3 py-2 text-right">Утримання</th>
                <th className="px-3 py-2 text-right">До виплати</th>
                <th className="px-3 py-2 text-right">Виплачено</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Розрахунків за період немає. Натисніть «Розрахувати місяць».</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold">{r.employee?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.payroll_group === "production" ? "Виробничий" : r.payroll_group === "commercial" ? "Комерційний" : "Адміністративний"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(Number(r.base_amount) || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(Number(r.advance_amount) || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUah(Number(r.kpi_amount) || 0)}
                    {((r.kpis ?? []) as any[]).filter((k) => k.status !== "approved").length > 0 && (
                      <div className="text-[10px] text-primary">є непідтверджені KPI</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatUah(Number(r.deduction_amount) || 0)}</td>
                  <td className="px-3 py-2 text-right font-black tabular-nums">{formatUah(Number(r.total_payable) || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{formatUah(Number(r.paid_amount) || 0)}</td>
                  <td className="px-3 py-2 text-xs">{PAYROLL_STATUS_LABELS[r.status] ?? r.status}</td>
                  <td className="px-3 py-2 text-right space-y-1">
                    {r.status === "calculated" && <button className="text-xs text-primary font-semibold" onClick={() => st.mutate({ calculation_id: r.id, to_status: "awaiting_verification" })}>На перевірку</button>}
                    {r.status === "awaiting_verification" && <button className="text-xs text-primary font-semibold" onClick={() => st.mutate({ calculation_id: r.id, to_status: "verified" })}>Перевірено</button>}
                    {r.status === "verified" && <button className="text-xs text-primary font-semibold" onClick={() => st.mutate({ calculation_id: r.id, to_status: "approved" })}>Затвердити</button>}
                    {["approved", "partially_paid"].includes(r.status) && <button className="text-xs text-primary font-semibold" onClick={() => st.mutate({ calculation_id: r.id, to_status: "scheduled" })}>До виплати</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rows.some((r) => (r.kpis ?? []).length > 0) && (
        <div className={card}>
          <h3 className="font-bold">KPI та бонуси</h3>
          <div className="mt-2 space-y-3">
            {rows.map((r) => ((r.kpis ?? []) as any[]).length ? (
              <div key={r.id}>
                <div className="text-sm font-semibold">{r.employee?.full_name}</div>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
                  {((r.kpis ?? []) as any[]).map((k) => (
                    <div key={k.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{k.title}</div>
                        <div className="text-[11px] text-muted-foreground">ціль {k.target} · бонус {formatUah(Number(k.bonus) || 0)}</div>
                      </div>
                      <input type="number" step="0.01" defaultValue={k.actual} className={`${input} w-24`}
                        onBlur={(e) => kpi.mutate({ calculation_id: r.id, code: k.code, actual: Number(e.target.value), approved: k.status === "approved" })} />
                      <button className={`${btn} border ${k.status === "approved" ? "border-success text-success" : "border-border"}`}
                        onClick={() => kpi.mutate({ calculation_id: r.id, code: k.code, actual: Number(k.actual) || 0, approved: k.status !== "approved" })}>
                        {k.status === "approved" ? "Підтверджено" : "Підтвердити"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      <div className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Схеми оплати співробітників</h3>
          <button className={`${btn} border border-border`} onClick={() => setNewProfile({
            employee_id: (profiles?.employees ?? [])[0]?.id ?? "",
            payroll_group: "administrative", base_salary: 0, advance_percent: 50,
            kpi_scheme: [], bonus_rules: {}, payment_rules: {}, valid_from: `${period}-01`,
          })}>Додати схему</button>
        </div>
        {newProfile && (
          <div className="mt-3 grid gap-2 md:grid-cols-5 items-end">
            <div><div className={label}>Співробітник</div>
              <select className={input} value={newProfile.employee_id} onChange={(e) => setNewProfile({ ...newProfile, employee_id: e.target.value })}>
                {((profiles?.employees ?? []) as any[]).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div><div className={label}>Група ФОП</div>
              <select className={input} value={newProfile.payroll_group} onChange={(e) => setNewProfile({ ...newProfile, payroll_group: e.target.value })}>
                <option value="administrative">Адміністративний</option>
                <option value="commercial">Комерційний</option>
                <option value="production">Виробничий</option>
              </select>
            </div>
            <div><div className={label}>Ставка, грн</div>
              <input type="number" className={input} value={newProfile.base_salary} onChange={(e) => setNewProfile({ ...newProfile, base_salary: Number(e.target.value) })} />
            </div>
            <div><div className={label}>Аванс, %</div>
              <input type="number" className={input} value={newProfile.advance_percent} onChange={(e) => setNewProfile({ ...newProfile, advance_percent: Number(e.target.value) })} />
            </div>
            <div className="flex gap-2">
              <button className={`${btn} bg-primary text-primary-foreground`} disabled={!newProfile.employee_id || saveProfile.isPending}
                onClick={() => saveProfile.mutate(newProfile)}>Зберегти</button>
              <button className={`${btn} border border-border`} onClick={() => setNewProfile(null)}>Скасувати</button>
            </div>
          </div>
        )}
        <div className="mt-3 divide-y divide-border/60">
          {!((profiles?.profiles ?? []) as any[]).length && <div className="py-3 text-sm text-muted-foreground">Схем оплати ще немає.</div>}
          {((profiles?.profiles ?? []) as any[]).map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-semibold">{p.employee?.full_name ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  діє з {p.valid_from}{p.valid_to ? ` до ${p.valid_to}` : ""} · аванс {p.advance_percent}% · KPI: {(p.kpi_scheme ?? []).length}
                </div>
              </div>
              <div className="tabular-nums font-black">{formatUah(Number(p.base_salary) || 0)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-primary" />
        ERP рахує нарахування; фактичну виплату підтверджує Finmap. Витрата з Finmap не створює нового нарахування.
      </div>
    </div>
  );
}

/* --------------------- 4/5. Дебіторка та кредиторка --------------------- */

export function ReceivablesSection({ invoices, payments }: { invoices: any[]; payments: any[] }) {
  const rows = useMemo(() => {
    const byClient = new Map<string, { name: string; invoiced: number; paid: number; overdue: number; last: string | null }>();
    for (const i of invoices) {
      if (i.status === "cancelled") continue;
      const key = i.client?.name ?? i.client_id ?? "—";
      const cur = byClient.get(key) ?? { name: key, invoiced: 0, paid: 0, overdue: 0, last: null };
      cur.invoiced += Number(i.total) || 0;
      cur.paid += Number(i.paid) || 0;
      const rest = (Number(i.total) || 0) - (Number(i.paid) || 0);
      if (i.due_date && new Date(i.due_date) < new Date() && rest > 0) cur.overdue += rest;
      byClient.set(key, cur);
    }
    for (const p of payments) {
      const key = p.client?.name ?? p.order?.client_name;
      if (!key) continue;
      const cur = byClient.get(key);
      if (cur && (!cur.last || p.paid_at > cur.last)) cur.last = p.paid_at;
    }
    return [...byClient.values()].sort((a, b) => (b.invoiced - b.paid) - (a.invoiced - a.paid));
  }, [invoices, payments]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Клієнт</th>
              <th className="px-3 py-2 text-right">Нараховано</th>
              <th className="px-3 py-2 text-right">Отримано</th>
              <th className="px-3 py-2 text-right">Залишок</th>
              <th className="px-3 py-2 text-right">Прострочка</th>
              <th className="px-3 py-2 text-right">Остання оплата</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Даних по дебіторці немає.</td></tr>}
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.invoiced)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{formatUah(r.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-black">{formatUah(Math.max(r.invoiced - r.paid, 0))}</td>
                <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatUah(r.overdue)}</td>
                <td className="px-3 py-2 text-right text-xs">{r.last ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PayablesSection({ expenses }: { expenses: any[] }) {
  const rows = useMemo(() => {
    const bySupplier = new Map<string, { name: string; amount: number; count: number; last: string | null }>();
    for (const e of expenses) {
      const key = e.supplier || "Без постачальника";
      const cur = bySupplier.get(key) ?? { name: key, amount: 0, count: 0, last: null };
      cur.amount += Number(e.amount) || 0;
      cur.count += 1;
      if (!cur.last || e.spent_at > cur.last) cur.last = e.spent_at;
      bySupplier.set(key, cur);
    }
    return [...bySupplier.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
        Обов'язання (закупівлі) і фактичні платежі рознесені окремо: фактичні витрати надходять із Finmap.
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Постачальник</th><th className="px-3 py-2 text-right">Оплачено</th><th className="px-3 py-2 text-right">Операцій</th><th className="px-3 py-2 text-right">Остання</th></tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Витрат по постачальниках немає.</td></tr>}
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-3 py-2 text-right text-xs">{r.last ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CategoriesSection() {
  const fn = useServerFn(listFinmapMappings);
  const { data = [] } = useQuery({ queryKey: ["finmap-mappings"], queryFn: () => fn() });
  const cats = (data as any[]).filter((m) => m.finmap_kind === "category");
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">Категорія Finmap</th><th className="px-3 py-2 text-left">Статус</th></tr>
        </thead>
        <tbody>
          {!cats.length && <tr><td colSpan={2} className="p-8 text-center text-muted-foreground">Категорії ще не синхронізовані.</td></tr>}
          {cats.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-3 py-2">{c.finmap_name ?? c.finmap_id}</td>
              <td className="px-3 py-2 text-xs">{c.status === "matched" ? "зіставлено" : "не зіставлено"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const FinanceLinkIcon = ArrowRight;
