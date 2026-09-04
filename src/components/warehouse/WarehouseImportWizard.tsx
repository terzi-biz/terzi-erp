import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileJson, Loader2, ShieldAlert, Upload } from "lucide-react";
import {
  DECISION_LABELS,
  SOURCE_KIND_LABELS,
  parseStagingJson,
  sha256Hex,
  validateStagingFile,
  type ParsedStagingFile,
} from "@/lib/warehouse-import";
import {
  closeWarehouseImportRun,
  getWarehouseImportAccess,
  listWarehouseImportRows,
  listWarehouseImportRuns,
  previewWarehouseImport,
  promoteWarehouseImportRows,
  reviewWarehouseImportRow,
  stageWarehouseImportChunk,
  startWarehouseImportRun,
} from "@/lib/warehouse-import.functions";

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50";
const CHUNK = 200;

/** Майстер проміжного імпорту: перегляд джерела → черга перевірки → рішення → створення SKU. */
export function WarehouseImportWizard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedStagingFile | null>(null);
  const [fileHash, setFileHash] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [problems, setProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [staging, setStaging] = useState<{ done: number; total: number } | null>(null);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const accessFn = useServerFn(getWarehouseImportAccess);
  const previewFn = useServerFn(previewWarehouseImport);
  const startFn = useServerFn(startWarehouseImportRun);
  const chunkFn = useServerFn(stageWarehouseImportChunk);
  const runsFn = useServerFn(listWarehouseImportRuns);

  const access = useQuery({ queryKey: ["wh-import-access"], queryFn: () => accessFn() });
  const runs = useQuery({
    queryKey: ["wh-import-runs"],
    queryFn: () => runsFn(),
    enabled: access.data?.allowed === true,
  });

  if (access.isLoading) return <div className="p-6 text-sm text-muted-foreground">Перевірка прав…</div>;
  if (!access.data?.allowed) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-warning shrink-0" />
        <div>
          <div className="font-bold">Немає доступу до імпорту</div>
          <div className="text-muted-foreground mt-1">
            Пакет містить конфіденційні дані постачальника й архівні ціни. Доступ мають лише власник,
            адміністратор, директор або фінансист.
          </div>
        </div>
      </div>
    );
  }

  async function onFile(f: File) {
    setPreview(null); setParsed(null); setStaging(null);
    const text = await f.text();
    let p: ParsedStagingFile;
    try { p = parseStagingJson(text); } catch { toast.error("Файл не є коректним JSON"); return; }
    const probs = validateStagingFile(p);
    const hash = await sha256Hex(text);
    setParsed(p); setProblems(probs); setFileHash(hash); setFileName(f.name);
    const res = await previewFn({
      data: {
        bundleId: p.header.bundle_id,
        schemaVersion: p.header.schema_version,
        fileSha256: hash,
        fileBytes: p.fileBytes,
        sourceCommit: p.header.source_commit,
        sourceName: f.name,
        productionImportAllowed: p.header.production_import_allowed,
        counters: p.actualCounts as any,
        problems: probs,
      },
    });
    setPreview(res);
  }

  const stageMut = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Файл не завантажено");
      const started = await startFn({
        data: {
          bundleId: parsed.header.bundle_id,
          schemaVersion: parsed.header.schema_version,
          fileSha256: fileHash,
          fileBytes: parsed.fileBytes,
          sourceCommit: parsed.header.source_commit,
          sourceName: fileName,
          productionImportAllowed: parsed.header.production_import_allowed,
          counters: parsed.actualCounts as any,
          problems,
        },
      });
      const runId = (started as any).run.id as string;
      let inserted = 0, unchanged = 0, revised = 0;
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const slice = parsed.rows.slice(i, i + CHUNK);
        const res: any = await chunkFn({ data: { runId, rows: slice as any } });
        inserted += res.inserted; unchanged += res.unchanged; revised += res.revised;
        setStaging({ done: Math.min(i + CHUNK, parsed.rows.length), total: parsed.rows.length });
      }
      return { runId, inserted, unchanged, revised };
    },
    onSuccess: (r) => {
      setActiveRun(r.runId);
      toast.success(`Записано в чергу: нових ${r.inserted}, без змін ${r.unchanged}, оновлено ${r.revised}`);
      qc.invalidateQueries({ queryKey: ["wh-import-runs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка запису в чергу"),
    onSettled: () => setStaging(null),
  });

  const runRows = (runs.data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="font-bold flex items-center gap-2"><FileJson className="w-4 h-4 text-primary" /> Файл проміжного імпорту (schema 1.0.0)</div>
        <input ref={fileRef} type="file" accept="application/json,.json" className={input}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />

        {parsed && (
          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-secondary/50 px-3 py-2 text-xs">
              Стан: <b>{preview ? "тільки перегляд джерела — у чергу нічого не записано" : "перевірка…"}</b>
            </div>
            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              <div>Пакет: <b>{parsed.header.bundle_id || "—"}</b></div>
              <div>Розмір: <b>{(parsed.fileBytes / 1048576).toFixed(2)} MiB</b></div>
              <div>Комміт джерела: <b className="font-mono">{parsed.header.source_commit?.slice(0, 10) ?? "—"}</b></div>
              {Object.entries(parsed.actualCounts).map(([k, v]) => (
                <div key={k}>{SOURCE_KIND_LABELS[k as keyof typeof SOURCE_KIND_LABELS]}: <b>{v}</b></div>
              ))}
            </div>
            {!parsed.header.production_import_allowed && (
              <div className="text-xs flex items-start gap-2 text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                У пакеті production_import_allowed=false: рядки лягають у чергу перевірки, автоматичне створення SKU заборонене.
              </div>
            )}
            {problems.length > 0 && (
              <ul className="text-xs text-destructive list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
            {preview?.existingRun && (
              <div className="text-xs text-muted-foreground">Такий самий файл уже завантажували {new Date(preview.existingRun.created_at).toLocaleString("uk-UA")} — повтор нічого не задублює.</div>
            )}
            <button className={`${btn} bg-primary text-primary-foreground`}
              disabled={!preview?.ok || stageMut.isPending}
              onClick={() => stageMut.mutate()}>
              {stageMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Записати в чергу перевірки
            </button>
            {staging && <div className="text-xs text-muted-foreground">Записано {staging.done} / {staging.total}…</div>}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="font-bold">Запуски імпорту</div>
        {runRows.length === 0 && <div className="text-xs text-muted-foreground">Черга порожня.</div>}
        {runRows.map((r) => (
          <button key={r.id} onClick={() => setActiveRun(r.id)}
            className={`w-full text-left rounded-md border px-3 py-2 text-xs ${activeRun === r.id ? "border-primary" : "border-border"}`}>
            <div className="font-semibold">{r.bundle_id} · {r.status}</div>
            <div className="text-muted-foreground">
              рядків {r.rows_total} · {Object.entries(r.by_decision ?? {}).map(([k, v]) => `${DECISION_LABELS[k] ?? k}: ${v}`).join(" · ") || "—"}
            </div>
          </button>
        ))}
      </div>

      {activeRun && <ReviewQueue runId={activeRun} />}
    </div>
  );
}

function ReviewQueue({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const rowsFn = useServerFn(listWarehouseImportRows);
  const reviewFn = useServerFn(reviewWarehouseImportRow);
  const promoteFn = useServerFn(promoteWarehouseImportRows);
  const closeFn = useServerFn(closeWarehouseImportRun);

  const [kind, setKind] = useState<string>("requirement");
  const [decision, setDecision] = useState<string>("needs_review");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, any>>({});

  const rows = useQuery({
    queryKey: ["wh-import-rows", runId, kind, decision, q, page],
    queryFn: () => rowsFn({ data: { runId, kind: kind as any, decision: (decision || undefined) as any, q: q || undefined, limit: 25, offset: page * 25 } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wh-import-rows"] });
    qc.invalidateQueries({ queryKey: ["wh-import-runs"] });
    qc.invalidateQueries({ queryKey: ["stock-items"] });
  };

  const reviewMut = useMutation({
    mutationFn: (v: any) => reviewFn({ data: v }),
    onSuccess: () => { toast.success("Рішення збережено"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const promoteMut = useMutation({
    mutationFn: (ids: string[]) => promoteFn({ data: { rowIds: ids } }),
    onSuccess: (r: any) => {
      toast.success(`Створено SKU: ${r.created.length}. Пропущено: ${r.skipped.length}`);
      if (r.skipped.length) toast.message(r.skipped.slice(0, 5).map((s: any) => `${s.external_key}: ${s.reason}`).join("\n"));
      setSelected({}); refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const data = (rows.data as any) ?? { rows: [], total: 0 };
  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <select className={`${input} max-w-[200px]`} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}>
          {Object.entries(SOURCE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={`${input} max-w-[180px]`} value={decision} onChange={(e) => { setDecision(e.target.value); setPage(0); }}>
          <option value="">Усі рішення</option>
          {Object.entries(DECISION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={`${input} max-w-[240px]`} placeholder="Пошук за ключем…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <div className="text-xs text-muted-foreground">Знайдено: {data.total}</div>
        <div className="ml-auto flex gap-2">
          <button className={`${btn} bg-primary text-primary-foreground`} disabled={!selectedIds.length || promoteMut.isPending}
            onClick={() => promoteMut.mutate(selectedIds)}>
            <CheckCircle2 className="w-4 h-4" /> Створити SKU ({selectedIds.length})
          </button>
          <button className={`${btn} border border-border`} onClick={() => closeFn({ data: { runId } }).then(refresh)}>Закрити запуск</button>
        </div>
      </div>

      <div className="space-y-2">
        {data.rows.map((r: any) => {
          const n = r.normalized_payload ?? {};
          const e = edits[r.id] ?? {};
          const val = (k: string) => (e[k] !== undefined ? e[k] : n[k] ?? "");
          const set = (k: string, v: any) => setEdits((s) => ({ ...s, [r.id]: { ...(s[r.id] ?? {}), [k]: v } }));
          return (
            <div key={r.id} className="rounded-md border border-border p-3 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={!!selected[r.id]} disabled={r.decision !== "verified"}
                  onChange={(ev) => setSelected((s) => ({ ...s, [r.id]: ev.target.checked }))} />
                <div className="flex-1">
                  <div className="font-semibold">{n.name ?? "Без назви"}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{r.external_key} · рев. {r.revision} · {DECISION_LABELS[r.decision] ?? r.decision}{r.conflict ? " · конфлікт" : ""}</div>
                  {n.origin_note && <div className="text-[11px] text-muted-foreground">{n.origin_note}</div>}
                </div>
              </div>

              <div className="grid sm:grid-cols-4 gap-2">
                <input className={input} placeholder="Назва" value={val("name")} onChange={(ev) => set("name", ev.target.value)} />
                <input className={input} placeholder="Артикул" value={val("sku")} onChange={(ev) => set("sku", ev.target.value)} />
                <input className={input} placeholder="Одиниця ERP" value={val("unit_erp")} onChange={(ev) => set("unit_erp", ev.target.value)} />
                <input className={input} placeholder="Напрямок" value={val("module_resolved")} onChange={(ev) => set("module_resolved", ev.target.value)} />
                <input className={`${input} sm:col-span-2`} placeholder="UUID позиції каталогу (за наявності)" value={val("catalog_item_id")} onChange={(ev) => set("catalog_item_id", ev.target.value)} />
                <input className={`${input} sm:col-span-2`} placeholder="Категорія / сімейство" value={val("category")} onChange={(ev) => set("category", ev.target.value)} />
              </div>

              <div className="text-[11px] text-muted-foreground">
                Ціна: {n.price_known ? `${n.price_value} грн` : "невідома"} · Упаковка: {n.pack_factor ? `${n.pack_factor} ${n.unit_erp ?? ""} / ${n.pack_label ?? "уп"}` : "невідома"}
              </div>
              {(r.issues ?? []).length > 0 && (
                <ul className="text-[11px] list-disc pl-4">
                  {(r.issues as any[]).map((i, idx) => (
                    <li key={idx} className={i.blocking ? "text-destructive" : "text-muted-foreground"}>{i.message}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                {(["verified", "needs_review", "excluded"] as const).map((d) => (
                  <button key={d} className={`${btn} border border-border text-xs`} disabled={r.decision === "created" || reviewMut.isPending}
                    onClick={() => reviewMut.mutate({
                      rowId: r.id,
                      expectedRevision: r.revision,
                      decision: d,
                      mapping: {
                        name: (e.name ?? n.name) || null,
                        sku: (e.sku ?? n.sku) || null,
                        unit_erp: (e.unit_erp ?? n.unit_erp) || null,
                        module_resolved: (e.module_resolved ?? n.module_resolved) || null,
                        catalog_item_id: (e.catalog_item_id ?? n.catalog_item_id) || null,
                        category: (e.category ?? n.category) || null,
                      },
                    })}>
                    {DECISION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {data.rows.length === 0 && <div className="text-xs text-muted-foreground p-4 text-center">Рядків за фільтром немає.</div>}
      </div>

      <div className="flex gap-2 justify-end text-xs">
        <button className={`${btn} border border-border`} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Назад</button>
        <button className={`${btn} border border-border`} disabled={(page + 1) * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>Далі</button>
      </div>
    </div>
  );
}
