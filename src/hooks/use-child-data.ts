import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Activity, Child, Strategy, User } from "../../shared/types";
import { ApiError, api } from "../lib/api";
import {
  mergePendingActivities,
  type ChildCache,
  type PendingActivity,
} from "../lib/offline-activities";
import { readStored, writeStored } from "../lib/storage";

interface ChildDataOptions {
  child: Child | undefined;
  user: User | undefined;
  napCount: number | null;
  pendingRef: RefObject<PendingActivity[]>;
  setOnline: (online: boolean) => void;
  refreshSession: () => Promise<void>;
}

export function useChildData({
  child,
  user,
  napCount,
  pendingRef,
  setOnline,
  refreshSession,
}: ChildDataOptions) {
  const [events, setEvents] = useState<Activity[]>([]);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loadedChildId, setLoadedChildId] = useState("");
  const requestGeneration = useRef(0);
  const childId = child?.id;
  const userId = user?.id;
  const userName = user?.name;
  const selectedScope = useRef("");
  selectedScope.current = `${userId}:${childId}`;

  const refresh = useCallback(async () => {
    if (!childId || !userId || !userName) return;
    const scope = `${userId}:${childId}`;
    // A save for a previously selected child can finish after the user switches.
    if (scope !== selectedScope.current) return;
    const generation = ++requestGeneration.current;
    const currentUser = { id: userId, name: userName };
    const cacheKey = `ts:cache:${userId}:${childId}`;
    try {
      const [logs, plan] = await Promise.all([
        api<Activity[]>(`/children/${childId}/activities?days=90`),
        api<Strategy>(
          `/children/${childId}/strategy${napCount !== null ? `?naps=${napCount}` : ""}`,
        ),
      ]);
      if (
        generation !== requestGeneration.current ||
        scope !== selectedScope.current
      )
        return;
      setEvents(
        mergePendingActivities(logs, pendingRef.current, childId, currentUser),
      );
      setStrategy(plan);
      setLoadedChildId(childId);
      setOnline(true);
      if (napCount === null)
        writeStored(cacheKey, { events: logs, strategy: plan });
    } catch (error) {
      if (
        generation !== requestGeneration.current ||
        scope !== selectedScope.current
      )
        return;
      if (error instanceof ApiError && error.status === 401) {
        void refreshSession();
        return;
      }
      setOnline(false);
      const cache = readStored<ChildCache | null>(cacheKey, null);
      if (cache) {
        setEvents(
          mergePendingActivities(
            cache.events,
            pendingRef.current,
            childId,
            currentUser,
          ),
        );
        setStrategy(cache.strategy);
        setLoadedChildId(childId);
      }
    }
  }, [
    childId,
    userId,
    userName,
    napCount,
    pendingRef,
    setOnline,
    refreshSession,
  ]);

  useEffect(() => {
    setLoadedChildId("");
    if (!childId || !userId) {
      setEvents([]);
      setStrategy(null);
      return;
    }
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(refreshWhenVisible, 15000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      // A response for a previous child must not replace the current child's data.
      requestGeneration.current++;
    };
  }, [childId, userId, refresh]);

  function showPending() {
    if (childId && user) {
      setEvents((saved) =>
        mergePendingActivities(saved, pendingRef.current, childId, user),
      );
    }
  }

  return { events, strategy, loadedChildId, refresh, showPending };
}
