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
test("late wake is explained and remaining naps do not crowd bedtime", () => {
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
  assert(DateTime.fromISO(plan.bedtime!).setZone(child.timezone).hour <= 20);
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
