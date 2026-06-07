import { useEffect, useState } from "react";

import { fetchTodaySessions, type InboxSession } from "../../shared/gateway";

export type SessionsStatus = "idle" | "loading" | "ready" | "error";

export interface TodaySessions {
  sessions: InboxSession[];
  status: SessionsStatus;
}

export const useTodaySessions = (token: string | null): TodaySessions => {
  const [sessions, setSessions] = useState<InboxSession[]>([]);
  const [status, setStatus] = useState<SessionsStatus>("idle");

  useEffect(() => {
    if (token == null) {
      setStatus("idle");
      setSessions([]);
      return;
    }

    let cancelled = false;
    setStatus("loading");

    fetchTodaySessions(token)
      .then((result) => {
        if (!cancelled) {
          setSessions(result);
          setStatus("ready");
        }
      })
      .catch((error) => {
        console.warn("[recorder] session inbox fetch failed:", error);

        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return { sessions, status };
};
