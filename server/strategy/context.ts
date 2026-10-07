import { DateTime } from "luxon";
import { elapsedMs, type Activity, type Child } from "../../shared/types.js";
import { nightSleepState } from "../../shared/night-sleep.js";
import { atLocal, dayBoundary, minutesBetween } from "./time.js";

// The API and notification worker must use the same history for the same plan.
export const STRATEGY_HISTORY_DAYS = 14;

export function sleepContext(
  child: Child,
  activities: Activity[],
  nowInput: Date,
) {
  const now = DateTime.fromJSDate(nowInput).setZone(child.timezone);
  const date = (value: string) =>
    DateTime.fromISO(value).setZone(child.timezone);
  const ageDate =
    child.dueDate && child.dueDate > child.birthDate
      ? child.dueDate
      : child.birthDate;
  const ageMonths = Math.max(0, now.diff(date(ageDate), "months").months);
  const recorded = activities
    .filter((activity) => date(activity.startedAt) <= now)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const boundary = dayBoundary(child, now);
  // An explicit early morning starts its own day, even before the usual sleep
  // day boundary. Keep that wake visible after the clock passes the boundary.
  const earlyMorning = recorded.find(
    (activity) =>
      activity.kind === "wake" &&
      activity.details.dayStarted === true &&
      date(activity.startedAt).toISODate() === now.toISODate() &&
      date(activity.startedAt) < atLocal(now, child.settings.dayStart),
  );
  const day = earlyMorning ? date(earlyMorning.startedAt) : boundary;
  const nightState = nightSleepState(recorded, nowInput);
  const sleeps = recorded.filter(
    (activity) =>
      activity.kind === "sleep" &&
      activity.state === "complete" &&
      activity.endedAt &&
      date(activity.endedAt) <= now,
  );
  const naps = sleeps.filter(
    (activity) =>
      date(activity.startedAt) >= day && activity.details.sleepType !== "night",
  );
  const today = recorded.filter((activity) => date(activity.startedAt) >= day);
  const active = recorded.find(
    (activity) => activity.kind === "sleep" && activity.state !== "complete",
  );
  const wake = today.filter((activity) => activity.kind === "wake").at(-1);
  const night = sleeps
    .filter(
      (activity) =>
        activity.details.sleepType === "night" &&
        activity.details.nightWake !== true &&
        date(activity.endedAt!) >= day,
    )
    .at(-1);
  const usualWake = atLocal(day, child.settings.wakeTime);
  const morning = wake
    ? date(wake.startedAt)
    : night
      ? date(night.endedAt!)
      : usualWake < now
        ? usualWake
        : now;
  const lastNap = naps.at(-1);
  const awakeSince = lastNap ? date(lastNap.endedAt!) : morning;
  const skipped = today
    .filter(
      (activity) =>
        activity.kind === "skipped_nap" &&
        date(activity.startedAt) >= awakeSince,
    )
    .at(-1);
  const duration = (activity: Activity) =>
    Math.floor(elapsedMs(activity, now.toMillis()) / 60000);
  const activeMinutes = active ? duration(active) : null;
  const totalNapMinutes =
    naps.reduce((sum, nap) => sum + duration(nap), 0) +
    (active &&
    active.details.sleepType !== "night" &&
    date(active.startedAt) >= day
      ? activeMinutes!
      : 0);
  const usualBed = atLocal(day, child.settings.bedtime);
  // A feasibility guard against projecting naps into the next sleep day, not a
  // bedtime target. Within this bound, earlier and later nights are both options.
  const latestBed = usualBed.plus({ hours: 3 });
  const midnight = day.startOf("day").plus({ days: 1 }).minus({ minutes: 15 });

  return {
    child,
    now,
    day,
    ageMonths,
    usualWake,
    usualBed,
    latestBed: latestBed < midnight ? latestBed : midnight,
    morning,
    awakeSince,
    observed: !!(wake || night || lastNap),
    naps,
    active,
    nightState,
    activeMinutes,
    lastNapMinutes: lastNap ? duration(lastNap) : null,
    totalNapMinutes,
    consumedNaps:
      naps.length + (active && active.details.sleepType !== "night" ? 1 : 0),
    skipped,
    lateWakeMinutes: minutesBetween(morning, usualWake),
    recentNapCounts: recentNapCounts(recorded, day),
  };
}

export type SleepContext = ReturnType<typeof sleepContext>;

function recentNapCounts(activities: Activity[], today: DateTime) {
  const counts: number[] = [];
  // Only use days with a recorded morning and night. Partial days are not evidence
  // of a lower nap count; today's running nap must not influence the history.
  for (let offset = 1; offset <= 7; offset++) {
    const start = today.minus({ days: offset });
    const end = start.plus({ days: 1 });
    const inDay = (value: string) => {
      const time = DateTime.fromISO(value);
      return time >= start && time < end;
    };
    const mornings = activities.flatMap((activity) => {
      if (activity.kind === "wake" && inDay(activity.startedAt))
        return [Date.parse(activity.startedAt)];
      if (
        activity.kind === "sleep" &&
        activity.details.sleepType === "night" &&
        activity.details.nightWake !== true &&
        activity.state === "complete" &&
        activity.endedAt &&
        inDay(activity.endedAt)
      )
        return [Date.parse(activity.endedAt)];
      return [];
    });
    if (!mornings.length) continue;
    const morning = Math.min(...mornings);
    const night = activities.find(
      (activity) =>
        activity.kind === "sleep" &&
        activity.details.sleepType === "night" &&
        Date.parse(activity.startedAt) >= morning &&
        inDay(activity.startedAt),
    );
    if (!night) continue;
    const naps = activities.filter(
      (activity) =>
        activity.kind === "sleep" &&
        activity.state === "complete" &&
        activity.details.sleepType !== "night" &&
        activity.endedAt &&
        inDay(activity.startedAt) &&
        Date.parse(activity.endedAt) <= Date.parse(night.startedAt),
    );
    // Avoid learning from corrupted or implausibly busy imported days.
    if (naps.length > 0 && naps.length <= 6) counts.push(naps.length);
  }
  return counts;
}
