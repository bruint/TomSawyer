import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { buildStrategy, dayBoundary } from "../server/strategy.js";
import {
  defaultSettings,
  type Child,
  type Activity,
  type ActivityKind,
} from "../shared/types.js";
import { validPushEndpoint } from "../server/push.js";
import { reminderDue } from "../server/notification-schedule.js";
const child: Child = {
  id: "child",
  familyId: "family",
  name: "Robin",
  birthDate: "2026-03-01",
  dueDate: null,
  timezone: "Australia/Perth",
  color: "sage",
  settings: {
    ...defaultSettings,
    napCount: 3,
    wakeWindows: [150, 165, 180, 180],
  },
  createdAt: "2026-03-01T00:00:00Z",
};
const at = (time: string) => `2026-10-07T${time}:00+08:00`;
const activity = (
  kind: ActivityKind,
  start: string,
  end: string | null = null,
  details: any = {},
): Activity => ({
  id: randomUUID(),
  childId: "child",
  kind,
  startedAt: at(start),
  endedAt: end ? at(end) : null,
  state: "complete",
  pausedAt: null,
  pausedMs: 0,
  details,
  notes: "",
  createdBy: "u",
  authorName: "Parent",
  version: 1,
  createdAt: at(start),
  updatedAt: at(start),
});
test("short naps reduce the next wake window and give actionable reasons", () => {
  const plan = buildStrategy(
    child,
    [
      activity("wake", "07:00"),
      activity("sleep", "09:30", "09:55", { sleepType: "nap" }),
    ],
    new Date(at("10:00")),
  );
  assert.equal(plan.wakeWindowMinutes, 145);
  assert.equal(plan.totalNapMinutes, 25);
  assert(plan.reasons.some((r) => r.code === "short-nap"));
  assert(plan.steps.some((s) => s.kind === "bedtime"));
  assert.equal(
    DateTime.fromISO(plan.nextSleep!).setZone(child.timezone).toFormat("HH:mm"),
    "12:20",
  );
});
test("missed nap replans without a fake sleep log", () => {
  const plan = buildStrategy(
    child,
    [activity("wake", "07:00"), activity("skipped_nap", "10:00")],
    new Date(at("10:05")),
  );
  assert.equal(plan.completedNaps, 0);
  assert(plan.reasons.some((r) => r.code === "missed-nap"));
  assert.equal(
    DateTime.fromISO(plan.nextSleep!).setZone(child.timezone).toFormat("HH:mm"),
    "11:00",
  );
});
test("a saved nap count allows a later bedtime after a late wake without dropping naps", () => {
  const plan = buildStrategy(
    child,
    [activity("wake", "09:00")],
    new Date(at("09:10")),
  );
  assert(plan.reasons.some((r) => r.code === "late-wake"));
  assert(
    plan.reasons.some(
      (r) => r.code === "protect-bedtime" || r.code === "short-final-nap",
    ),
  );
  const steps = plan.steps.filter((s) => s.kind !== "wind-down");
  for (let i = 1; i < steps.length; i++)
    assert(
      Date.parse(steps[i].at) >=
        Date.parse(steps[i - 1].endAt || steps[i - 1].at),
    );
  assert.equal(steps.filter((step) => step.kind === "nap").length, 3);
  assert(plan.reasons.some((reason) => reason.code === "late-bedtime"));
  assert(DateTime.fromISO(plan.bedtime!).setZone(child.timezone).hour > 20);
});
test("active overnight sleep has no daytime alarms or predictions", () => {
  const overnight = {
    ...activity("sleep", "01:00", null, { sleepType: "night" }),
    state: "active" as const,
  };
  const plan = buildStrategy(child, [overnight], new Date(at("06:00")));
  assert.equal(plan.status, "sleeping");
  assert.equal(plan.windDownAt, null);
  assert.equal(plan.nextSleep, null);
});
test("an ongoing nap continually replans from waking now and includes sleep so far", () => {
  const active = {
    ...activity("sleep", "09:00", null, { sleepType: "nap" }),
    state: "active" as const,
  };
  const logs = [activity("wake", "07:00"), active];
  const planAt = (time: string) =>
    buildStrategy(child, logs, new Date(at(time)));
  const short = planAt("09:20");
  assert.equal(short.status, "sleeping");
  assert.equal(short.summary, "If they wake now");
  assert.equal(short.totalNapMinutes, 20);
  assert.equal(short.completedNaps, 0);
  assert.equal(short.wakeWindowMinutes, 145);
  assert.equal(
    DateTime.fromISO(short.nextSleep!)
      .setZone(child.timezone)
      .toFormat("HH:mm"),
    "11:45",
  );
  assert(short.reasons.some((reason) => reason.code === "short-nap"));
  const longer = planAt("09:50");
  assert.equal(longer.totalNapMinutes, 50);
  assert.equal(longer.wakeWindowMinutes, 165);
  assert.equal(
    DateTime.fromISO(longer.nextSleep!)
      .setZone(child.timezone)
      .toFormat("HH:mm"),
    "12:35",
  );
  assert(!longer.reasons.some((reason) => reason.code === "short-nap"));
  assert(
    longer.reasons.some((reason) =>
      ["protect-bedtime", "short-final-nap"].includes(reason.code),
    ),
  );
  assert(longer.steps.every((step) => step.tentative));
  assert.equal(
    Date.parse(planAt("09:51").nextSleep!) - Date.parse(longer.nextSleep!),
    60000,
  );
  assert.equal(planAt("09:51").totalNapMinutes, 51);
  assert.equal(active.endedAt, null, "projections never finish the real timer");
});
test("newborn corrected age suppresses rigid scheduling", () => {
  const c = { ...child, birthDate: "2026-07-01", dueDate: "2026-09-10" };
  const p = buildStrategy(
    c,
    [activity("wake", "07:00")],
    new Date(at("08:00")),
  );
  assert.equal(p.status, "gentle");
  assert.equal(p.steps.length, 0);
  assert.equal(p.bedtime, null);
});
test("missing wake data is explicitly labelled and no invented observed wake is exposed", () => {
  const p = buildStrategy(child, [], new Date(at("09:00")));
  assert.equal(p.confidence, "Your custom routine");
  assert.equal(p.awakeSince, null);
  assert(p.reasons.some((r) => r.code === "missing-wake"));
});
test("nap comparison does not mutate saved settings", () => {
  const before = JSON.stringify(child);
  const p = buildStrategy(
    child,
    [activity("wake", "07:00")],
    new Date(at("09:00")),
    { napCount: 2 },
  );
  assert.equal(p.plannedNaps, 2);
  assert.equal(JSON.stringify(child), before);
});

