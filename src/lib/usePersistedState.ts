import { useEffect, useRef, useState } from "react";

/**
 * Стан, який переживає перемикання вкладок браузера, повернення на сторінку
 * та перезавантаження: значення зберігається в localStorage під стабільним ключем.
 * Читання відбувається після монтування (щоб не ламати SSR-гідратацію),
 * а зміни синхронізуються між вкладками через подію `storage`.
 */
export function usePersistedState<T>(
  key: string | null,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  // Гідратація зі сховища після монтування / зміни ключа
  useEffect(() => {
    if (!key || typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch {
      /* сховище недоступне */
    }
    setHydrated(true);
  }, [key]);

  // Збереження
  useEffect(() => {
    if (!hydrated || !key || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* сховище недоступне — значення лишається лише в памʼяті */
    }
  }, [key, state, hydrated]);

  // Синхронізація між вкладками
  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== keyRef.current || e.newValue == null) return;
      try {
        setState(JSON.parse(e.newValue) as T);
      } catch {
        /* ігноруємо пошкоджене значення */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [state, setState, hydrated];
}
