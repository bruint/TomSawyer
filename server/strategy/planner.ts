import { DateTime } from "luxon";
import type { PlanStep } from "../../shared/types.js";
import type { SleepContext } from "./context.js";
import { wakeWindow, wakeWindowsFor } from "./routine.js";
import { iso, later, minutesBetween } from "./time.js";

export interface DayPlan {
  napCount: number;
  steps: PlanStep[];
  bedtime: DateTime;
  wakeWindowMinutes: number;
  finalNapMinutes: number | null;
  overdue: boolean;
  score: number;
}

function schedule(
  context: SleepContext,
  napCount: number,
  finalNapMinutes: number,
  preferredCount: number,
  rollForward: boolean,
): DayPlan | null {
  const { child, consumedNaps, active, now, awakeSince, skipped } = context;
  if (napCount < consumedNaps) return null;
  const windows = wakeWindowsFor(context, napCount);
  const window = wakeWindow(
    windows,
    consumedNaps,
    active ? context.activeMinutes : context.lastNapMinutes,
  );
  let cursor = (active ? now : awakeSince).plus({ minutes: window });
  if (skipped && !active) {
    const retry = context.ageMonths < 4 ? 30 : context.ageMonths < 6 ? 45 : 60;
    cursor = later(
      cursor,
      DateTime.fromISO(skipped.startedAt).plus({ minutes: retry }),
    );
  }
  const overdue = !active && !skipped && minutesBetween(now, cursor) > 15;
  if (rollForward)
    cursor = overdue ? now.plus({ minutes: 5 }) : later(now, cursor);
  const steps: PlanStep[] = [];
  for (let index = consumedNaps; index < napCount; index++) {
    const duration =
      index === napCount - 1 ? finalNapMinutes : child.settings.napMinutes;
    const end = cursor.plus({ minutes: duration });
    steps.push({
      id: `nap-${index + 1}`,
      kind: "nap",
      at: iso(cursor),
      endAt: iso(end),
      title: `Nap ${index + 1}`,
      detail: `${duration} minutes estimated${duration < child.settings.napMinutes ? "; a shorter final nap" : ""}. Updates when they wake.`,
      tentative: steps.length > 0 || !!active,
    });
    cursor = end.plus({ minutes: wakeWindow(windows, index + 1, duration) });
  }
  // A family explicitly choosing no naps keeps their usual bedtime.
  if (napCount === 0)
    cursor = rollForward ? later(now, context.usualBed) : context.usualBed;
  if (cursor > context.latestBed) return null;
  const bedtimeShift = Math.max(
    0,
    Math.abs(minutesBetween(cursor, context.usualBed)) - 30,
  );
  const shortened =
    steps.length > 0 && finalNapMinutes < child.settings.napMinutes;
  // These are ranking preferences, not sleep requirements: allow some bedtime
  // drift, prefer a familiar count, and favor a full nap when both options fit.
  const bridgeCost = shortened
    ? (child.settings.napMinutes - finalNapMinutes) / 3
    : 0;
  const score =
    bedtimeShift / 2 +
    (bedtimeShift / 120) ** 2 * 10 +
    Math.abs(napCount - preferredCount) * 12 +
    bridgeCost;
  steps.push({
    id: "bedtime",
    kind: "bedtime",
    at: iso(cursor),
    title: "Bedtime",
    detail: "Moves with today's sleep. Follow sleep cues.",
    tentative: steps.length > 0 || !!active,
  });
  return {
    napCount,
    steps,
    bedtime: cursor,
    wakeWindowMinutes: window,
    finalNapMinutes: shortened ? finalNapMinutes : null,
    overdue,
    score,
  };
}

export function planForCount(
  context: SleepContext,
  count: number,
  preferredCount: number,
  rollForward: boolean,
) {
  const durations = [context.child.settings.napMinutes];
  // A bridge nap is an alternative, never a mandatory cap on the last nap.
  if (count >= 3 && count > context.consumedNaps) {
    for (const duration of [35, 20]) {
      if (duration < context.child.settings.napMinutes)
        durations.push(duration);
    }
  }
  return bestPlan(
    durations.map((duration) =>
      schedule(context, count, duration, preferredCount, rollForward),
    ),
  );
}

export function bestPlan(plans: (DayPlan | null)[]) {
  return (
    plans
      .filter((plan): plan is DayPlan => plan !== null)
      .sort((a, b) => a.score - b.score || a.napCount - b.napCount)[0] ?? null
  );
}
