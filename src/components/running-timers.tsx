import { Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import {
  elapsedMs,
  kindLabels,
  type Activity,
  type Child,
  type TimerAction,
} from "../../shared/types";
import { time, timerDuration } from "../lib/format";
import { trackerEnabled } from "../../shared/tracking";
import { ActivityIcon } from "./activity-icon";
import { Button } from "./ui/button";

export function RunningTimers({
  events,
  child,
  onTimer,
  onEdit,
  disabled = false,
}: {
  disabled?: boolean;
  events: Activity[];
  child: Child;
  onTimer: (a: Activity, action: TimerAction) => void;
  onEdit: (a: Activity) => void;
}) {
  const running = events.filter(
    (entry) => entry.state !== "complete" && trackerEnabled(child, entry.kind),
  );
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running.length) return;
    const interval = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running.length]);
  if (!running.length) return null;
  return (
    <div className="running-timers">
      {running.map((a) => (
        <div className="running-timer" key={a.id}>
          <span className={`activity-symbol ${a.kind}`}>
            <ActivityIcon kind={a.kind} />
          </span>
          <div>
            <span className="timer-label">
              {a.kind === "sleep" && a.details.sleepType === "night"
                ? "Night sleep"
                : kindLabels[a.kind]}
              {a.state === "paused" ? " · Paused" : ""}
            </span>
            <strong className="timer-digits">
              {timerDuration(elapsedMs(a))}
            </strong>
            <small>Since {time(a.startedAt, child.timezone)}</small>
          </div>
          <div className="timer-actions">
            {a.kind === "sleep" && (
              <Button
                disabled={disabled}
                variant="ghost"
                onClick={() => onEdit(a)}
              >
                Edit
              </Button>
            )}
            {a.kind !== "sleep" && (
              <Button
                disabled={disabled}
                variant="outline"
                size="icon"
                aria-label={
                  a.state === "paused" ? "Resume timer" : "Pause timer"
                }
                onClick={() =>
                  onTimer(a, a.state === "paused" ? "resume" : "pause")
                }
              >
                {a.state === "paused" ? <Play /> : <Pause />}
              </Button>
            )}
            {!(a.kind === "sleep" && a.details.sleepType === "night") && (
              <Button disabled={disabled} onClick={() => onTimer(a, "stop")}>
                <Square />
                {a.kind === "sleep" ? "Woke up" : "Finish"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
