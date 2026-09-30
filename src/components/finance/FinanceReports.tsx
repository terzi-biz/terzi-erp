/**
 * Фінансові звіти: прибуток по місяцях, витрати, контрагенти, власні метрики.
 * Дані — getFinanceReports (Finmap, дата проведення, Europe/Kyiv, тільки фактичні).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { Plus, Trash2, Search } from "lucide-react";
import { getFinanceReports } from "@/lib/finance/reports.functions";
import { getResolvedConfig, saveConfigDraft, publishConfig } from "@/lib/config-kernel/config.functions";
import type { Dictionary } from "@/lib/config-kernel/dictionaries";

type Period = { from: string; to: string };
const uah = (n: number | null | undefined) => (n == null ? "—" : `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n)} ₴`);
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)} млн` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)} тис` : String(Math.round(n)));
const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const mLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);
const PIE = ["hsl(var(--primary))", "#F2B632", "#0F4C5C", "#2563EB", "#334155", "#94A3B8", "#B45309", "#0EA5E9", "#64748B", "#A3A3A3", "#1E3A8A"];

const VIEWS = [
  { key: "profit", label: "Прибуток по місяцях" },
  { key: "expenses", label: "Витрати" },
  { key: "counterparties", label: "Контрагенти" },
  { key: "metrics", label: "Власні метрики" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export function FinanceReportsSection({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const [view, setView] = useState<View>("profit");
  const fn = useServerFn(getFinanceReports);
  const q = useQuery({ queryKey: ["fin-reports", period.from, period.to], queryFn: () => fn({ data: period }), staleTime: 60_000, retry: false });

  const presets: { label: string; p: () => Period }[] = [
    { label: "Цей місяць", p: () => { const d = new Date(); return { from: iso(d.getFullYear(), d.getMonth(), 1), to: iso(d.getFullYear(), d.getMonth() + 1, 0) }; } },
    { label: "Мин. місяць", p: () => { const d = new Date(); return { from: iso(d.getFullYear(), d.getMonth() - 1, 1), to: iso(d.getFullYear(), d.getMonth(), 0) }; } },
    { label: "Квартал", p: () => { const d = new Date(); const s = Math.floor(d.getMonth() / 3) * 3; return { from: iso(d.getFullYear(), s, 1), to: iso(d.getFullYear(), s + 3, 0) }; } },
    { label: "6 місяців", p: () => { const d = new Date(); return { from: iso(d.getFullYear(), d.getMonth() - 5, 1), to: iso(d.getFullYear(), d.getMonth() + 1, 0) }; } },
    { label: "Рік", p: () => { const d = new Date(); return { from: iso(d.getFullYear(), 0, 1), to: iso(d.getFullYear(), 11, 31) }; } },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((x) => (
          <button key={x.label} type="button" onClick={() => onPeriod(x.p())}
            className="min-h-9 rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-secondary/60">{x.label}</button>
        ))}
        <span className="self-center text-[11px] text-muted-foreground">Дата = дата проведення операції у Finmap (Київ), тільки фактичні</span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:grid-cols-4">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)}
            className={`min-h-10 rounded-lg px-2 text-xs font-bold sm:text-sm ${view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>{v.label}</button>
        ))}
      </div>
      {q.isLoading && <div className="panel p-6 text-sm text-muted-foreground">Завантаження звітів…</div>}
      {q.isError && <div className="panel p-6 text-sm text-destructive">{(q.error as Error).message}</div>}
      {q.data && view === "profit" && <ProfitView d={q.data} />}
      {q.data && view === "expenses" && <ExpensesView d={q.data} />}
      {q.data && view === "counterparties" && <CounterpartiesView d={q.data} />}
      {q.data && view === "metrics" && <MetricsView d={q.data} />}
    </div>
  );
}

function iso(y: number, m: number, d: number) {
  const x = new Date(Date.UTC(y, m, d));
  return x.toISOString().slice(0, 10);
}

type Data = Awaited<ReturnType<typeof getFinanceReports>>;

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="panel p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg font-black ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function ProfitView({ d }: { d: Data }) {
  const t = d.totals;
  const chart = d.months.map((m) => ({ ...m, label: mLabel(m.month) }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi label="Надходження" value={uah(t.income)} />
        <Kpi label="Витрати" value={uah(t.expense)} />
        <Kpi label="Валовий прибуток" value={uah(t.grossProfit)} note="дохід − прямі витрати" tone={t.grossProfit >= 0 ? "good" : "bad"} />
        <Kpi label="EBITDA" value={uah(t.ebitda)} note="без податків і фін. операцій" tone={t.ebitda >= 0 ? "good" : "bad"} />
        <Kpi label="Чистий кеш-прибуток" value={uah(t.profit)} note={`маржа ${pct(t.margin)}`} tone={t.profit >= 0 ? "good" : "bad"} />
        <Kpi label="ФОП / дохід" value={pct(t.income > 0 ? (t.payroll / t.income) * 100 : null)} note={uah(t.payroll)} />
      </div>
      <div className="panel p-3">
        <div className="mb-2 text-sm font-black">Надходження, витрати і прибуток по місяцях</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={56} />
              <Tooltip formatter={(v: number) => uah(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Надходження" fill="#0F4C5C" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Витрати" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              <Line dataKey="ebitda" name="EBITDA" stroke="#F2B632" strokeWidth={2} dot />
              <Line dataKey="profit" name="Прибуток" stroke="#2563EB" strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>{["Місяць", "Надходження", "Прямі витрати", "Валовий приб.", "ФОП", "Маркетинг", "Накладні", "EBITDA", "Податки/фін.", "Прибуток", "Маржа", "ФОП %"].map((h, i) => <th key={h} className={`px-2 py-2 ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="font-mono">
            {d.months.map((m) => (
              <tr key={m.month} className="border-b border-border/60">
                <td className="px-2 py-2 font-sans font-semibold">{mLabel(m.month)}</td>
                <td className="px-2 py-2 text-right">{uah(m.income)}</td>
                <td className="px-2 py-2 text-right">{uah(m.direct)}</td>
                <td className="px-2 py-2 text-right">{uah(m.grossProfit)}</td>
                <td className="px-2 py-2 text-right">{uah(m.payroll)}</td>
                <td className="px-2 py-2 text-right">{uah(m.marketing)}</td>
                <td className="px-2 py-2 text-right">{uah(m.overhead)}</td>
                <td className="px-2 py-2 text-right font-bold">{uah(m.ebitda)}</td>
                <td className="px-2 py-2 text-right">{uah(m.nonEbitda)}</td>
                <td className={`px-2 py-2 text-right font-bold ${m.profit < 0 ? "text-destructive" : ""}`}>{uah(m.profit)}</td>
                <td className="px-2 py-2 text-right">{pct(m.margin)}</td>
                <td className="px-2 py-2 text-right">{pct(m.payrollShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Операцій у звіті: {d.txCount}. Непідтверджені (планові) операції не враховуються{d.excludedUnapproved ? ` — виключено ${d.excludedUnapproved}` : ""}. Класи витрат — з довідника статей (Фінанси → Контроль → Статті).</p>
    </div>
  );
}

function ExpensesView({ d }: { d: Data }) {
  const [qText, setQ] = useState("");
  const rows = d.categories.filter((c) => !qText || `${c.name} ${c.parent ?? ""} ${c.clsLabel}`.toLowerCase().includes(qText.toLowerCase()));
  const total = d.totals.expense || 1;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="panel p-3">
          <div className="mb-1 text-sm font-black">Структура витрат</div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d.byClass} dataKey="total" nameKey="label" innerRadius={50} outerRadius={90}>
                  {d.byClass.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => uah(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1 text-xs">
            {d.byClass.map((c, i) => (
              <li key={c.cls} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE[i % PIE.length] }} />
                <span className="flex-1">{c.label}</span>
                <span className="font-mono">{uah(c.total)}</span>
                <span className="w-12 text-right text-muted-foreground">{((c.total / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black">Витрати по статтях · {uah(d.totals.expense)}</div>
            <label className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={qText} onChange={(e) => setQ(e.target.value)} placeholder="Пошук статті" className="min-h-9 rounded-lg border border-input bg-background pl-8 pr-2 text-sm" />
            </label>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr><th className="px-2 py-1.5">Стаття</th><th className="px-2 py-1.5">Клас</th><th className="px-2 py-1.5 text-right">Операцій</th><th className="px-2 py-1.5 text-right">Сума</th><th className="px-2 py-1.5 text-right">Частка</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-2 py-1.5">{c.name}{c.parent && <div className="text-[11px] text-muted-foreground">{c.parent}</div>}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{c.clsLabel}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{c.count}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{uah(c.total)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="ml-auto flex w-24 items-center gap-1">
                        <div className="h-1.5 flex-1 rounded bg-secondary"><div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, (c.total / total) * 100)}%` }} /></div>
                        <span className="w-10 text-[11px]">{((c.total / total) * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Витрат за період немає</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CounterpartiesView({ d }: { d: Data }) {
  const [qText, setQ] = useState("");
  const [mode, setMode] = useState<"all" | "income" | "expense">("all");
  const rows = d.counterparties
    .filter((c) => mode === "all" || (mode === "income" ? c.income > 0 : c.expense > 0))
    .filter((c) => !qText || c.name.toLowerCase().includes(qText.toLowerCase()))
    .sort((a, b) => (mode === "income" ? b.income - a.income : mode === "expense" ? b.expense - a.expense : 0));
  const top = rows.slice(0, 10).map((c) => ({ name: c.name.length > 22 ? `${c.name.slice(0, 22)}…` : c.name, income: c.income, expense: c.expense }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([["all", "Усі"], ["income", "Від кого надходження"], ["expense", "Кому платимо"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${mode === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>{l}</button>
        ))}
        <label className="relative ml-auto">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={qText} onChange={(e) => setQ(e.target.value)} placeholder="Пошук контрагента" className="min-h-9 rounded-lg border border-input bg-background pl-8 pr-2 text-sm" />
        </label>
      </div>
      <div className="panel p-3">
        <div className="mb-2 text-sm font-black">Топ-10 контрагентів за оборотом</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={top} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickFormatter={short} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => uah(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Надходження" fill="#0F4C5C" />
              <Bar dataKey="expense" name="Витрати" fill="#F2B632" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel max-h-[560px] overflow-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr><th className="px-2 py-2">Контрагент</th><th className="px-2 py-2 text-right">Операцій</th><th className="px-2 py-2 text-right">Надходження</th><th className="px-2 py-2 text-right">Витрати</th><th className="px-2 py-2 text-right">Сальдо</th><th className="px-2 py-2 text-right">Остання</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border/60">
                <td className="px-2 py-1.5 font-semibold">{c.name}</td>
                <td className="px-2 py-1.5 text-right font-mono">{c.count}</td>
                <td className="px-2 py-1.5 text-right font-mono">{uah(c.income)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{uah(c.expense)}</td>
                <td className={`px-2 py-1.5 text-right font-mono font-bold ${c.net < 0 ? "text-destructive" : ""}`}>{uah(c.net)}</td>
                <td className="px-2 py-1.5 text-right text-xs">{c.last ? c.last.split("-").reverse().join(".") : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Немає даних</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Власні метрики: частка A / B × 100 або A − B, версіоновано в config_entries ---------- */
