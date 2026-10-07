import { DateTime } from "luxon";
import type {
  Activity,
  ActivityInput,
  ActivityKind,
  Child,
  Details,
} from "../../shared/types";

export interface BottlePreset {
  amount: number;
  unit: "ml" | "oz";
  milkType?: string;
}

export function latestBottle(events: Activity[]): BottlePreset | null {
  const bottle = events.find(
    (activity) => activity.kind === "bottle" && activity.state === "complete",
  );
  if (!bottle) return null;
  const { amount, unit, milkType } = bottle.details;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    (unit !== "ml" && unit !== "oz") ||
    milkType === "Tube feed"
  )
    return null;
  return {
    amount,
    unit,
    ...(typeof milkType === "string" ? { milkType } : {}),
  };
}

export function nextNursingSide(events: Activity[]): "Left" | "Right" {
  const previous = events.find(
    (activity) => activity.kind === "nursing" && activity.state === "complete",
  );
  return previous?.details.side === "Left" ? "Right" : "Left";
}

export function sleepTypeNow(child: Child, now = new Date()): "nap" | "night" {
  const local = DateTime.fromJSDate(now, { zone: child.timezone });
  const minutes = local.hour * 60 + local.minute;
  const toMinutes = (clock: string) => {
    const [hours, minutes] = clock.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return minutes >= toMinutes(child.settings.bedtime) - 60 ||
    minutes < toMinutes(child.settings.wakeTime)
    ? "night"
    : "nap";
}

export function quickEntry(
  kind: ActivityKind,
  details: Details = {},
  state: ActivityInput["state"] = "complete",
  now = new Date(),
): ActivityInput {
  return {
    id: crypto.randomUUID(),
    kind,
    details,
    state,
    startedAt: now.toISOString(),
    endedAt: null,
    pausedMs: 0,
    notes: "",
  };
}
