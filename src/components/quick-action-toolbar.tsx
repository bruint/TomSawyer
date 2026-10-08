import {
  Droplets,
  Ellipsis,
  Loader2,
  Milk,
  Moon,
  Square,
  Sunrise,
} from "lucide-react";
import { useEffect, useState } from "react";
import { elapsedMs, type Activity } from "../../shared/types";
import type { QuickActionsController } from "../hooks/use-quick-actions";
import { ActivityIcon } from "./activity-icon";
import { timerDuration } from "../lib/format";

function Elapsed({
  activity,
  awake = false,
}: {
  activity: Activity;
  awake?: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  const milliseconds = awake
    ? Math.max(0, Date.now() - Date.parse(activity.endedAt!))
    : elapsedMs(activity);
  return (
    <span className="quick-action-detail">{timerDuration(milliseconds)}</span>
  );
}

export function QuickActionToolbar({
  actions,
}: {
  actions: QuickActionsController;
}) {
  const {
    sleep,
    night,
    nursing,
    bottle,
    side,
    sleepType,
    busy,
    online,
    enabled,
    trackers,
  } = actions;
  if (!trackers.length) return null;
  const sleepOnly = trackers.length === 1 && enabled("sleep");
  const columns =
    1 +
    Number(enabled("sleep")) +
    Number(enabled("nursing")) +
    Number(enabled("bottle")) +
    (enabled("diaper") ? 2 : 0);
  return (
    <div className={`quick-action-toolbar ${sleepOnly ? "sleep-only" : ""}`}>
      {enabled("sleep") && night && (
        <div className="night-actions" role="group" aria-label="Night sleep">
          <span>
            {night.phase === "awake" ? "Night waking" : "Night sleep"}
          </span>
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void actions.upForDay()}
          >
            <Sunrise size={18} />
            Up for the day
          </button>
        </div>
      )}
      <div
        className="quick-action-bar"
        role="group"
        aria-label="Quick actions"
        aria-busy={busy}
        style={{
          gridTemplateColumns: sleepOnly
            ? "minmax(0, 1fr) 76px"
            : `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {enabled("sleep") && (
          <button
            type="button"
            className={sleep || night ? "quick-action running" : "quick-action"}
            disabled={busy || !online}
            onClick={() => void actions.activate("sleep")}
            aria-label={actions.label("sleep")}
          >
            {sleep ? <Square size={21} /> : <Moon size={21} />}
            <strong>
              {night ? actions.label("sleep") : sleep ? "Wake up" : "Sleep"}
            </strong>
            {night?.phase === "awake" ? (
              <Elapsed activity={night.activity} awake />
            ) : sleep ? (
              <Elapsed activity={sleep} />
            ) : (
              <span className="quick-action-detail">
                {sleepType === "nap" ? "Nap" : "Night"}
              </span>
            )}
          </button>
        )}
        {enabled("nursing") && (
          <button
            type="button"
            className={nursing ? "quick-action running" : "quick-action"}
            disabled={busy || !online}
            onClick={() => void actions.activate("nursing")}
            aria-label={actions.label("nursing")}
          >
            {nursing ? (
              <Square size={21} />
            ) : (
              <ActivityIcon kind="nursing" size={21} />
            )}
            <strong>{nursing ? "Stop feed" : "Nurse"}</strong>
            {nursing ? (
              <Elapsed activity={nursing} />
            ) : (
              <span className="quick-action-detail">{side}</span>
            )}
          </button>
        )}
        {enabled("bottle") && (
          <button
            type="button"
            className="quick-action"
            disabled={busy}
            onClick={() => void actions.activate("bottle")}
            aria-label={actions.label("bottle")}
          >
            <Milk size={21} />
            <strong>Bottle</strong>
            <span className="quick-action-detail">
              {bottle ? `${bottle.amount} ${bottle.unit}` : "Amount"}
            </span>
          </button>
        )}
        {enabled("diaper") && (
          <button
            type="button"
            className="quick-action"
            disabled={busy}
            onClick={() => void actions.diaper("Wet")}
            aria-label="Log wet diaper"
          >
            <Droplets size={21} />
            <strong>Wet</strong>
          </button>
        )}
        {enabled("diaper") && (
          <button
            type="button"
            className="quick-action"
            disabled={busy}
            onClick={() => void actions.diaper("Dirty")}
            aria-label="Log dirty diaper"
          >
            <ActivityIcon kind="diaper" size={21} />
            <strong>Dirty</strong>
          </button>
        )}
        <button
          type="button"
          className="quick-action"
          disabled={busy}
          onClick={() => actions.setSheet("more")}
          aria-label="More quick actions"
          aria-haspopup="dialog"
        >
          {busy ? (
            <Loader2 size={21} className="spin" />
          ) : (
            <Ellipsis size={21} />
          )}
          <strong>More</strong>
          {enabled("pumping") && actions.pumping && (
            <Elapsed activity={actions.pumping} />
          )}
        </button>
      </div>
    </div>
  );
}
