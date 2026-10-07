import { DateTime } from "luxon";
import type { Activity, Child, Strategy, PlanStep } from "../shared/types.js";

const minutes = (a: DateTime, b: DateTime) =>
  Math.round(a.diff(b, "minutes").minutes);
const iso = (d: DateTime) => d.toUTC().toISO()!;
const maxDate = (a: DateTime, b: DateTime) => (a > b ? a : b);
const minDate = (a: DateTime, b: DateTime) => (a < b ? a : b);
export function atLocal(day: DateTime, hhmm: string) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}
export function dayBoundary(child: Child, now: DateTime) {
  let d = atLocal(now.setZone(child.timezone), child.settings.dayStart);
  if (now < d) d = d.minus({ days: 1 });
  return d;
}
export function ageProfile(months: number) {
  if (months < 2) return { naps: 5, windows: [60, 60, 60, 60, 60, 60] };
  if (months < 4) return { naps: 4, windows: [80, 90, 90, 100, 100] };
  if (months < 6) return { naps: 3, windows: [120, 135, 150, 150] };
  if (months < 9) return { naps: 3, windows: [150, 165, 180, 180] };
  if (months < 14) return { naps: 2, windows: [180, 210, 240] };
  if (months < 30) return { naps: 1, windows: [300, 300] };
  return { naps: 0, windows: [360] };
}

