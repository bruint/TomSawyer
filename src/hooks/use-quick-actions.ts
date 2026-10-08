import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  kindLabels,
  type Activity,
  type ActivityInput,
  type ActivityKind,
  type Child,
  type Details,
  type TimerAction,
  type Strategy,
} from "../../shared/types";
import {
  latestBottle,
  nextNursingSide,
  quickEntry,
  sleepTypeNow,
  type BottlePreset,
} from "../lib/quick-actions";
import { nightSleepState } from "../../shared/night-sleep";
import { trackerEnabled } from "../../shared/tracking";

interface QuickActionOptions {
  child?: Child;
  events: Activity[];
  strategy?: Strategy | null;
  online: boolean;
  onRecord: (input: ActivityInput, message: string) => Promise<void>;
  onTimer: (activity: Activity, action: TimerAction) => Promise<void>;
  onDetails: (kind: ActivityKind) => void;
}

export function useQuickActions({
  child,
  events,
  strategy,
  online,
  onRecord,
  onTimer,
  onDetails,
}: QuickActionOptions) {
  const [sheet, setSheet] = useState<"more" | "bottle" | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const enabled = (kind: ActivityKind) => trackerEnabled(child, kind);
  const visibleEvents = events.filter((activity) => enabled(activity.kind));
  const sleep = visibleEvents.find(
    (activity) => activity.kind === "sleep" && activity.state !== "complete",
  );
  const nursing = visibleEvents.find(
    (activity) => activity.kind === "nursing" && activity.state !== "complete",
  );
  const pumping = visibleEvents.find(
    (activity) => activity.kind === "pumping" && activity.state !== "complete",
  );
  const bottle = latestBottle(events);
  const side = nextNursingSide(events);
  const night = nightSleepState(visibleEvents);
  const sleepType = night
    ? "night"
    : child
      ? sleepTypeNow(child, new Date(), strategy)
      : "nap";

  const bottleEnabled = enabled("bottle");
  useEffect(() => {
    if (sheet === "bottle" && !bottleEnabled) setSheet(null);
  }, [sheet, bottleEnabled]);

  async function perform(operation: () => Promise<void>) {
    if (inFlight.current || !child) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await operation();
      setSheet(null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function record(
    kind: ActivityKind,
    details: Details,
    message: string,
    timed = false,
  ) {
    if (!enabled(kind)) return;
    if (timed && !online) {
      toast.error("Reconnect to start a timer.");
      return;
    }
    return perform(() =>
      onRecord(
        quickEntry(kind, details, timed ? "active" : "complete"),
        message,
      ),
    );
  }

  function finish(activity: Activity) {
    if (!online) {
      toast.error("Reconnect to stop a timer.");
      return;
    }
    return perform(() =>
      onTimer(
        activity,
        activity.kind === "sleep" && activity.details.sleepType === "night"
          ? "night-wake"
          : "stop",
      ),
    );
  }

  function startSleep(type = sleepType) {
    if (!enabled("sleep")) return;
    if (night?.phase === "awake" && type === "night") {
      if (!online) {
        toast.error("Reconnect to start a timer.");
        return;
      }
      return perform(() => onTimer(night.activity, "back-asleep"));
    }
    return sleep
      ? finish(sleep)
      : record(
          "sleep",
          { sleepType: type },
          type === "nap" ? "Nap timer started" : "Night sleep started",
          true,
        );
  }

  function upForDay() {
    if (!enabled("sleep")) return;
    if (night) {
      if (!online) {
        toast.error("Reconnect to finish night sleep.");
        return;
      }
      return perform(() => onTimer(night.activity, "up-for-day"));
    }
    return sleep
      ? finish(sleep)
      : record("wake", { dayStarted: true }, "Morning wake saved");
  }

  function nurse(nextSide = side) {
    if (!enabled("nursing")) return;
    if (nursing) return finish(nursing);
    return record(
      "nursing",
      { side: nextSide },
      `Nursing ${nextSide.toLowerCase()} · timer started`,
      true,
    );
  }

  function logBottle(preset: BottlePreset) {
    const details: Details = { amount: preset.amount, unit: preset.unit };
    if (preset.milkType) details.milkType = preset.milkType;
    return record(
      "bottle",
      details,
      `Bottle · ${preset.amount} ${preset.unit} saved`,
    );
  }

  function diaper(type: "Wet" | "Dirty" | "Mixed") {
    return record(
      "diaper",
      { diaperType: type },
      `${type === "Mixed" ? "Wet + dirty" : type} diaper saved`,
    );
  }

  function details(kind: ActivityKind) {
    if (!enabled(kind)) return;
    setSheet(null);
    onDetails(kind);
  }

  function activate(kind: ActivityKind) {
    if (!enabled(kind)) return;
    switch (kind) {
      case "sleep":
        return startSleep();
      case "nursing":
        return nurse();
      case "bottle":
        return bottle ? logBottle(bottle) : setSheet("bottle");
      case "diaper":
        return diaper("Wet");
      case "wake":
        return upForDay();
      case "skipped_nap":
        if (sleep) {
          toast.info("Finish the current sleep before recording a missed nap.");
          return;
        }
        return record("skipped_nap", {}, "Missed nap saved · plan updated");
      case "pumping":
        return pumping
          ? finish(pumping)
          : record(
              "pumping",
              { unit: child?.settings.units === "imperial" ? "oz" : "ml" },
              "Pumping timer started",
              true,
            );
      default:
        details(kind);
    }
  }

  function label(kind: ActivityKind) {
    switch (kind) {
      case "sleep":
        if (night)
          return night.phase === "awake" ? "Back asleep" : "Night wake";
        return sleep
          ? "Wake up"
          : sleepType === "nap"
            ? "Start nap"
            : "Start night sleep";
      case "nursing":
        return nursing ? "Stop nursing" : `Nurse ${side.toLowerCase()}`;
      case "bottle":
        return bottle
          ? `Bottle · ${bottle.amount} ${bottle.unit}`
          : "Bottle amount";
      case "diaper":
        return "Wet diaper";
      case "pumping":
        return pumping ? "Stop pumping" : "Start pumping";
      default:
        return kindLabels[kind];
    }
  }

  return {
    sheet,
    setSheet,
    busy,
    sleep,
    night,
    nursing,
    pumping,
    bottle,
    side,
    sleepType,
    online,
    enabled,
    trackers: child?.settings.visibleTrackers || [],
    activate,
    label,
    startSleep,
    upForDay,
    nurse,
    logBottle,
    diaper,
    details,
  };
}

export type QuickActionsController = ReturnType<typeof useQuickActions>;