const flexibleChild: Child = {
  ...child,
  birthDate: "2026-06-01",
  settings: { ...defaultSettings },
};
const clock = (value: string | null) =>
  value
    ? DateTime.fromISO(value).setZone(child.timezone).toFormat("HH:mm")
    : null;

test("automatic compares complete three- and four-nap plans with different wake windows", () => {
  const running = { ...activity("sleep", "11:00"), state: "active" as const };
  const logs = [
    activity("wake", "07:00"),
    activity("sleep", "09:00", "09:25"),
    running,
  ];
  const before = JSON.stringify({ child: flexibleChild, logs });
  const auto = buildStrategy(flexibleChild, logs, new Date(at("12:30")));
  assert.deepEqual(
    auto.napOptions?.map((option) => option.napCount),
    [3, 4],
  );
  assert(auto.napOptions?.every((option) => option.available));
  assert.equal(auto.plannedNaps, 3);
  const three = buildStrategy(flexibleChild, logs, new Date(at("12:30")), {
    napCount: 3,
  });
  const four = buildStrategy(flexibleChild, logs, new Date(at("12:30")), {
    napCount: 4,
  });
  assert.equal(three.wakeWindowMinutes, 150);
  assert.equal(four.wakeWindowMinutes, 120);
  assert.equal(clock(three.bedtime), "18:30");
  assert.equal(clock(four.bedtime), "20:00");
  assert.equal(three.steps.filter((step) => step.kind === "nap").length, 1);
  assert.equal(four.steps.filter((step) => step.kind === "nap").length, 2);
  const final = three.steps.find((step) => step.kind === "nap")!;
  assert.equal(
    Date.parse(final.endAt!) - Date.parse(final.at),
    60 * 60000,
    "a final nap is not automatically capped at 35 minutes",
  );
  assert(three.steps.every((step) => step.tentative));
  assert(four.reasons.some((reason) => reason.code === "nap-choice"));
  assert.equal(JSON.stringify({ child: flexibleChild, logs }), before);
});

test("short-nap days can select an extra nap while longer naps can select fewer", () => {
  const shortLogs = [
    activity("wake", "07:00"),
    activity("sleep", "08:30", "08:50"),
    activity("sleep", "10:35", "10:55"),
  ];
  const short = buildStrategy(flexibleChild, shortLogs, new Date(at("11:00")));
  assert.equal(short.plannedNaps, 4);
  assert.equal(short.wakeWindowMinutes, 100);
  assert.equal(clock(short.bedtime), "18:50");
  const longLogs = [
    activity("wake", "07:00"),
    activity("sleep", "09:00", "11:00"),
    { ...activity("sleep", "13:00"), state: "active" as const },
  ];
  const long = buildStrategy(flexibleChild, longLogs, new Date(at("14:30")));
  assert.equal(long.plannedNaps, 3);
  assert.equal(long.totalNapMinutes, 210);
  assert.equal(clock(long.bedtime), "19:45");
  assert.equal(
    clock(
      long.napOptions?.find((option) => option.napCount === 4)?.bedtime ?? null,
    ),
    "21:45",
  );
});

