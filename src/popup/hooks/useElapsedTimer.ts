import { useEffect, useState } from "react";

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const useElapsedTimer = (startedAt: number | null): string => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) {
      return;
    }

    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt == null) {
    return "00:00";
  }

  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`;
};
