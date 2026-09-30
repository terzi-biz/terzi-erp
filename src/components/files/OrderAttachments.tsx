/**
 * Єдиний блок вкладень замовлення: фото з камери/галереї, PDF, креслення.
 * Файли лежать у приватному сховищі `order-files/<order_id>/…` і завжди
 * прив'язані до замовлення, тож автоматично видні в картці замовлення.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveOrderFile, deleteOrderFile, listLinkedFiles } from "@/lib/orders.functions";

export const FILE_CATEGORIES = {
  measurement: ["Фото вузлів", "План / схема", "Фото обʼєкта", "Інше"],
  estimate: ["Договір", "Технічне завдання", "Креслення", "План", "Інше"],
  order: ["Договір", "Технічне завдання", "Креслення", "План", "Фото вузлів", "Фото обʼєкта", "Акт", "Інше"],
} as const;

interface Props {
  orderId: string | null | undefined;
  measurementId?: string | null;
  estimateId?: string | null;
  scope: keyof typeof FILE_CATEGORIES;
  /** Показати всі файли замовлення (для картки замовлення). */
  showAllOfOrder?: boolean;
  title?: string;
}

const isImage = (m?: string | null, n?: string | null) =>
  (m ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(n ?? "");

function useSignedUrl(path?: string | null, fallback?: string) {
  const [url, setUrl] = useState<string | undefined>(path ? undefined : fallback);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    supabase.storage.from("order-files").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}

function FileTile({ f, onDelete }: { f: any; onDelete: () => void }) {
  const url = useSignedUrl(f.storage_path, f.url);
  const img = isImage(f.mime_type, f.file_name);
  return (
    <div className="relative rounded-md border border-border overflow-hidden bg-card">
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {img && url ? (
          <img src={url} alt={f.file_name ?? ""} className="h-28 w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-28 grid place-items-center bg-muted"><FileText className="w-8 h-8 text-muted-foreground" /></div>
        )}
        <div className="p-2">
          <div className="text-xs font-semibold truncate">{f.file_name ?? "Файл"}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {f.category ?? "—"} · {new Date(f.created_at).toLocaleDateString("uk-UA")}
          </div>
        </div>
      </a>
      <button type="button" onClick={onDelete} aria-label="Видалити"
        className="absolute top-1 right-1 h-9 w-9 grid place-items-center rounded-full bg-background/90 text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export function OrderAttachments({ orderId, measurementId, estimateId, scope, showAllOfOrder, title }: Props) {
  const cats = FILE_CATEGORIES[scope];
  const [category, setCategory] = useState<string>(cats[0]);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOrderFile);
  const delFn = useServerFn(deleteOrderFile);
  const listFn = useServerFn(listLinkedFiles);

  const filter = showAllOfOrder
    ? { order_id: orderId }
    : measurementId ? { measurement_id: measurementId } : estimateId ? { estimate_id: estimateId } : { order_id: orderId };
  const key = ["linked-files", filter];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: filter }), enabled: !!orderId });
  const files = (q.data ?? []) as any[];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["linked-files"] });
    if (orderId) qc.invalidateQueries({ queryKey: ["object", orderId] });
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length || !orderId) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(list)) {
      if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name}: більше 20 МБ`); continue; }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${orderId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("order-files").upload(path, file, { contentType: file.type });
      if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
      try {
        await saveFn({ data: {
          order_id: orderId, url: `storage://order-files/${path}`, file_name: file.name, category,
          measurement_id: measurementId ?? null, estimate_id: estimateId ?? null,
          storage_path: path, mime_type: file.type || null, size_bytes: file.size,
        } });
        ok++;
      } catch (e) {
        await supabase.storage.from("order-files").remove([path]);
        toast.error(e instanceof Error ? e.message : "Помилка збереження");
      }
    }
    setBusy(false);
    if (ok) { toast.success(`Додано файлів: ${ok}`); refresh(); }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => { void upload(e.target.files); e.target.value = ""; };

  if (!orderId) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Paperclip className="w-4 h-4" />
        Щоб додати файли, спочатку привʼяжіть до замовлення — тоді вони будуть видні і в картці замовлення.
      </div>
    );
  }

  const btn = "min-h-11 px-3 rounded-md border border-border bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50";

  return (
    <div className="space-y-3">
      {title && <div className="text-sm font-bold flex items-center gap-2"><Paperclip className="w-4 h-4" />{title}{files.length ? ` (${files.length})` : ""}</div>}
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`min-h-9 px-3 rounded-full text-xs font-semibold border ${category === c ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className={btn}><Camera className="w-4 h-4" />Камера</button>
        <button type="button" disabled={busy} onClick={() => galleryRef.current?.click()} className={btn}><ImagePlus className="w-4 h-4" />Галерея</button>
        <button type="button" disabled={busy} onClick={() => docRef.current?.click()} className={btn}><FileText className="w-4 h-4" />Документ</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,image/*" multiple className="hidden" onChange={onPick} />
      {busy && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Завантаження…</div>}
      {files.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files.map((f) => (
            <FileTile key={f.id} f={f} onDelete={async () => {
              if (!confirm("Видалити файл?")) return;
              try { await delFn({ data: { id: f.id } }); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
            }} />
          ))}
        </div>
      ) : !q.isLoading && <div className="text-xs text-muted-foreground">Файлів ще немає.</div>}
    </div>
  );
}