test("bedtime can move earlier and later than the old preferred-time clamps", () => {
  const logs = [
    activity("wake", "07:00"),
    activity("sleep", "08:30", "08:50"),
    activity("sleep", "10:35", "10:55"),
  ];
  const early = buildStrategy(flexibleChild, logs, new Date(at("11:00")), {
    napCount: 3,
  });
  assert.equal(clock(early.bedtime), "16:35");
  assert(early.reasons.some((reason) => reason.code === "early-bedtime"));
  const late = buildStrategy(
    flexibleChild,
    [activity("wake", "09:00")],
    new Date(at("09:10")),
  );
  assert.equal(clock(late.bedtime), "20:15");
  assert(late.reasons.some((reason) => reason.code === "late-bedtime"));
  assert.equal(
    late.steps.filter((step) => step.kind === "nap").length,
    late.plannedNaps,
  );
});

test("a long late nap can lead straight to bedtime with an honest lower count", () => {
  const logs = [
    activity("wake", "07:00"),
    activity("sleep", "09:00", "10:00"),
    activity("sleep", "14:00", "16:45"),
  ];
  const plan = buildStrategy(flexibleChild, logs, new Date(at("16:50")));
  assert.equal(plan.plannedNaps, 2);
  assert.equal(
    plan.wakeWindowMinutes,
    150,
    "the evening option keeps age-appropriate wake windows",
  );
  assert.equal(clock(plan.bedtime), "19:15");
  assert.equal(plan.steps.filter((step) => step.kind === "nap").length, 0);
  assert.equal(plan.steps.at(-1)?.kind, "bedtime");
  assert(
    plan.napOptions?.some(
      (option) => option.napCount === 2 && option.recommended,
    ),
  );
});

test("unavailable nap counts are explained and never mislabel the actual timeline", () => {
  const late = buildStrategy(
    flexibleChild,
    [activity("wake", "09:00")],
    new Date(at("09:10")),
    { napCount: 6 },
  );
  assert.notEqual(late.plannedNaps, 6);
  assert(
    late.reasons.some((reason) => reason.code === "nap-count-unavailable"),
  );
  assert.equal(
    late.napOptions?.find((option) => option.napCount === 6)?.available,
    false,
  );
  assert.equal(
    late.steps.filter((step) => step.kind === "nap").length,
    late.plannedNaps,
  );
  const logs = [
    activity("wake", "07:00"),
    activity("sleep", "08:30", "08:50"),
    activity("sleep", "10:35", "10:55"),
  ];
  const past = buildStrategy(flexibleChild, logs, new Date(at("11:00")), {
    napCount: 1,
  });
  assert(past.plannedNaps >= 2);
  assert.equal(
    past.napOptions?.find((option) => option.napCount === 1)?.available,
    false,
  );
  assert(
    past.reasons.some((reason) => reason.code === "nap-count-unavailable"),
  );
});

function history(count: number, days: number, includeNight = true): Activity[] {
  return Array.from({ length: days }, (_, offset) => {
    const day = DateTime.fromISO(at("07:00")).minus({ days: offset + 1 });
    const dated = (entry: Activity) => ({
      ...entry,
      startedAt: DateTime.fromISO(entry.startedAt)
        .minus({ days: offset + 1 })
        .toISO()!,
      endedAt: entry.endedAt
        ? DateTime.fromISO(entry.endedAt)
            .minus({ days: offset + 1 })
            .toISO()!
        : null,
    });
    return [
      dated(activity("wake", "07:00")),
      ...["09:00", "12:00", "15:00", "17:30"]
        .slice(0, count)
        .map((start) =>
          dated(
            activity(
              "sleep",
              start,
              DateTime.fromISO(at(start))
                .plus({ minutes: 45 })
                .toFormat("HH:mm"),
            ),
          ),
        ),
      ...(includeNight
        ? [
            {
              ...activity("sleep", "20:00", "21:00", { sleepType: "night" }),
              startedAt: day.set({ hour: 20 }).toISO()!,
              endedAt: day.plus({ days: 1 }).toISO()!,
            },
          ]
        : []),
    ];
  }).flat();
}

