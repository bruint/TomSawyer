import type { Activity } from "./types.js";

export interface NightSleepState {
  phase: "sleeping" | "awake";
  activity: Activity;
}

/** Night waking lasts until another sleep or an explicit morning wake is logged. */
export function nightSleepState(
  activities: Activity[],
  now = new Date(),
): NightSleepState | null {
  const recorded = activities
    .filter((activity) => Date.parse(activity.startedAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const sleep =
    recorded.find(
      (activity) => activity.kind === "sleep" && activity.state !== "complete",
    ) ?? recorded.find((activity) => activity.kind === "sleep");
  if (!sleep || sleep.details.sleepType !== "night") return null;
  if (sleep.state !== "complete") return { phase: "sleeping", activity: sleep };
  if (
    sleep.details.nightWake !== true ||
    !sleep.endedAt ||
    Date.parse(sleep.endedAt) > now.getTime() ||
    recorded.some(
      (activity) =>
        activity.kind === "wake" &&
        Date.parse(activity.startedAt) >= Date.parse(sleep.endedAt!),
    )
  )
    return null;
  return { phase: "awake", activity: sleep };
}
