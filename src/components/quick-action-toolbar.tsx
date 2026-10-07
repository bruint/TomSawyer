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

function Elapsed({
  activity,
  awake = false,
}: {
  activity: Activity;
  awake?: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor(
    (awake
      ? Math.max(0, Date.now() - Date.parse(activity.endedAt!))
      : elapsedMs(activity)) / 1000,
  );
  const minutes = Math.floor(seconds / 60);
  return (
    <span className="quick-action-detail">
      {minutes}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

export function QuickActionToolbar({
  actions,
}: {
  actions: QuickActionsController;
}) {
  const { sleep, night, nursing, bottle, side, sleepType, busy, online } =
    actions;
  return (
    <div className="quick-action-toolbar">
      {night && (
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
      >
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
          {actions.pumping && (
            <span className="quick-action-detail">Pumping</span>
          )}
        </button>
      </div>
    </div>
  );
}