test("recent logged routines influence automatic choices without treating partial days as fewer naps", () => {
  const today = [
    activity("wake", "07:00"),
    activity("sleep", "09:00", "09:25"),
    { ...activity("sleep", "11:00"), state: "active" as const },
  ];
  const plan = (older: Activity[]) =>
    buildStrategy(flexibleChild, [...older, ...today], new Date(at("12:30")));
  assert.equal(plan([]).plannedNaps, 3);
  assert.equal(plan(history(4, 3)).plannedNaps, 4);
  assert(
    plan(history(4, 3)).reasons.some(
      (reason) => reason.code === "recent-routine",
    ),
  );
  assert.equal(
    plan(history(4, 2)).plannedNaps,
    3,
    "two days are not enough to learn a routine",
  );
  assert.equal(
    plan(history(1, 4, false)).plannedNaps,
    3,
    "partial days do not imply a one-nap routine",
  );
  assert.equal(
    plan(history(0, 4)).plannedNaps,
    3,
    "missing nap logs do not imply no naps",
  );
});

test("automatic alert plans keep the same count and deadlines when time passes without a log", () => {
  const logs = [activity("wake", "07:00")];
  const before = buildStrategy(flexibleChild, logs, new Date(at("07:30")), {
    rollForward: false,
  });
  const after = buildStrategy(flexibleChild, logs, new Date(at("11:00")), {
    rollForward: false,
  });
  assert.equal(before.plannedNaps, after.plannedNaps);
  assert.equal(before.nextSleep, after.nextSleep);
  assert.equal(before.windDownAt, after.windDownAt);
  assert.equal(before.windowStart, after.windowStart);
  const preview = buildStrategy(flexibleChild, logs, new Date(at("07:30")), {
    napCount: 0,
  });
  assert.equal(
    preview.napOptions?.find((option) => option.recommended)?.napCount,
    before.plannedNaps,
    "a preview must not change which count is recommended in the live plan",
  );
});

test("schedules stay chronological and their counts include completed and running naps", () => {
  const logs = [
    activity("wake", "07:00"),
    activity("sleep", "09:00", "09:25"),
    { ...activity("sleep", "11:00"), state: "active" as const },
  ];
  for (const birthDate of [
    "2026-06-01",
    "2026-03-01",
    "2025-10-01",
    "2025-01-01",
  ]) {
    for (let napCount = 0; napCount <= 6; napCount++) {
      const plan = buildStrategy(
        { ...flexibleChild, birthDate },
        logs,
        new Date(at("12:30")),
        { napCount },
      );
      const steps = plan.steps.filter((step) => step.kind !== "wind-down");
      assert.equal(
        plan.plannedNaps,
        2 + steps.filter((step) => step.kind === "nap").length,
      );
      for (let index = 1; index < steps.length; index++) {
        assert(
          Date.parse(steps[index].at) >=
            Date.parse(steps[index - 1].endAt ?? steps[index - 1].at),
        );
      }
      assert(
        steps.every((step) => Date.parse(step.at) >= Date.parse(at("12:30"))),
      );
    }
  }
});
test("sleep-day boundary handles DST and local dates", () => {
  const c = { ...child, timezone: "America/New_York" };
  const now = DateTime.fromISO("2026-11-01T02:30:00", { zone: c.timezone });
  const start = dayBoundary(c, now);
  assert.equal(start.toISODate(), "2026-10-31");
  assert.equal(start.hour, 4);
});
test("interval reminders count from start, only once per anchor, and obey selected days", () => {
  const r = {
    id: "r",
    childId: "child",
    title: "Feed",
    kind: "bottle" as const,
    mode: "interval" as const,
    atTime: "09:00",
    intervalMinutes: 180,
    weekdays: [3],
    daytimeOnly: true,
    enabled: true,
  };
  const events = [activity("bottle", "07:00")];
  const due = reminderDue(r, child, events, DateTime.fromISO(at("10:00")))!;
  assert.equal(
    due.at.toUTC().toISO(),
    DateTime.fromISO(at("10:00")).toUTC().toISO(),
  );
  assert(due.key.includes(events[0].id));
  assert.equal(
    reminderDue(
      { ...r, weekdays: [1] },
      child,
      events,
      DateTime.fromISO(at("10:00")),
    ),
    null,
  );
  assert.equal(
    reminderDue(r, child, events, DateTime.fromISO(at("22:00"))),
    null,
  );
});
test("push registration blocks private addresses and lookalike endpoints", () => {
  assert(validPushEndpoint("https://fcm.googleapis.com/fcm/send/token"));
  assert(validPushEndpoint("https://web.push.apple.com/Q/token"));
  for (const url of [
    "http://127.0.0.1",
    "https://localhost",
    "https://fcm.googleapis.com.attacker.test/a",
    "https://user:pass@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:444/a",
  ])
    assert(!validPushEndpoint(url), url);
});
