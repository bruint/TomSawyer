import { DateTime } from "luxon";
import { trackerEnabled } from "../../shared/tracking.js";
import { elapsedMs, type Activity, type Child } from "../../shared/types.js";
import { buildStrategy } from "../strategy.js";
import { sleepContext } from "../strategy/context.js";

export function buildCoachContext(child: Child, events: Activity[], now: Date) {
  const context = sleepContext(child, events, now);
  const plan = buildStrategy(child, events, now);
  const localTime = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setZone(child.timezone).toISO() : null;
  const relevant = events.filter(
    (entry) =>
      trackerEnabled(child, entry.kind) &&
      Date.parse(entry.startedAt) <= now.getTime(),
  );
  const today = relevant.filter(
    (entry) =>
      Date.parse(entry.startedAt) >= context.day.toMillis() ||
      (entry.endedAt && Date.parse(entry.endedAt) >= context.day.toMillis()) ||
      entry.state !== "complete",
  );
  const active = context.active;
  const state = active
    ? active.details.sleepType === "night"
      ? "night-sleep"
      : "napping"
    : context.nightState?.phase === "awake"
      ? "night-waking"
      : "awake";
  const awakeSince =
    state === "night-waking"
      ? context.nightState!.activity.endedAt
      : context.observed
        ? context.awakeSince.toISO()
        : null;
  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const day = context.day.startOf("day").minus({ days: offset + 1 });
    const date = day.toISODate();
    const naps = relevant.filter(
      (entry) =>
        entry.kind === "sleep" &&
        entry.details.sleepType !== "night" &&
        entry.state === "complete" &&
        DateTime.fromISO(entry.startedAt)
          .setZone(child.timezone)
          .toISODate() === date,
    );
    return {
      date,
      recordedNaps: naps.length,
      recordedNapMinutes: naps.reduce(
        (total, nap) =>
          total + Math.floor(elapsedMs(nap, now.getTime()) / 60000),
        0,
      ),
    };
  }).filter((day) => day.recordedNaps > 0);

  return {
    currentTime: context.now.toISO()!,
    timezone: child.timezone,
    child: {
      name: child.name,
      ageDays: Math.max(
        0,
        Math.floor(
          context.now.diff(
            DateTime.fromISO(child.birthDate, { zone: child.timezone }),
            "days",
          ).days,
        ),
      ),
      ageMonths: Math.max(
        0,
        context.now.diff(
          DateTime.fromISO(child.birthDate, { zone: child.timezone }),
          "months",
        ).months,
      ),
      correctedAgeMonths: context.ageMonths,
      usesCorrectedAge: !!child.dueDate && child.dueDate > child.birthDate,
    },
    routine: {
      usualMorning: child.settings.wakeTime,
      usualBedtime: child.settings.bedtime,
      configuredNapCount: child.settings.napCount,
      customWakeWindowsMinutes: child.settings.wakeWindows,
      usualNapMinutes: child.settings.napMinutes,
      windDownMinutes: child.settings.windDownMinutes,
    },
    today: {
      sleepDay: plan.day,
      state,
      ongoingSleep: active
        ? {
            startedAt: localTime(active.startedAt),
            type: active.details.sleepType === "night" ? "night" : "nap",
            elapsedMinutes: Math.floor(
              elapsedMs(active, now.getTime()) / 60000,
            ),
          }
        : null,
      awakeSince: active ? null : localTime(awakeSince),
      awakeMinutes:
        !active && awakeSince
          ? Math.max(
              0,
              Math.floor((now.getTime() - Date.parse(awakeSince)) / 60000),
            )
          : null,
      completedNaps: context.naps.length,
      totalNapMinutes: context.totalNapMinutes,
      entries: today.slice(0, 60).map((entry) => ({
        kind: entry.kind,
        startedAt: localTime(entry.startedAt),
        endedAt: localTime(entry.endedAt),
        state: entry.state,
        durationMinutes: ["sleep", "nursing", "pumping", "activity"].includes(
          entry.kind,
        )
          ? Math.floor(elapsedMs(entry, now.getTime()) / 60000)
          : null,
        details: Object.fromEntries(
          Object.entries(entry.details).filter(([key]) => key !== "photoId"),
        ),
        notes: entry.notes.slice(0, 1000),
      })),
    },
    livePlan: {
      headline: plan.headline,
      summary: plan.summary,
      nextSleep: localTime(plan.nextSleep),
      windDownAt: localTime(plan.windDownAt),
      bedtime: localTime(plan.bedtime),
      wakeWindowMinutes: plan.wakeWindowMinutes,
      recommendedNapCount: plan.plannedNaps,
      napOptions: plan.napOptions,
      steps: plan.steps,
      reasons: plan.reasons,
      alternatives: plan.alternatives,
      confidence: plan.confidence,
    },
    recentDays,
    recordingNote:
      "Only recorded entries are known. Missing logs do not mean no sleep, feeding, or care occurred. The live plan is a flexible estimate, not a fixed schedule.",
  };
}

export type CoachContext = ReturnType<typeof buildCoachContext>;
