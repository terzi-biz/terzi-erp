import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateEstimateNumber } from "./store";

export interface DraftClient {
  name: string;
  phone: string;
  address: string;
  manager: string;
}

export interface DraftLink {
  clientId: string | null;
  orderId: string | null;
}

/** Статуси, у яких дозволено автозбереження (чернеткові / робочі розрахунки). */
export const AUTOSAVE_STATUSES = new Set(["preliminary", "afterMeasure", "draft"]);

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

interface StoredDraft<I, E> {
  input: I;
  client: DraftClient;
  link: DraftLink;
  extra: E;
  estimateNumber: string;
  estimateId?: string | undefined;
  status: string;
  editsId: string;
  updatedAt: number;
}

interface Options<I, E extends object> {
  module: string;
  defaultInput: I;
  defaultExtra?: E;
  defaultManager?: string;
}

const newEditsId = () => Math.random().toString(36).slice(2, 10);

/**
 * Єдиний стан чернетки кошторису для калькуляторів.
 *
 * - усе (параметри, клієнт, привʼязка, додаткові поля, номер) тримається разом
 *   під одним ключем localStorage — тож «Скинути» дійсно скидає все;
 * - збережене НЕ підставляється автоматично: якщо є незавершена чернетка,
 *   показуємо плашку «Продовжити / Почати новий», інакше форма стартує з дефолтів;
 * - `signature` використовується для відстеження незбережених змін.
 */
