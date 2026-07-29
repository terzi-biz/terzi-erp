/**
 * Попередній перегляд експорту кошторису (PNG / PDF) з показом розривів сторінок.
 * Розриви беруться з тієї самої логіки пагінації, що й фінальний PDF.
 */
import { useEffect, useState } from "react";
import { FileDown, ImageIcon, Loader2, X } from "lucide-react";
import { buildExportPreview, exportElementAsPdf, exportElementAsPng, type ExportPreview } from "@/lib/pngExport";

interface Props {
  target: HTMLElement | null;
  filenamePng: string;
  filenamePdf: string;
  onClose: () => void;
}

export function ExportPreviewDialog({ target, filenamePng, filenamePdf, onClose }: Props) {
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"png" | "pdf">("png");
  const [busy, setBusy] = useState<null | "png" | "pdf">(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    let url: string | null = null;
    buildExportPreview(target)
      .then((p) => {
        if (!alive) { URL.revokeObjectURL(p.pdfUrl); return; }
        url = p.pdfUrl;
        setPreview(p);
      })
      .catch(() => alive && setError("Не вдалося побудувати попередній перегляд"));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [target]);

  const savePng = async () => {
    if (!target) return;
    setBusy("png");
    try { await exportElementAsPng(target, filenamePng); } finally { setBusy(null); }
  };
  const savePdf = async () => {
    if (!target) return;
    setBusy("pdf");
    try { await exportElementAsPdf(target, filenamePdf); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-sm font-bold">Попередній перегляд експорту</div>
          <div className="flex items-center gap-2">
            <div className="flex rounded bg-secondary p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setTab("png")}
                className={`rounded px-2 py-1 ${tab === "png" ? "bg-background shadow" : ""}`}
              >PNG</button>
              <button
                onClick={() => setTab("pdf")}
                className={`rounded px-2 py-1 ${tab === "pdf" ? "bg-background shadow" : ""}`}
              >PDF</button>
            </div>
            <button onClick={onClose} aria-label="Закрити" className="rounded p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-muted/40 p-3">
          {error && <div className="text-center text-xs text-destructive">{error}</div>}
          {!preview && !error && (
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Готуємо перегляд…
            </div>
          )}
          {preview && tab === "png" && (
            <div className="relative mx-auto w-full max-w-2xl bg-white shadow">
              <img src={preview.imageUrl} alt="Прев'ю кошторису" className="block w-full" />
              {preview.breakRatios.map((r, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-primary"
                  style={{ top: `${r * 100}%` }}
                >
                  <span className="absolute right-1 -top-5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    Розрив • стор. {i + 2}
                  </span>
                </div>
              ))}
            </div>
          )}
          {preview && tab === "pdf" && (
            <iframe title="PDF прев'ю" src={preview.pdfUrl} className="h-[70vh] w-full rounded border bg-white" />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            {preview ? `Сторінок у PDF: ${preview.totalPages}${preview.breakRatios.length ? " • розриви показані пунктиром" : " • вміщується на одну сторінку"}` : "—"}
          </div>
          <div className="flex gap-2">
            <button
              onClick={savePng}
              disabled={busy !== null || !preview}
              className="inline-flex items-center gap-2 rounded bg-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {busy === "png" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} Зберегти PNG
            </button>
            <button
              onClick={savePdf}
              disabled={busy !== null || !preview}
              className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />} Зберегти PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
