import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Table2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { EXCHANGE_ENTITIES, entityHeaders, getEntity } from "@/lib/data-exchange/registry";
import { exportErpEntity, importErpEntity } from "@/lib/data-exchange.functions";

export const Route = createFileRoute("/data-exchange")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Імпорт та експорт даних — TERZI ERP" },
      { name: "description", content: "Перенесення бази з keyCRM, Binotel, банківських виписок і складу в TERZI ERP: імпорт з Excel/CSV та вивантаження будь-якого розділу." },
      { property: "og:title", content: "Імпорт та експорт даних — TERZI ERP" },
      { property: "og:description", content: "Імпорт клієнтів, лідів, дзвінків, платежів і складу з Excel/CSV та вивантаження розділів ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataExchangePage,
});

const card = "rounded-xl border border-border bg-card p-4 shadow-sm";
const label = "text-[11px] uppercase tracking-wider text-muted-foreground";
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50";
const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

type FileRow = Record<string, unknown>;
type ImportResult = {
  ok: boolean; total: number; created: number; updated: number; skipped: number; dryRun: boolean;
  issues: { row: number; message: string }[]; preview: string;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_"'`.]+/g, "");

function DataExchangePage() {
  const groups = useMemo(() => Array.from(new Set(EXCHANGE_ENTITIES.map((e) => e.group))), []);
  const [entityKey, setEntityKey] = useState(EXCHANGE_ENTITIES[0]!.key);
  const entity = getEntity(entityKey)!;
  const headers = useMemo(() => entityHeaders(entity), [entity]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFn = useServerFn(exportErpEntity);
  const importFn = useServerFn(importErpEntity);

  function resetFile() {
    setFileName(null); setFileHeaders([]); setFileRows([]); setMapping({}); setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function selectEntity(key: string) {
    setEntityKey(key);
    resetFile();
  }

  function autoMap(cols: string[]) {
    const map: Record<string, string> = {};
    for (const h of headers) {
      const hit = cols.find((c) => norm(c) === norm(h.label)) ?? cols.find((c) => norm(c) === norm(h.key));
      if (hit) map[h.key] = hit;
    }
    return map;
  }

  async function onFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) { toast.error("Файл порожній"); return; }
    const rows = XLSX.utils.sheet_to_json<FileRow>(sheet, { defval: "", raw: false });
    if (!rows.length) { toast.error("У файлі немає рядків"); return; }
    const cols = Object.keys(rows[0]!);
    setFileName(file.name); setFileRows(rows); setFileHeaders(cols); setMapping(autoMap(cols)); setResult(null);
    toast.success(`Прочитано ${rows.length} рядків`);
  }

  function downloadWorkbook(rows: Record<string, unknown>[], name: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "data");
    XLSX.writeFile(wb, name);
  }

  const exportMut = useMutation({
    mutationFn: async (format: "xlsx" | "csv") => {
      const res = await exportFn({ data: { entityKey } });
      const rows = JSON.parse(res.rowsJson) as Record<string, unknown>[];
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        const ws = XLSX.utils.json_to_sheet(rows);
        const csv = "\uFEFF" + XLSX.utils.sheet_to_csv(ws, { FS: ";" });
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url; a.download = `terzi_${entityKey}_${stamp}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        downloadWorkbook(rows, `terzi_${entityKey}_${stamp}.xlsx`);
      }
      return res.count;
    },
    onSuccess: (count) => toast.success(`Вивантажено ${count} записів`),
    onError: (e: Error) => toast.error(e.message),
  });

  function templateDownload() {
    const empty: Record<string, unknown> = {};
    for (const h of headers) empty[h.label] = "";
    downloadWorkbook([empty], `terzi_шаблон_${entityKey}.xlsx`);
  }

  const importMut = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const payload = fileRows.map((row) => {
        const rec: Record<string, unknown> = {};
        for (const h of headers) {
          const col = mapping[h.key];
          if (col) rec[h.key] = row[col];
        }
        return rec;
      });
      return (await importFn({
        data: { entityKey, rowsJson: JSON.stringify(payload), dryRun, updateExisting },
      })) as ImportResult;
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.dryRun) toast.success(`Перевірка: нових ${res.created}, оновлень ${res.updated}, пропущено ${res.skipped}`);
      else toast.success(`Імпорт завершено: створено ${res.created}, оновлено ${res.updated}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmappedRequired = headers.filter((h) => {
    const field = entity.fields.find((f) => f.key === h.key);
    return field?.required && !mapping[h.key];
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
        <header>
          <h1 className="text-xl font-bold md:text-2xl">Імпорт та експорт даних</h1>
          <p className="text-sm text-muted-foreground">
            Перенесення бази з keyCRM, Binotel, банківських виписок, складу та довідників — і вивантаження будь-якого розділу ERP у Excel/CSV.
          </p>
        </header>

        <div className={card}>
          <div className={label}>Розділ</div>
          <div className="mt-3 space-y-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{g}</div>
                <div className="flex flex-wrap gap-2">
                  {EXCHANGE_ENTITIES.filter((e) => e.group === g).map((e) => (
                    <button
                      key={e.key}
                      onClick={() => selectEntity(e.key)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        e.key === entityKey ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-accent"
                      }`}
                    >
                      {e.label}
                      {e.exportOnly && <span className="ml-1 text-[10px] uppercase text-muted-foreground">експорт</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {entity.hint && <p className="mt-3 text-xs text-muted-foreground">{entity.hint}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><ArrowDownToLine className="h-4 w-4" /> Вивантаження з ERP</h2>
            <p className="mt-1 text-sm text-muted-foreground">Розділ «{entity.label}» — до 5000 останніх записів.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={`${btn} bg-primary text-primary-foreground`} disabled={exportMut.isPending} onClick={() => exportMut.mutate("xlsx")}>
                {exportMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel (.xlsx)
              </button>
              <button className={`${btn} border border-border`} disabled={exportMut.isPending} onClick={() => exportMut.mutate("csv")}>
                <Table2 className="h-4 w-4" /> CSV
              </button>
              <button className={`${btn} border border-border`} onClick={templateDownload}>
                Шаблон для імпорту
              </button>
            </div>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><ArrowUpFromLine className="h-4 w-4" /> Завантаження в ERP</h2>
            {entity.exportOnly ? (
              <p className="mt-2 text-sm text-muted-foreground">Цей розділ доступний лише для вивантаження.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">Файл Excel або CSV з рядком заголовків.</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className={`${input} mt-3`}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
                />
                {fileName && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {fileName} — {fileRows.length} рядків, {fileHeaders.length} колонок
                    <button className="ml-2 underline" onClick={resetFile}>очистити</button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {!entity.exportOnly && fileRows.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold">Відповідність колонок</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ключ пошуку дублікатів: {entity.matchColumns.length ? entity.matchColumns.join(" → ") : "не задано (усі рядки додаються як нові)"}.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {headers.map((h) => {
                const field = entity.fields.find((f) => f.key === h.key);
                return (
                  <label key={h.key} className="flex items-center gap-2 text-sm">
                    <span className="w-1/2 truncate">
                      {h.label}
                      {field?.required && <span className="text-destructive"> *</span>}
                    </span>
                    <select
                      className={`${input} w-1/2`}
                      value={mapping[h.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [h.key]: e.target.value }))}
                    >
                      <option value="">— не імпортувати —</option>
                      {fileHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Оновлювати існуючі записи (інакше — пропускати дублікати)
            </label>

            {unmappedRequired.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Не зіставлені обов'язкові поля: {unmappedRequired.map((h) => h.label).join(", ")}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`${btn} border border-border`}
                disabled={importMut.isPending || unmappedRequired.length > 0}
                onClick={() => importMut.mutate(true)}
              >
                {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Перевірити (без запису)
              </button>
              <button
                className={`${btn} bg-primary text-primary-foreground`}
                disabled={importMut.isPending || unmappedRequired.length > 0}
                onClick={() => importMut.mutate(false)}
              >
                <ArrowUpFromLine className="h-4 w-4" /> Імпортувати
              </button>
            </div>
          </section>
        )}

        {result && (
          <section className={card}>
            <h2 className="font-semibold">{result.dryRun ? "Результат перевірки" : "Результат імпорту"}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { k: "Рядків у файлі", v: result.total },
                { k: "Нових", v: result.created },
                { k: "Оновлених", v: result.updated },
                { k: "Пропущено", v: result.skipped },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-border p-3">
                  <div className={label}>{s.k}</div>
                  <div className="text-lg font-bold">{s.v}</div>
                </div>
              ))}
            </div>
            {result.issues.length > 0 && (
              <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-2">Рядок</th><th className="p-2">Проблема</th></tr>
                  </thead>
                  <tbody>
                    {result.issues.map((iss, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{iss.row}</td>
                        <td className="p-2">{iss.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
