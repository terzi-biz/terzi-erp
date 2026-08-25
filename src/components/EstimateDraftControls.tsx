import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Save, Check, CloudOff, Loader2, History } from "lucide-react";
import { toast } from "sonner";

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
}

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
  }, [draft, onSave, blockReason]);

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
        <button type="button" onClick={() => setAskReset(true)} className={btn}>
          <RotateCcw className="w-3.5 h-3.5" />Скинути
        </button>
        <button type="button" onClick={() => void doSave(false)} disabled={saving || !!blockReason} className={btn}>
          <Save className="w-3.5 h-3.5" />{saving ? "…" : "Зберегти"}
        </button>
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
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
    </>
  );
}
