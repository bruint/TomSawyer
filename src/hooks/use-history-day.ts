import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import type { Activity, Child } from "../../shared/types";
import { api } from "../lib/api";

interface ArchiveDay {
  scope: string;
  entries: Activity[];
  loading: boolean;
  error: string;
}

/** Recent entries are already loaded. Fetch only the selected older day. */
export function useHistoryDay(child: Child, events: Activity[], date: string) {
  const [archive, setArchive] = useState<ArchiveDay | null>(null);
  const [attempt, setAttempt] = useState(0);
  const day = DateTime.fromISO(date, { zone: child.timezone });
  const older = Boolean(date && day < DateTime.now().minus({ days: 90 }));
  const scope = `${child.id}:${date}`;

  useEffect(() => {
    if (!older) return;
    const controller = new AbortController();
    setArchive((previous) =>
      previous?.scope === scope
        ? previous
        : { scope, entries: [], loading: true, error: "" },
    );
    api<Activity[]>(`/children/${child.id}/activities?date=${date}`, {
      signal: controller.signal,
    })
      .then((entries) => {
        if (!controller.signal.aborted)
          setArchive({ scope, entries, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setArchive({
            scope,
            entries: [],
            loading: false,
            error: error.message,
          });
      });
    return () => controller.abort();
  }, [older, scope, child.id, date, events, attempt]);

  const local = date
    ? events.filter(
        (a) =>
          DateTime.fromISO(a.startedAt).setZone(child.timezone).toISODate() ===
          date,
      )
    : events;
  const current = older && archive?.scope === scope ? archive : null;
  const entries = older
    ? Array.from(
        new Map(
          [...(current?.entries || []), ...local].map((a) => [a.id, a]),
        ).values(),
      ).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    : local;
  return {
    entries,
    loading: older && (!current || current.loading),
    error: current?.error || "",
    retry: () => setAttempt((value) => value + 1),
  };
}
