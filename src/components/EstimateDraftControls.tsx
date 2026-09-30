import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Рендер вікон у body, щоб їх не обрізали батьківські контейнери з transform/overflow. */
function BodyPortal({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok ? createPortal(children, document.body) : null;
}
import { RotateCcw, Save, Check, CloudOff, Loader2, History, Lock, X, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderAttachments } from "@/components/files/OrderAttachments";
import { recordDraftVersion, listEstimateVersions, getEstimateVersion } from "@/lib/estimates.functions";

interface DraftLike {
  dirty: boolean;
  hydrated: boolean;
  autosaveAllowed: boolean;
  savedAt: number | null;
  estimateId?: string | undefined;
  pending: { updatedAt: number } | null;
  resumePending: () => void;
  discardPending: () => void;
  resetAll: () => void;
  markSaved: (id?: string) => void;
  loadRecord?: (rec: any) => void;
  snapshot?: { savedAt?: unknown; createdAt?: unknown; [k: string]: unknown } | null;
  useCurrentPrices?: () => void;
  link?: { orderId: string | null };
}

const KIND_LABEL: Record<string, string> = { draft: "Робоча", approved: "Затверджена", production: "Виробнича" };

interface Props {
  draft: DraftLike;
  /** Збереження в базу; має повернути збережений рядок (для id). */
  onSave: () => Promise<{ id?: string } | unknown>;
  /** Чи можна автозберігати (наприклад, площа > 0). */
  canAutosave?: boolean;
  /** Якщо задано — збереження заблоковано (напр. позиція з нульовою ціною). */
  blockReason?: string | null;
  className?: string;
  buttonClass?: string;
}

const AUTOSAVE_DELAY = 2000;

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Автозбереження кошториса + індикатор стану + повне скидання + захист від
 * втрати незбережених змін при переході в інший розділ / закритті вкладки.
 */
export function EstimateDraftControls({ draft, onSave, canAutosave = true, blockReason, className, buttonClass }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);
  const savingRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const qc = useQueryClient();
  const recordFn = useServerFn(recordDraftVersion);
  const listFn = useServerFn(listEstimateVersions);
  const getVerFn = useServerFn(getEstimateVersion);
  const estId = draft.estimateId;
  const versionsQ = useQuery({
    queryKey: ["estimate-versions", estId],
    queryFn: () => listFn({ data: { estimate_id: estId! } }),
    enabled: !!estId,
  });
  const versions = versionsQ.data ?? [];
  const restore = async (versionId: string, no: number) => {
    try {
      const v: any = await getVerFn({ data: { id: versionId } });
      draft.loadRecord?.({ ...(v.snapshot ?? {}), id: v.estimate_id });
      setShowHistory(false);
      toast.success(`Відновлено версію ${no}. Збережіть, щоб зробити її поточною.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не вдалося відновити"); }
  };

  const btn = buttonClass
    ?? "px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50";

  const doSave = useCallback(async (silent: boolean) => {
    if (blockReason) {
      setError(blockReason);
      if (!silent) toast.error(blockReason);
      return false;
    }
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const row = (await onSave()) as { id?: string } | undefined;
      draft.markSaved(row?.id);
      const id = row?.id ?? draft.estimateId;
      if (id) {
        try {
          const r = await recordFn({ data: { estimate_id: id, mode: silent ? "auto" : "manual" } });
          if (r.created) qc.invalidateQueries({ queryKey: ["estimate-versions", id] });
        } catch { /* версія не блокує збереження */ }
      }
      if (!silent) toast.success("Кошторис збережено");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не вдалося зберегти";
      setError(msg);
      if (!silent) toast.error("Помилка збереження: " + msg);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, onSave, blockReason, recordFn, qc]);

  // Автозбереження з дебаунсом
  useEffect(() => {
    if (!draft.hydrated || !draft.dirty || !canAutosave || !draft.autosaveAllowed || blockReason) return;
    const timer = setTimeout(() => { void doSave(true); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft.hydrated, draft.dirty, draft.autosaveAllowed, canAutosave, blockReason, doSave]);

  const blocker = useBlocker({
    shouldBlockFn: () => draft.dirty,
    enableBeforeUnload: () => draft.dirty,
    withResolver: true,
  });

  const stateLabel = saving
    ? { icon: <Loader2 className="w-3 h-3 animate-spin" />, text: "Збереження…", cls: "text-muted-foreground" }
    : error
      ? { icon: <CloudOff className="w-3 h-3" />, text: "Не збережено", cls: "text-destructive" }
      : draft.dirty
        ? { icon: <CloudOff className="w-3 h-3" />, text: draft.autosaveAllowed ? "Є зміни…" : "Не збережено", cls: "text-amber-500" }
        : draft.savedAt
          ? { icon: <Check className="w-3 h-3" />, text: `Збережено о ${fmtTime(draft.savedAt)}`, cls: "text-primary" }
          : null;

  return (
    <>
      <div className={className ?? "flex flex-wrap items-center gap-2"}>
        {stateLabel && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${stateLabel.cls}`}>
            {stateLabel.icon}{stateLabel.text}
          </span>
        )}
        {estId && (
          <button type="button" onClick={() => setShowHistory(true)} className={btn}>
            <History className="w-3.5 h-3.5" />Історія версій ({versions.length})
          </button>
        )}
        {estId && (
          <button type="button" onClick={() => setShowFiles(true)} className={btn}>
            <Paperclip className="w-3.5 h-3.5" />Файли
          </button>
        )}
        <button type="button" onClick={() => setAskReset(true)} className={btn}>
          <RotateCcw className="w-3.5 h-3.5" />Скинути
        </button>
        <button type="button" onClick={() => void doSave(false)} disabled={saving || !!blockReason} className={btn}>
          <Save className="w-3.5 h-3.5" />{saving ? "…" : "Зберегти"}
        </button>
      </div>

      {draft.snapshot && draft.useCurrentPrices && (
        <div className="w-full mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="flex-1 min-w-[180px]">Ціни й норми зафіксовані на момент збереження кошторису.</span>
          <button type="button" onClick={() => { draft.useCurrentPrices?.(); toast.info("Підставлено актуальні ціни довідника"); }}
            className="px-3 py-1.5 rounded-md bg-secondary font-semibold">Оновити до актуальних цін</button>
        </div>
      )}

      <BodyPortal>
      {showFiles && estId && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-background/70" onClick={() => setShowFiles(false)}>
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-lg shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted sm:hidden" />
            <div className="flex items-center justify-between">
              <h2 className="font-black text-base">Документи кошторису</h2>
              <button onClick={() => setShowFiles(false)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted" aria-label="Закрити"><X className="w-5 h-5" /></button>
            </div>
            <OrderAttachments orderId={draft.link?.orderId ?? null} estimateId={estId} scope="estimate" />
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-background/70" onClick={() => setShowHistory(false)}>
          <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-lg shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted sm:hidden" />
            <div className="flex items-center justify-between">
              <h2 className="font-black text-base">Історія версій</h2>
              <button onClick={() => setShowHistory(false)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted" aria-label="Закрити"><X className="w-5 h-5" /></button>
            </div>
            {versionsQ.isLoading && <p className="text-sm text-muted-foreground">Завантаження…</p>}
            {!versionsQ.isLoading && versions.length === 0 && <p className="text-sm text-muted-foreground">Версій ще немає — вони з'являться після збереження.</p>}
            <ul className="space-y-2">
              {versions.map((v: any, i: number) => (
                <li key={v.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">Версія {v.version_no}{i === 0 ? " · остання" : ""}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {KIND_LABEL[v.snapshot_kind] ?? v.snapshot_kind} · {v.approved_by_name || "—"} · {fmtDateTime(new Date(v.created_at).getTime())}
                    </div>
                  </div>
                  <button onClick={() => void restore(v.id, v.version_no)} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold">Відновити</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Плашка «є незавершена чернетка» */}
      {draft.hydrated && draft.pending && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,560px)] rounded-lg border border-border bg-card shadow-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <History className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Є незавершений розрахунок від {fmtDateTime(draft.pending.updatedAt)}.
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={draft.discardPending}
              className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold">Почати новий</button>
            <button type="button" onClick={draft.resumePending}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold">Продовжити</button>
          </div>
        </div>
      )}

      {/* Підтвердження скидання */}
      {askReset && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 p-4">
          <div className="max-w-sm w-full p-5 space-y-4 bg-card border border-border rounded-lg shadow-xl">
            <h2 className="font-black text-base">Скинути розрахунок?</h2>
            <p className="text-sm text-muted-foreground">
              Будуть очищені параметри, дані замовника, привʼязка до клієнта/замовлення та ручні правки
              в кошторисі. Буде згенеровано новий номер кошторису.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => setAskReset(false)} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold">Скасувати</button>
              <button onClick={() => { draft.resetAll(); setAskReset(false); toast.success("Форму очищено"); }}
                className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs font-bold">Скинути все</button>
            </div>
          </div>
        </div>
      )}

      {/* Незбережені зміни при переході */}
      {blocker.status === "blocked" && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 p-4">
          <div className="max-w-sm w-full p-5 space-y-4 bg-card border border-border rounded-lg shadow-xl">
            <h2 className="font-black text-base">Незбережені зміни</h2>
            <p className="text-sm text-muted-foreground">У розрахунку є незбережені зміни. Зберегти перед переходом?</p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => blocker.reset()} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold">Скасувати</button>
              <button onClick={() => blocker.proceed()} className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs font-semibold">Відкинути</button>
              <button onClick={async () => { if (await doSave(true)) blocker.proceed(); }} disabled={saving}
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      )}
      </BodyPortal>
    </>
  );
}
