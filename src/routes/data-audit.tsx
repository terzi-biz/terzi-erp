import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, Download, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  runDataAudit,
  applyDataAuditAction,
  listDataAuditRuns,
} from "@/lib/data-audit.functions";
import {
  auditErrorMessage,
  exportButtonState,
  rowApplyDisabled,
  runButtonState,
} from "@/lib/data-audit/ui-state";

export const Route = createFileRoute("/data-audit")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Аудит цілісності даних — TERZI ERP" },
      {
        name: "description",
        content:
          "Dry-run звіти TERZI ERP: дублі клієнтів, звінки без лідів, ліди без клієнтів, проблеми каталогу та кошториси без версії прайсу.",
      },
      { property: "og:title", content: "Аудит цілісності даних — TERZI ERP" },
      {
        property: "og:description",
        content: "Перевірка звʼязків CRM, каталогу та кошторисів із застосуванням змін лише за підтвердженням.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataAuditPage,
});

const CHECKS = [
  { key: "client_duplicates", label: "Дублі клієнтів" },
  { key: "calls_to_leads", label: "Звінки без ліда" },
  { key: "leads_to_clients", label: "Ліди без клієнта" },
  { key: "leads_to_orders", label: "Ліди без замовлення" },
  { key: "catalog_issues", label: "Каталог" },
  { key: "estimates_price_version", label: "Версія прайсу" },
] as const;

type CheckKey = (typeof CHECKS)[number]["key"];

const card = "rounded-xl border border-border bg-card p-4 shadow-sm";
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50";

function DataAuditPage() {
  const qc = useQueryClient();
  const run = useServerFn(runDataAudit);
  const apply = useServerFn(applyDataAuditAction);
  const runs = useServerFn(listDataAuditRuns);

  const [check, setCheck] = useState<CheckKey>("client_duplicates");
  const [report, setReport] = useState<any>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});

  const history = useQuery({ queryKey: ["data-audit-runs"], queryFn: () => runs({}) });

  const runMut = useMutation({
    mutationFn: (p: { check: CheckKey; save?: boolean }) => run({ data: p }),
    onSuccess: (r) => {
      setReport(r);
      setApplied({});
      qc.invalidateQueries({ queryKey: ["data-audit-runs"] });
    },
    onError: (e: unknown) => toast.error(auditErrorMessage(e, "Не вдалося сформувати звіт")),
  });

  const applyMut = useMutation({
    mutationFn: (p: { apply_key: string }) => apply({ data: { check, apply_key: p.apply_key } }),
    onSuccess: (res, vars) => {
      setApplied((s) => ({ ...s, [vars.apply_key]: res.message }));
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["data-audit-runs"] });
    },
    onError: (e: unknown) => toast.error(auditErrorMessage(e, "Не вдалося застосувати")),
  });

  const ui = { running: runMut.isPending, applying: applyMut.isPending, hasReport: Boolean(report) };
  const runBtn = runButtonState(ui);
  const exportBtn = exportButtonState(ui);

  const exportCsv = () => {
    if (!report) return;
    const head = "Позиція;Деталі;Що буде змінено\n";
    const body = (report.rows as any[])
      .map((r) => [r.title, r.detail, r.change ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + head + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `terzi-audit-${report.check}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight">Аудит цілісності даних</h1>
            <p className="text-sm text-muted-foreground">
              Спочатку звіт (dry-run), і лише потім — застосування по одному запису за підтвердженням.
              Автоматичного обʼєднання клієнтів і лідів немає.
            </p>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {CHECKS.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setCheck(c.key);
                setReport(null);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                check === c.key
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`${btn} bg-primary text-primary-foreground`}
            disabled={runBtn.disabled}
            onClick={() => runMut.mutate({ check, save: true })}
          >
            {runBtn.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Сформувати звіт
          </button>
          <button className={`${btn} border border-border`} disabled={exportBtn.disabled} onClick={exportCsv}>
            <Download className="w-4 h-4" /> Експорт CSV
          </button>
        </div>

        {report && (
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-bold">{report.label}</h2>
                <p className="text-xs text-muted-foreground">{report.note}</p>
              </div>
              <div className="text-sm font-bold tabular-nums">
                Знайдено: {report.total}
                {report.rows.length < report.total && (
                  <span className="text-muted-foreground font-normal"> (показано {report.rows.length})</span>
                )}
              </div>
            </div>

            {report.total === 0 ? (
              <p className="text-sm text-success inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Проблем не знайдено.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="py-2 pr-2">Запис</th>
                      <th className="py-2 px-2">Деталі</th>
                      <th className="py-2 px-2">Що буде змінено</th>
                      <th className="py-2 pl-2 w-40">Дія</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.rows as any[]).map((r, i) => (
                      <tr key={r.applyKey ?? i} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-2 font-medium">{r.title}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.detail}</td>
                        <td className="py-2 px-2">{r.change ?? "—"}</td>
                        <td className="py-2 pl-2">
                          {!r.applyKey ? (
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> вручну
                            </span>
                          ) : applied[r.applyKey] ? (
                            <span className="text-xs text-success">{applied[r.applyKey]}</span>
                          ) : (
                            <button
                              className={`${btn} border border-border text-xs px-2 py-1`}
                              disabled={rowApplyDisabled({
                                applyKey: r.applyKey,
                                appliedMessage: applied[r.applyKey],
                                applying: applyMut.isPending,
                              })}
                              onClick={() => {
                                if (!window.confirm(`Застосувати?\n\n${r.change}`)) return;
                                applyMut.mutate({ apply_key: r.applyKey });
                              }}
                            >
                              Застосувати
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className={card}>
          <h2 className="font-bold mb-2">Журнал перевірок</h2>
          {(history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ще немає запусків.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">Дата</th>
                    <th className="py-2 px-2">Перевірка</th>
                    <th className="py-2 px-2">Режим</th>
                    <th className="py-2 px-2 text-right">Знайдено</th>
                    <th className="py-2 px-2 text-right">Застосовано</th>
                    <th className="py-2 pl-2">Примітка</th>
                  </tr>
                </thead>
                <tbody>
                  {(history.data as any[]).map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("uk-UA")}
                      </td>
                      <td className="py-2 px-2">{r.check_key}</td>
                      <td className="py-2 px-2">{r.mode === "apply" ? "застосування" : "dry-run"}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.affected_count}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.applied_count}</td>
                      <td className="py-2 pl-2 text-muted-foreground">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
