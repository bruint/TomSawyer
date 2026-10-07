import type { Strategy } from "../../shared/types";

export function PlanPreviewNotice({
  compare,
  strategy,
  online,
  onReturnToLive,
}: {
  compare: number | null;
  strategy: Strategy | null;
  online: boolean;
  onReturnToLive: () => void;
}) {
  if (compare === null) return null;
  return (
    <div className="plan-preview-state">
      <span>
        {!online
          ? "Preview unavailable offline"
          : compare === strategy?.plannedNaps
            ? `Preview: ${compare} ${compare === 1 ? "nap" : "naps"}`
            : `${compare} naps unavailable today`}
      </span>
      <button className="text-button" onClick={onReturnToLive}>
        Return to live plan
      </button>
    </div>
  );
}
