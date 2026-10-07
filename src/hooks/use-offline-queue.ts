import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, post } from "../lib/api";
import type { PendingActivity } from "../lib/offline-activities";
import { readStored, writeStored } from "../lib/storage";

export function useOfflineQueue(userId: string | undefined, online: boolean) {
  const [items, setItems] = useState(() =>
    readStored<PendingActivity[]>("ts:queue", []),
  );
  const itemsRef = useRef(items);
  const syncing = useRef(false);

  const update = useCallback((next: PendingActivity[]) => {
    itemsRef.current = next;
    setItems(next);
    writeStored("ts:queue", next);
  }, []);

  const enqueue = useCallback(
    (item: PendingActivity) => {
      update([...itemsRef.current, item]);
    },
    [update],
  );

  const sync = useCallback(async () => {
    if (syncing.current || !userId || !navigator.onLine) return;
    syncing.current = true;
    try {
      for (const item of itemsRef.current.filter(
        (item) => item.userId === userId,
      )) {
        try {
          await post(`/children/${item.childId}/activities`, item.body);
          update(
            itemsRef.current.filter(
              (queued) => queued.body.id !== item.body.id,
            ),
          );
        } catch (error) {
          if (error instanceof ApiError) {
            toast.error(`An offline entry needs review: ${error.message}`);
          }
          // Preserve this entry and later ones for retry or export.
          break;
        }
      }
    } finally {
      syncing.current = false;
    }
  }, [userId, update]);

  useEffect(() => {
    if (online && items.length) void sync();
  }, [online, items.length, sync]);

  const discard = useCallback(() => {
    update(itemsRef.current.filter((item) => item.userId !== userId));
  }, [userId, update]);

  const clear = useCallback(() => update([]), [update]);
  return {
    pending: items.filter((item) => item.userId === userId),
    itemsRef,
    enqueue,
    sync,
    discard,
    clear,
  };
}
