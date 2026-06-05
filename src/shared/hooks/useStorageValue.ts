import { useEffect, useState } from "react";

// Generic bridge between an async chrome.storage getter and React state: one
// initial read, then re-reads whenever the watched key changes in its area.
export const useStorageValue = <T>(
  read: () => Promise<T>,
  key: string,
  area: "local" | "session",
  fallback: T,
): [T, boolean] => {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    read().then((initial) => {
      setValue(initial);
      setLoaded(true);
    });

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      changedArea: string,
    ) => {
      if (changedArea === area && changes[key] != null) {
        read().then(setValue);
      }
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return [value, loaded];
};
