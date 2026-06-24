import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCatalog, upsertCatalogItem } from "@/lib/catalog.functions";
import {
  parsePriceFile, autoMatch,
  type ParsedPriceRow, type MatchedRow, type CatalogTarget,
} from "@/lib/price-import";
import { toast } from "sonner";
import { Upload, X, FileSpreadsheet, CheckCircle2 } from "lucide-react";

type Module = "screed" | "roofing" | "insulation" | "demolition";
type Kind = "material" | "work";

interface Props {
  module: Module;
  kind: Kind;
  onClose: () => void;
}

export function PriceImportDialog({ module, kind, onClose }: Props) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCatalog);
  const upsert = useServerFn(upsertCatalogItem);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ParsedPriceRow[]>([]);
  const [matches, setMatches] = useState<MatchedRow[]>([]);
  const [supplier, setSupplier] = useState("");
  const [parsing, setParsing] = useState(false);

  const catalogQ = useQuery({
    queryKey: ["catalog", module, kind, "import"],
    queryFn: () => fetchList({ data: { module, kind } }),
    staleTime: 30_000,
  });

  const targets: CatalogTarget[] = useMemo(() => {
    const list = (catalogQ.data ?? []) as Array<{
      id: string; code: string | null; name: string; unit: string;
      buy_price: number; sell_price: number;
    }>;
    return list.map((r) => ({ ...r, kind }));
  }, [catalogQ.data, kind]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setParsing(true);
    try {
      const parsed = await parsePriceFile(f);
      setRows(parsed);
      setMatches(autoMatch(parsed, targets));
      if (!parsed.length) toast.error("У файлі не знайдено рядків з назвою + ціною");
      else toast.success(`Завантажено ${parsed.length} рядків`);
    } catch (e) {
      toast.error("Не вдалось прочитати файл: " + (e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const updMatch = (i: number, patch: Partial<MatchedRow>) =>
    setMatches((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const applyMut = useMutation({
    mutationFn: async () => {
      const toApply = matches.filter((m) => m.accept && m.targetId);
      for (const m of toApply) {
        const tgt = targets.find((t) => t.id === m.targetId);
        if (!tgt) continue;
        await upsert({ data: {
          id: tgt.id, module, kind,
          code: tgt.code, name: tgt.name, unit: tgt.unit,
          buy_price: m.row.price,
          sell_price: tgt.sell_price,
          is_custom: true, is_active: true, sort_order: 0,
        } });
      }
      return toApply.length;
    },
    onSuccess: (n) => {
      toast.success(`Оновлено закупівельні ціни: ${n}`);
      qc.invalidateQueries({ queryKey: ["catalog"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Помилка збереження: " + e.message),
  });

  const acceptedCount = matches.filter((m) => m.accept && m.targetId).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-bold">Імпорт прайсу постачальника</h2>
            <p className="text-xs text-muted-foreground">
              Модуль: <b>{module}</b> · Тип: <b>{kind === "material" ? "Матеріали" : "Роботи"}</b> · Excel (.xlsx) або CSV
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden
              onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
              <Upload className="w-3 h-3" /> Завантажити файл
            </button>
            <input className="bg-input border border-border rounded px-3 py-2 text-sm"
              placeholder="Постачальник (опц.)" value={supplier}
              onChange={(e) => setSupplier(e.target.value)} />
            {parsing && <span className="text-xs text-muted-foreground">Парсинг…</span>}
            {rows.length > 0 && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3" /> {rows.length} рядків · {acceptedCount} до застосування
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Очікувані колонки: <code>Назва / Найменування</code>, <code>Ціна</code>, опц. <code>Од.</code>, <code>Постачальник</code>, <code>Код/SKU</code>.
            Автоматичне співставлення за назвою — підтвердьте або змініть позицію калькулятора.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!rows.length && (
            <div className="text-center text-sm text-muted-foreground py-10">
              Завантажте файл, щоб переглянути співставлення.
            </div>
          )}
          {rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border sticky top-0 bg-card">
                <tr>
                  <th className="text-left p-2 w-8">✓</th>
                  <th className="text-left p-2">Назва з прайсу</th>
                  <th className="text-right p-2 w-24">Ціна</th>
                  <th className="text-left p-2 w-[35%]">Позиція калькулятора</th>
                  <th className="text-right p-2 w-16">Точність</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="p-2">
                      <input type="checkbox" checked={m.accept}
                        onChange={(e) => updMatch(i, { accept: e.target.checked })} />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{m.row.name}</div>
                      {m.row.supplier && <div className="text-[10px] text-muted-foreground">{m.row.supplier}</div>}
                    </td>
                    <td className="p-2 text-right font-mono">{m.row.price.toLocaleString("uk-UA")} ₴</td>
                    <td className="p-2">
                      <select className="w-full bg-input border border-border rounded px-2 py-1 text-xs"
                        value={m.targetId ?? ""}
                        onChange={(e) => updMatch(i, { targetId: e.target.value || null })}>
                        <option value="">— не прив'язувати —</option>
                        {targets.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.unit}) — поточна купівля {t.buy_price} ₴
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-right">
                      <span className={`inline-flex items-center gap-1 ${m.score >= 0.5 ? "text-success" : m.score >= 0.35 ? "text-warning" : "text-muted-foreground"}`}>
                        {m.score >= 0.5 && <CheckCircle2 className="w-3 h-3" />}
                        {Math.round(m.score * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="border-t border-border p-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {acceptedCount > 0
              ? `Буде оновлено ${acceptedCount} закупівельних цін у каталозі.`
              : "Підтвердіть позиції чекбоксом і виберіть прив'язку."}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-secondary text-xs font-semibold">Скасувати</button>
            <button onClick={() => applyMut.mutate()} disabled={!acceptedCount || applyMut.isPending}
              className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">
              {applyMut.isPending ? "Збереження…" : "Застосувати"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
