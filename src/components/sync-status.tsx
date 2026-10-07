import { Download, WifiOff } from "lucide-react";
import {
  downloadPendingActivities,
  type PendingActivity,
} from "../lib/offline-activities";
import { Button } from "./ui/button";

export function SyncStatus({
  online,
  pending,
  onRetry,
  onSync,
  onDiscard,
}: {
  online: boolean;
  pending: PendingActivity[];
  onRetry: () => void;
  onSync: () => Promise<void>;
  onDiscard: () => void;
}) {
  function discard() {
    if (
      confirm(
        "Discard these unsynced entries from this device? Download a copy first.",
      )
    )
      onDiscard();
  }
  return (
    <>
      {!online && (
        <div className="connection-banner">
          <WifiOff size={17} />
          <span>
            Offline. The saved sleep plan may be out of date. Completed entries
            will sync when you reconnect.
          </span>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="pending-banner">
          <strong>
            {pending.length} {pending.length === 1 ? "entry" : "entries"}{" "}
            waiting to sync
          </strong>
          <Button size="sm" variant="outline" onClick={onSync}>
            Retry sync
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadPendingActivities(pending)}
          >
            <Download />
            Download
          </Button>
          <button className="text-button danger-text" onClick={discard}>
            Discard
          </button>
        </div>
      )}
    </>
  );
}