export function useEstimateDraft<I extends object, E extends object = Record<string, never>>(
  opts: Options<I, E>,
) {
  const { module, defaultInput, defaultManager } = opts;
  const defaultExtra = (opts.defaultExtra ?? ({} as E));
  const storageKey = `terzi:draft:v2:${module}`;

  const emptyClient = useMemo<DraftClient>(
    () => ({ name: "", phone: "", address: "", manager: defaultManager ?? "" }),
    [defaultManager],
  );

  const [input, setInput] = useState<I>(defaultInput);
  const [client, setClient] = useState<DraftClient>(emptyClient);
  const [link, setLink] = useState<DraftLink>({ clientId: null, orderId: null });
  const [extra, setExtraState] = useState<E>(defaultExtra);
  const [estimateNumber, setEstimateNumber] = useState(() => generateEstimateNumber());
  const [estimateId, setEstimateId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>("preliminary");
  const [editsId, setEditsId] = useState(() => newEditsId());
  const [editsSig, setEditsSig] = useState("");

  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState<StoredDraft<I, E> | null>(null);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const setExtra = useCallback((patch: Partial<E>) => {
    setExtraState((s) => ({ ...s, ...patch }));
  }, []);

  // менеджер за замовчуванням підставляємо, поки поле не торкались
  useEffect(() => {
    if (!defaultManager) return;
    setClient((c) => (c.manager ? c : { ...c, manager: defaultManager }));
  }, [defaultManager]);

  // Читання незавершеної чернетки — БЕЗ автопідстановки в форму.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredDraft<I, E>;
        if (parsed && parsed.input) setPending(parsed);
      }
    } catch {
      /* сховище недоступне або пошкоджене значення */
    }
    setHydrated(true);
  }, [storageKey]);

  const signature = useMemo(
    () => JSON.stringify({ input, client, link, extra, editsSig }),
    [input, client, link, extra, editsSig],
  );

  const cleanSigRef = useRef<string>("");
  useEffect(() => {
    // базова (чиста) підпись — стан форми одразу після монтування/скидання/продовження
    if (hydrated && cleanSigRef.current === "") cleanSigRef.current = signature;
  }, [hydrated, signature]);

  const touched = signature !== cleanSigRef.current;
  const dirty = touched && signature !== savedSig;

  // Запис чернетки у сховище (щоб не губилась при перезавантаженні / зміні вкладки)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (!touched && !estimateId) return;
    const payload: StoredDraft<I, E> = {
      input, client, link, extra, estimateNumber, estimateId, status, editsId, updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* сховище переповнене — лишаємо стан у памʼяті */
    }
  }, [hydrated, touched, storageKey, input, client, link, extra, estimateNumber, estimateId, status, editsId]);

  const editsKey = `terzi:estimate-edits:${module}:${editsId}`;

  const clearEditsStorage = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    for (const suffix of ["ov", "ex", "mode", "cvm"]) {
      try {
        window.localStorage.removeItem(`terzi:estimate-edits:${module}:${id}:${suffix}`);
      } catch {
        /* ignore */
      }
    }
  }, [module]);

  /** Повне скидання: параметри, клієнт, привʼязка, правки, номер, звʼязок із записом. */
  const resetAll = useCallback(() => {
    clearEditsStorage(editsId);
    setInput(defaultInput);
    setClient(emptyClient);
    setLink({ clientId: null, orderId: null });
    setExtraState(defaultExtra);
    setEstimateNumber(generateEstimateNumber());
    setEstimateId(undefined);
    setStatus("preliminary");
    setEditsId(newEditsId());
    setEditsSig("");
    setSavedSig(null);
    setLastSavedAt(null);
    setPending(null);
    cleanSigRef.current = "";
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearEditsStorage, editsId, defaultInput, defaultExtra, emptyClient, storageKey]);

  /** Продовжити роботу над збереженою чернеткою. */
  const resumePending = useCallback(() => {
    if (!pending) return;
    setInput({ ...defaultInput, ...pending.input });
    setClient({ ...emptyClient, ...pending.client });
    setLink(pending.link ?? { clientId: null, orderId: null });
    setExtraState({ ...defaultExtra, ...(pending.extra ?? {}) });
    setEstimateNumber(pending.estimateNumber || generateEstimateNumber());
    setEstimateId(pending.estimateId);
    setStatus(pending.status || "preliminary");
    setEditsId(pending.editsId || newEditsId());
    setEditsSig("");
    setSavedSig(null);
    cleanSigRef.current = "";
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, defaultInput, defaultExtra, emptyClient]);

  /** Відхилити збережену чернетку — почати новий розрахунок. */
  const discardPending = useCallback(() => {
    if (pending?.editsId) clearEditsStorage(pending.editsId);
    setPending(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [pending, clearEditsStorage, storageKey]);

  /** Викликати після успішного збереження в базу. */
  const markSaved = useCallback((id?: string) => {
    if (id) setEstimateId(id);
    setSavedSig(signature);
    setLastSavedAt(Date.now());
  }, [signature]);

  /** Заповнення з існуючого кошториса (?estimate=…). */
  const loadRecord = useCallback((rec: {
    id: string; number: string; status?: string | null;
    client_name?: string | null; client_phone?: string | null;
    address?: string | null; manager?: string | null;
    client_id?: string | null; order_id?: string | null;
    payload?: unknown;
  }) => {
    setEstimateId(rec.id);
    setEstimateNumber(rec.number);
    setStatus(rec.status || "preliminary");
    setClient({
      name: rec.client_name ?? "", phone: rec.client_phone ?? "",
      address: rec.address ?? "", manager: rec.manager ?? "",
    });
    setLink({ clientId: rec.client_id ?? null, orderId: rec.order_id ?? null });
    if (rec.payload && typeof rec.payload === "object") {
      setInput({ ...defaultInput, ...(rec.payload as I) });
      setExtraState((e) => ({ ...e, ...(rec.payload as E) }));
    }
    setEditsId(newEditsId());
    setPending(null);
    cleanSigRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultInput]);

  return {
    input, setInput,
    client, setClient,
    link, setLink,
    extra, setExtra,
    estimateNumber, setEstimateNumber,
    estimateId, setEstimateId,
    status, setStatus,
    editsKey, setEditsSig,
    hydrated,
    dirty,
    signature,
    savedAt: lastSavedAt,
    pending,
    resumePending, discardPending,
    resetAll, markSaved, loadRecord,
    autosaveAllowed: AUTOSAVE_STATUSES.has(status),
  };
}

export type EstimateDraftApi<I extends object, E extends object = Record<string, never>> =
  ReturnType<typeof useEstimateDraft<I, E>>;