const METRIC_FIELDS = {
  income: "Надходження", expense: "Витрати", direct: "Прямі витрати", payroll: "ФОП", marketing: "Маркетинг",
  overhead: "Накладні", nonEbitda: "Податки і фін.", grossProfit: "Валовий прибуток", ebitda: "EBITDA", profit: "Прибуток",
} as const;
type Field = keyof typeof METRIC_FIELDS;
const KEY = "finance_custom_metrics";
const SCOPE = { type: "company" as const, id: "terzi" };

function MetricsView({ d }: { d: Data }) {
  const qc = useQueryClient();
  const load = useServerFn(getResolvedConfig);
  const save = useServerFn(saveConfigDraft);
  const publish = useServerFn(publishConfig);
  const q = useQuery({ queryKey: ["config", "dictionary", KEY], queryFn: () => load({ data: { kind: "dictionary", key: KEY } }) });
  const items = ((q.data?.value as Dictionary | null)?.items ?? []).filter((i) => !i.archived);
  const all = (q.data?.value as Dictionary | null)?.items ?? [];
  const [draft, setDraft] = useState({ name: "", a: "marketing" as Field, op: "ratio" as "ratio" | "diff", b: "income" as Field, target: "" });

  const persist = useMutation({
    mutationFn: async ({ next, note }: { next: Dictionary["items"]; note: string }) => {
      await save({ data: { kind: "dictionary", key: KEY, scope: SCOPE, payload: { label_uk: "Власні фінансові метрики", items: next } } });
      await publish({ data: { kind: "dictionary", key: KEY, scope: SCOPE, note } });
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["config", "dictionary", KEY] }); toast.success("Збережено"); setDraft((x) => ({ ...x, name: "", target: "" })); },
    onError: (e: Error) => toast.error(e.message),
  });

  const value = (totals: Record<string, number>, a: Field, op: string, b: Field) => {
    const A = Number(totals[a] ?? 0), B = Number(totals[b] ?? 0);
    if (op === "diff") return A - B;
    return B !== 0 ? (A / B) * 100 : null;
  };
  const totals = d.totals as unknown as Record<string, number>;
  const cards = useMemo(() => items.map((i) => {
    const m = i.metadata ?? {};
    const a = String(m.a) as Field, b = String(m.b) as Field, op = String(m.op);
    const v = value(totals, a, op, b);
    const target = m.target === "" || m.target == null ? null : Number(m.target);
    return { i, a, b, op, v, target, series: d.months.map((mm) => ({ label: mLabel(mm.month), v: value(mm as unknown as Record<string, number>, a, op, b) })) };
  }), [items, d]);

  return (
    <div className="space-y-3">
      <div className="panel grid items-end gap-2 p-3 sm:grid-cols-[2fr_1.2fr_auto_1.2fr_1fr_auto]">
        <label className="space-y-1 text-xs"><span>Назва метрики</span><input className="min-h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" value={draft.name} placeholder="напр. Реклама / Дохід" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="space-y-1 text-xs"><span>Показник A</span><select className="min-h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value as Field })}>{Object.entries(METRIC_FIELDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>Дія</span><select className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as "ratio" | "diff" })}><option value="ratio">A / B, %</option><option value="diff">A − B, ₴</option></select></label>
        <label className="space-y-1 text-xs"><span>Показник B</span><select className="min-h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value as Field })}>{Object.entries(METRIC_FIELDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>Ціль (необов'язково)</span><input type="number" className="min-h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></label>
        <button type="button" disabled={persist.isPending || !draft.name.trim()} onClick={() => persist.mutate({
          next: [...all, { code: `m_${Date.now().toString(36)}`, label_uk: draft.name.trim().slice(0, 120), order: all.length, metadata: { a: draft.a, op: draft.op, b: draft.b, target: draft.target } }],
          note: `Додано метрику: ${draft.name}`,
        })} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4" />Додати</button>
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Завантаження…</div>}
      {!q.isLoading && !cards.length && <div className="panel p-6 text-center text-sm text-muted-foreground">Власних метрик ще немає. Додайте першу — наприклад «Маркетинг / Надходження, %».</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ i, op, v, target, series }) => {
          const fmt = (x: number | null) => (x == null ? "—" : op === "diff" ? uah(x) : `${x.toFixed(1)}%`);
          return (
            <div key={i.code} className="panel p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-black">{i.label_uk}</div>
                  <div className="text-[11px] text-muted-foreground">{METRIC_FIELDS[String(i.metadata?.a) as Field]} {op === "diff" ? "−" : "/"} {METRIC_FIELDS[String(i.metadata?.b) as Field]}</div>
                </div>
                <button type="button" aria-label="Видалити метрику" onClick={() => persist.mutate({ next: all.map((x) => (x.code === i.code ? { ...x, archived: true } : x)), note: `Архів метрики: ${i.label_uk}` })} className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 font-mono text-2xl font-black">{fmt(v)}</div>
              {target != null && <div className="text-[11px] text-muted-foreground">Ціль: {fmt(target)}</div>}
              <div className="mt-2 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series}><XAxis dataKey="label" hide /><Tooltip formatter={(x: number) => fmt(x)} /><Bar dataKey="v" fill="#0F4C5C" radius={[3, 3, 0, 0]} /></ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
