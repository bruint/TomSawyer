import { DateTime } from "luxon";
import type { Activity, Child, Strategy } from "../shared/types.js";
import { sleepContext } from "./strategy/context.js";
import { bestPlan, planForCount } from "./strategy/planner.js";
import {
  ageProfile,
  routineFor,
  wakeWindow,
  wakeWindowsFor,
} from "./strategy/routine.js";
import { iso, later, minutesBetween } from "./strategy/time.js";

export { STRATEGY_HISTORY_DAYS } from "./strategy/context.js";
export { ageProfile } from "./strategy/routine.js";
export { atLocal, dayBoundary } from "./strategy/time.js";

/** An explainable scheduling heuristic, not a clinical or trained prediction model. */
export function buildStrategy(
  child: Child,
  activities: Activity[],
  nowInput = new Date(),
  overrides: { napCount?: number; rollForward?: boolean } = {},
): Strategy {
  const context = sleepContext(child, activities, nowInput);
  const { now, day, active, ageMonths, consumedNaps, usualBed } = context;
  const routine = routineFor(context);
  const requested = overrides.napCount ?? child.settings.napCount;
  const initialCount = requested ?? ageProfile(ageMonths).naps;
  const base: Strategy = {
    generatedAt: iso(now),
    day: day.toISODate()!,
    status: "ready",
    headline: "Next sleep",
    summary: "Log a wake or sleep to update the plan.",
    reasons: [],
    nextSleep: null,
    windowStart: null,
    windowEnd: null,
    windDownAt: null,
    bedtime: null,
    steps: [],
    alternatives: [],
    napOptions: [],
    confidence: child.settings.wakeWindows.length
      ? "Your custom routine"
      : context.observed
        ? "Based on your logs"
        : "Getting started",
    ageMonths: Math.floor(ageMonths),
    totalNapMinutes: context.totalNapMinutes,
    completedNaps: context.naps.length,
    plannedNaps: initialCount,
    awakeSince: context.observed && !active ? iso(context.awakeSince) : null,
    wakeWindowMinutes: wakeWindow(
      wakeWindowsFor(context, initialCount),
      consumedNaps,
      active ? context.activeMinutes : context.lastNapMinutes,
    ),
    caveat:
      "Planning estimates, not medical advice. Follow your child’s cues and clinician’s advice; don’t delay needed feeds.",
  };
  if (ageMonths < 2)
    return {
      ...base,
      status: "gentle",
      headline: "Follow sleep cues",
      summary: "Timed estimates start at 2 months corrected age.",
    };
  if (active?.details.sleepType === "night")
    return {
      ...base,
      status: "sleeping",
      headline: "Sleeping",
      summary: "End night sleep when they wake.",
    };
  if (now < context.usualWake && !context.observed && !active)
    return {
      ...base,
      status: "night",
      headline: "Night time",
      summary: "Log morning wake to start today’s plan.",
    };
  if (now > context.latestBed && !active)
    return {
      ...base,
      status: "night",
      headline: "Bedtime",
      summary: "Log night sleep when it starts.",
    };

  const counts = [
    ...new Set([
      ...routine.counts,
      ...(overrides.napCount === undefined ? [] : [overrides.napCount]),
    ]),
  ].sort((a, b) => a - b);
  const plansFor = (rollForward: boolean) =>
    new Map(
      counts.map((count) => [
        count,
        planForCount(context, count, routine.preferredCount, rollForward),
      ]),
    );
  // Choose from stable wake/log anchors. Passing time alone must not move alert
  // deadlines or replace an already missed alert with a new nap-count choice.
  const anchored = plansFor(false);
  const automatic = bestPlan(
    routine.counts.map((count) => anchored.get(count) ?? null),
  );
  const liveCount =
    child.settings.napCount !== null && anchored.get(child.settings.napCount)
      ? child.settings.napCount
      : automatic?.napCount;
  const rollForward = overrides.rollForward !== false;
  const plans = rollForward ? plansFor(true) : anchored;
  const live =
    (liveCount === undefined ? null : plans.get(liveCount)) ??
    bestPlan(routine.counts.map((count) => plans.get(count) ?? null));
  let selected = (requested === null ? null : plans.get(requested)) ?? live;
  if (!selected) {
    // Too little day remains for any usual count. Do not silently remove future
    // nap steps while still claiming the original count in the UI.
    selected = planForCount(
      context,
      consumedNaps,
      routine.preferredCount,
      rollForward,
    );
    if (selected) {
      plans.set(consumedNaps, selected);
      counts.push(consumedNaps);
    }
  }
  if (!selected)
    return {
      ...base,
      status: active ? "sleeping" : "night",
      headline: active ? "Sleeping" : "Bedtime",
      summary: active ? "Replan when they wake" : "Offer bedtime when ready.",
      plannedNaps: consumedNaps,
    };

  const reasons = base.reasons;
  const first = selected.steps[0];
  const firstTime = DateTime.fromISO(first.at).setZone(child.timezone);
  const afterNow = (value: DateTime) =>
    rollForward ? later(now, value) : value;
  const latestNapMinutes = active
    ? context.activeMinutes
    : context.lastNapMinutes;
  if (latestNapMinutes !== null && latestNapMinutes < 40)
    reasons.push({
      code: "short-nap",
      title: "A shorter wake window",
      detail: active
        ? "If this nap ends now, the next wake window is 20 minutes shorter."
        : `Last nap: ${latestNapMinutes} minutes. The next wake window is 20 minutes shorter.`,
    });
  if (context.lateWakeMinutes > 30)
    reasons.push({
      code: "late-wake",
      title: "Late wake",
      detail: `Wake was ${context.lateWakeMinutes} minutes late. Naps and bedtime follow the actual wake time.`,
    });
  if (!context.observed)
    reasons.push({
      code: "missing-wake",
      title: "Log this morning’s wake",
      detail:
        "Using your usual wake time until a morning wake or finished night sleep is logged.",
    });
  if (context.skipped && !active)
    reasons.push({
      code: "missed-nap",
      title: "Reset after a missed nap",
      detail: `Take a break, then offer sleep around ${firstTime.toFormat("h:mm a")}.`,
    });
  if (selected.overdue && rollForward)
    reasons.push({
      code: "window-passed",
      title: "The window has passed",
      detail:
        "Offer sleep if ready. Log a missed nap after an unsuccessful attempt to get a retry time.",
    });
  if (requested !== null && selected.napCount !== requested)
    reasons.push({
      code: "nap-count-unavailable",
      title: `${requested} naps do not fit today`,
      detail:
        requested < consumedNaps
          ? `${consumedNaps} naps are already logged or running. Showing the ${selected.napCount}-nap option.`
          : `That count would run too far into the night. Showing the ${selected.napCount}-nap option.`,
    });
  const other = bestPlan(
    [...plans.values()].filter((plan) => plan?.napCount !== selected.napCount),
  );
  reasons.push({
    code: "nap-choice",
    title: `${selected.napCount} ${selected.napCount === 1 ? "nap" : "naps"} today`,
    detail: `${consumedNaps} logged or running; ${selected.napCount - consumedNaps} still planned. Bedtime around ${selected.bedtime.toFormat("h:mm a")}.${other ? ` The ${other.napCount}-nap option ends around ${other.bedtime.toFormat("h:mm a")}.` : ""} ${child.settings.wakeWindows.length ? "Using your custom wake windows." : "Wake windows adjust to the nap count."}`,
  });
  if (routine.historicalCount !== null && child.settings.napCount === null)
    reasons.push({
      code: "recent-routine",
      title: "Recent routine",
      detail: `Typical count across ${context.recentNapCounts.length} logged days: ${Number.isInteger(routine.historicalCount) ? routine.historicalCount : `${Math.floor(routine.historicalCount)}–${Math.ceil(routine.historicalCount)}`} naps. Today’s times can change the choice.`,
    });
  if (selected.finalNapMinutes !== null)
    reasons.push({
      code: "short-final-nap",
      title: "A shorter final nap",
      detail: `A ${selected.finalNapMinutes}-minute estimate puts bedtime around ${selected.bedtime.toFormat("h:mm a")}. Log the actual wake time to adjust it.`,
    });
  const bedShift = minutesBetween(selected.bedtime, usualBed);
  if (Math.abs(bedShift) > 20)
    reasons.push({
      code: bedShift < 0 ? "early-bedtime" : "late-bedtime",
      title: bedShift < 0 ? "An earlier bedtime" : "A later bedtime",
      detail: `Around ${selected.bedtime.toFormat("h:mm a")} after today’s sleep. Your usual ${usualBed.toFormat("h:mm a")} bedtime is a starting point.`,
    });
  return {
    ...base,
    status: active
      ? "sleeping"
      : selected.overdue && rollForward
        ? "settling"
        : "ready",
    headline: active
      ? "Sleeping"
      : context.skipped
        ? "After a missed nap"
        : latestNapMinutes !== null && latestNapMinutes < 40
          ? "After a short nap"
          : context.lateWakeMinutes > 30
            ? "After a late wake"
            : "Next sleep",
    summary: active
      ? "If they wake now"
      : `${first.kind === "bedtime" ? "Bedtime" : "Next nap"} around ${firstTime.toFormat("h:mm a")}`,
    nextSleep: first.at,
    windowStart: iso(afterNow(firstTime.minus({ minutes: 10 }))),
    windowEnd: iso(firstTime.plus({ minutes: 10 })),
    windDownAt: iso(
      afterNow(firstTime.minus({ minutes: child.settings.windDownMinutes })),
    ),
    bedtime: iso(selected.bedtime),
    plannedNaps: selected.napCount,
    wakeWindowMinutes: selected.wakeWindowMinutes,
    steps: [
      {
        id: "wind-down",
        kind: "wind-down",
        at: iso(
          afterNow(
            firstTime.minus({ minutes: child.settings.windDownMinutes }),
          ),
        ),
        title: "Wind down",
        detail: `${child.settings.windDownMinutes} minutes before sleep.`,
        tentative: !!active,
      },
      ...selected.steps,
    ],
    napOptions: [...new Set(counts)]
      .sort((a, b) => a - b)
      .map((count) => {
        const plan = plans.get(count);
        return {
          napCount: count,
          bedtime: plan ? iso(plan.bedtime) : null,
          available: !!plan,
          recommended: count === (live?.napCount ?? selected.napCount),
          detail: plan
            ? "Estimated bedtime"
            : count < consumedNaps
              ? "Already passed"
              : "Too late today",
        };
      }),
    alternatives: [
      {
        title: "If the next nap is short",
        detail:
          "Log the wake time. The next wake window shortens and the nap count and bedtime update.",
      },
      {
        title: "If sleep doesn’t happen",
        detail: "Log “Missed nap” for a retry time and a new plan.",
      },
    ],
  };
}