/** An explainable scheduling heuristic, not a clinical or trained prediction model. */
export function buildStrategy(
  child: Child,
  activities: Activity[],
  nowInput = new Date(),
  overrides: { napCount?: number } = {},
): Strategy {
  const now = DateTime.fromJSDate(nowInput).setZone(child.timezone);
  const day = dayBoundary(child, now);
  const ageDate =
    child.dueDate && child.dueDate > child.birthDate
      ? child.dueDate
      : child.birthDate;
  const ageMonths = Math.max(
    0,
    now.diff(DateTime.fromISO(ageDate, { zone: child.timezone }), "months")
      .months,
  );
  const profile = ageProfile(ageMonths);
  const plannedNaps =
    overrides.napCount ?? child.settings.napCount ?? profile.naps;
  const windows = child.settings.wakeWindows.length
    ? child.settings.wakeWindows
    : profile.windows;
  const getWindow = (index: number) =>
    windows[Math.min(index, windows.length - 1)];
  const today = activities.filter(
    (a) =>
      DateTime.fromISO(a.startedAt) >= day &&
      DateTime.fromISO(a.startedAt) <= now,
  );
  const sleeps = activities
    .filter(
      (a) =>
        a.kind === "sleep" &&
        a.state === "complete" &&
        a.endedAt &&
        DateTime.fromISO(a.endedAt) <= now,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const naps = sleeps.filter(
    (a) =>
      DateTime.fromISO(a.startedAt) >= day && a.details.sleepType !== "night",
  );
  const totalNapMinutes = naps.reduce(
    (sum, a) =>
      sum +
      Math.max(
        0,
        minutes(DateTime.fromISO(a.endedAt!), DateTime.fromISO(a.startedAt)),
      ),
    0,
  );
  const active = activities.find(
    (a) => a.kind === "sleep" && a.state !== "complete",
  );
  const wakeLog = today
    .filter((a) => a.kind === "wake")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
  const night = sleeps
    .filter(
      (a) =>
        a.details.sleepType === "night" && DateTime.fromISO(a.endedAt!) >= day,
    )
    .at(-1);
  const expectedWake = atLocal(day, child.settings.wakeTime);
  const morning = wakeLog
    ? DateTime.fromISO(wakeLog.startedAt).setZone(child.timezone)
    : night
      ? DateTime.fromISO(night.endedAt!).setZone(child.timezone)
      : minDate(expectedWake, now);
  const lastNap = naps.at(-1);
  const awakeSince = lastNap
    ? DateTime.fromISO(lastNap.endedAt!).setZone(child.timezone)
    : morning;
  const lastNapMinutes = lastNap
    ? minutes(
        DateTime.fromISO(lastNap.endedAt!),
        DateTime.fromISO(lastNap.startedAt),
      )
    : null;
  const skipped = today
    .filter(
      (a) =>
        a.kind === "skipped_nap" && DateTime.fromISO(a.startedAt) >= awakeSince,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1);
  const observed = !!(wakeLog || night || lastNap);
  const reasons: Strategy["reasons"] = [];
  const caveat =
    "A flexible estimate from your logs and preferences, not medical advice. Follow your child’s cues and your clinician’s advice; never delay a needed feed to follow this plan.";
  let window = getWindow(naps.length);
  if (lastNapMinutes !== null && lastNapMinutes < 40) {
    window = Math.max(45, window - 20);
    reasons.push({
      code: "short-nap",
      title: "A shorter wake window",
      detail: `The last nap was ${lastNapMinutes} minutes. The next window is 20 minutes shorter to leave room for rest.`,
    });
  }
  if (minutes(morning, expectedWake) > 30)
    reasons.push({
      code: "late-wake",
      title: "A later start, a flexible day",
      detail: `Morning started ${minutes(morning, expectedWake)} minutes later than your usual wake time. We’ll fit naps around the actual wake and avoid crowding bedtime.`,
    });
  if (!observed)
    reasons.push({
      code: "missing-wake",
      title: "Log this morning’s wake",
      detail:
        "This preview uses your usual morning time. Add a wake-up or finish an overnight sleep for a plan based on today.",
    });
  let next = awakeSince.plus({ minutes: window });
  if (skipped) {
    const retry = ageMonths < 4 ? 30 : ageMonths < 6 ? 45 : 60;
    next = maxDate(
      next,
      DateTime.fromISO(skipped.startedAt)
        .setZone(child.timezone)
        .plus({ minutes: retry }),
    );
    reasons.push({
      code: "missed-nap",
      title: "Reset after a missed nap",
      detail: `Take a calm break and consider offering sleep again around ${next.toFormat("h:mm a")}. The rest of today has been recalculated without inventing a nap.`,
    });
  }
  const preferredBed = atLocal(day, child.settings.bedtime);
  const base: Strategy = {
    generatedAt: iso(now),
    day: day.toISODate()!,
    status: "ready",
    headline: "A little rhythm for the rest of today.",
    summary:
      "Follow the next window, then let the next sleep reshape the plan.",
    reasons,
    nextSleep: null,
    windowStart: null,
    windowEnd: null,
    windDownAt: null,
    bedtime: iso(preferredBed),
    steps: [],
    alternatives: [],
    confidence: child.settings.wakeWindows.length
      ? "Your custom routine"
      : observed
        ? "Based on your logs"
        : "Getting started",
    ageMonths: Math.floor(ageMonths),
    totalNapMinutes,
    completedNaps: naps.length,
    plannedNaps,
    awakeSince: observed ? iso(awakeSince) : null,
    wakeWindowMinutes: window,
    caveat,
  };
  if (ageMonths < 2)
    return {
      ...base,
      status: "gentle",
      headline: "Follow their cues. Find your rhythm.",
      summary:
        "In these early weeks, sleep and feeds vary a lot. Keep things responsive: offer rest when sleepy cues appear, and log what happens. Timed predictions start at 2 months corrected age.",
      bedtime: null,
    };
  if (now < expectedWake && !observed && !active)
    return {
      ...base,
      status: "night",
      headline: "Keep the night gentle.",
      summary: "Log the next morning wake to build a fresh daytime plan.",
      bedtime: null,
    };
  if (active?.details.sleepType === "night")
    return {
      ...base,
      status: "sleeping",
      headline: "Rest is the plan for now.",
      summary:
        "Overnight sleep is running. End the timer in the morning and today’s strategy will follow the actual wake-up.",
      awakeSince: null,
      bedtime: null,
    };
  if (now > preferredBed.plus({ hours: 2 }))
    return {
      ...base,
      status: "night",
      headline: "Time to leave the schedule behind.",
      summary:
        "If your child is awake, use your usual calming bedtime routine. Log overnight sleep when it begins; tomorrow’s plan starts from the next wake.",
      bedtime: null,
    };
  if (active) {
    base.status = "sleeping";
    base.headline = "They’re resting. You can, too.";
    base.summary =
      "This plan assumes a typical nap. When they wake, finish the timer and the remaining day will update.";
    next = maxDate(
      DateTime.fromISO(active.startedAt).plus({
        minutes: child.settings.napMinutes,
      }),
      now.plus({ minutes: 10 }),
    ).plus({ minutes: getWindow(naps.length + 1) });
    base.awakeSince = null;
  }
  const overdue = minutes(now, next);
  if (overdue > 15 && !active && !skipped) {
    reasons.push({
      code: "window-passed",
      title: "The window has passed",
      detail:
        "Offer a calm opportunity to sleep now if your child seems ready. If you already tried, log a missed nap for a fresh retry plan.",
    });
    next = now.plus({ minutes: 5 });
    base.status = "settling";
  }
  next = maxDate(next, now);
  let remaining = Math.max(0, plannedNaps - naps.length - (active ? 1 : 0));
  const steps: PlanStep[] = [];
  let cursor = next;
  let lastEnd = active
    ? next.minus({ minutes: getWindow(naps.length + 1) })
    : awakeSince;
  let projectedIndex = naps.length + (active ? 1 : 0);
  while (remaining > 0) {
    let duration =
      remaining === 1 && plannedNaps >= 3
        ? Math.min(35, child.settings.napMinutes)
        : child.settings.napMinutes;
    const available = minutes(
      preferredBed
        .plus({ minutes: 30 })
        .minus({ minutes: getWindow(projectedIndex + 1) }),
      cursor,
    );
    if (remaining === 1 && available >= 15 && available < duration) {
      duration = available;
      reasons.push({
        code: "short-final-nap",
        title: "Room for a shorter final nap",
        detail: `A ${duration}-minute final nap leaves room for your usual evening wake window. This is a planning option; follow your child’s cues.`,
      });
    }
    const end = cursor.plus({ minutes: duration });
    if (
      end.plus({ minutes: getWindow(projectedIndex + 1) }) >
      preferredBed.plus({ minutes: 30 })
    ) {
      reasons.push({
        code: "protect-bedtime",
        title: "Keep some space before bedtime",
        detail:
          "Another full nap would crowd your preferred bedtime. Consider an earlier night; use a short rest only if your child needs it.",
      });
      break;
    }
    steps.push({
      id: `nap-${projectedIndex + 1}`,
      kind: "nap",
      at: iso(cursor),
      endAt: iso(end),
      title: `Nap ${projectedIndex + 1}`,
      detail: `Allow about ${duration} minutes as a planning estimate. Recalculate from the actual wake-up.`,
      tentative: steps.length > 0 || !!active,
    });
    lastEnd = end;
    projectedIndex++;
    remaining--;
    cursor = end.plus({ minutes: getWindow(projectedIndex) });
  }
  let bed = lastEnd.plus({ minutes: getWindow(plannedNaps) });
  if (steps.length === 0 && !active) bed = next;
  const earliest = preferredBed.minus({ minutes: 90 });
  bed = maxDate(
    now,
    maxDate(earliest, minDate(preferredBed.plus({ minutes: 30 }), bed)),
  );
  // With no naps, preserve the family's bedtime; never suggest a morning bedtime.
  if (plannedNaps === 0) bed = maxDate(now, preferredBed);
  if (bed < preferredBed.minus({ minutes: 20 }))
    reasons.push({
      code: "early-bedtime",
      title: "An earlier night is an option",
      detail: `Aim around ${bed.toFormat("h:mm a")} rather than stretching a tired child to the usual bedtime.`,
    });
  if (minutes(bed, lastEnd) > getWindow(plannedNaps) + 60 && plannedNaps > 0)
    base.alternatives.push({
      title: "If bedtime still feels too far away",
      detail:
        "Offer a short opportunity to rest if your child needs it. Log the actual sleep and we’ll rebuild the evening around it.",
    });
  steps.push({
    id: "bedtime",
    kind: "bedtime",
    at: iso(bed),
    title: "Bedtime",
    detail:
      "Keep the familiar routine. This time can move with your child’s cues.",
    tentative: steps.length > 0 || !!active,
  });
  const first = steps[0];
  const firstTime = DateTime.fromISO(first.at);
  const windDown = maxDate(
    now,
    firstTime.minus({ minutes: child.settings.windDownMinutes }),
  );
  base.nextSleep = first.at;
  base.windowStart = iso(maxDate(now, firstTime.minus({ minutes: 10 })));
  base.windowEnd = iso(firstTime.plus({ minutes: 10 }));
  base.windDownAt = iso(windDown);
  base.bedtime = iso(bed);
  base.steps = [
    {
      id: "wind-down",
      kind: "wind-down",
      at: iso(windDown),
      title: "A quieter few minutes",
      detail: `Begin your usual ${child.settings.windDownMinutes}-minute wind-down.`,
      tentative: !!active,
    },
    ...steps,
  ];
  if (!active) {
    base.headline = skipped
      ? "A missed nap. A new plan."
      : lastNapMinutes !== null && lastNapMinutes < 40
        ? "A short nap doesn’t have to derail the day."
        : reasons.some((r) => r.code === "late-wake")
          ? "A late start. Still a lovely day."
          : "A little rhythm for the rest of today.";
    base.summary = `${first.kind === "bedtime" ? "Aim for bedtime" : "Offer the next nap"} around ${firstTime.setZone(child.timezone).toFormat("h:mm a")}. ${steps.length > 1 ? "The remaining naps and bedtime adapt each time you log sleep." : "Keep the evening calm and follow sleepy cues."}`;
  }
  if (!reasons.length)
    reasons.push({
      code: "routine",
      title: "Following today’s rhythm",
      detail: `Using ${window} minutes awake, ${naps.length} completed naps, and your preferred ${child.settings.bedtime} bedtime.`,
    });
  base.alternatives.push(
    {
      title: "If the next nap is short",
      detail:
        "Finish the sleep timer. A nap under 40 minutes shortens the following wake window by 20 minutes and replans the evening.",
    },
    {
      title: "If sleep doesn’t happen",
      detail:
        "Log “Missed nap” when the attempt ends. We’ll offer a retry time and reconsider the remaining naps and bedtime.",
    },
  );
  return base;
}
