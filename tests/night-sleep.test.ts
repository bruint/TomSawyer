import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DateTime } from "luxon";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { buildStrategy } from "../server/strategy.js";
import { notificationJobs } from "../server/notification-schedule.js";
import { nightSleepState } from "../shared/night-sleep.js";
import {
  defaultSettings,
  type Activity,
  type Child,
  type TimerAction,
} from "../shared/types.js";
import { buildDailyReport } from "../src/lib/report-data";

const zone = "Australia/Perth";
const date = DateTime.now().setZone(zone).minus({ days: 1 }).toISODate()!;
const at = (clock: string, days = 0) =>
  DateTime.fromISO(`${date}T${clock}`, { zone })
    .plus({ days })
    .toUTC()
    .toISO()!;
const now = (clock: string) => new Date(at(clock));
const child: Child = {
  id: "robin",
  familyId: "family",
  name: "Robin",
  birthDate: DateTime.fromISO(date).minus({ months: 4 }).toISODate()!,
  dueDate: null,
  timezone: zone,
  color: "sage",
  createdAt: at("07:00", -1),
  settings: {
    ...defaultSettings,
    napCount: 3,
    wakeWindows: [120, 135, 150, 165],
  },
};

function activity(
  id: string,
  kind: Activity["kind"],
  start: string,
  end: string | null = null,
): Activity {
  return {
    id,
    kind,
    childId: child.id,
    startedAt: start,
    endedAt: end,
    state: kind === "sleep" && !end ? "active" : "complete",
    pausedAt: null,
    pausedMs: 0,
    details: kind === "sleep" ? { sleepType: "night", nightWake: true } : {},
    notes: "",
    version: 1,
    createdBy: "parent",
    authorName: "Parent",
    createdAt: start,
    updatedAt: start,
  };
}

test("night waking stays overnight across the sleep-day boundary and usual morning time, with no daytime alerts", () => {
  for (const clock of ["03:00", "04:30", "07:30"]) {
    const night = activity("night", "sleep", at("20:00", -1), at(clock));
    const events = [activity("old-morning", "wake", at("07:00", -1)), night];
    for (const check of [
      DateTime.fromISO(at(clock)).plus({ minutes: 1 }),
      DateTime.fromISO(at("09:00")),
    ]) {
      const plan = buildStrategy(child, events, check.toJSDate());
      assert.equal(nightSleepState(events, check.toJSDate())?.phase, "awake");
      assert.equal(plan.status, "night");
      assert.equal(plan.headline, "Night waking");
      assert.equal(plan.awakeSince, night.endedAt);
      assert.equal(plan.nextSleep, null);
      assert.equal(plan.windDownAt, null);
      assert.equal(plan.steps.length, 0);
      assert.equal(notificationJobs(child, events, [], check).length, 0);
    }
  }
});

test("Up for the day anchors the plan to the actual wake, including a morning before the sleep-day boundary", () => {
  for (const clock of ["03:30", "05:00", "07:30"]) {
    const endedAt = at(clock);
    const night = activity("night", "sleep", at("20:00", -1), endedAt);
    const morning = activity("morning", "wake", endedAt);
    morning.details.dayStarted = true;
    const events = [
      activity("old-morning", "wake", at("07:00", -1)),
      night,
      morning,
    ];
    const checks = [
      DateTime.fromISO(endedAt).plus({ minutes: 1 }),
      DateTime.fromISO(endedAt).plus({ minutes: 45 }),
    ];
    for (const check of checks) {
      const plan = buildStrategy(child, events, check.toJSDate());
      assert.equal(nightSleepState(events, check.toJSDate()), null);
      assert.equal(plan.status, "ready");
      assert.equal(plan.day, date);
      assert.equal(plan.awakeSince, endedAt);
      assert.equal(
        Date.parse(plan.nextSleep!),
        DateTime.fromISO(endedAt).plus({ minutes: 120 }).toMillis(),
      );
      assert(!plan.reasons.some((reason) => reason.code === "missing-wake"));
    }
    const deadline = DateTime.fromISO(endedAt).plus({ minutes: 105 });
    assert(
      notificationJobs(child, events, [], deadline).some(
        (job) => job.alert === "windDown",
      ),
    );
  }
});

test("overnight segments after the day boundary do not hide the recent daytime nap routine", () => {
  const events: Activity[] = [];
  for (const offset of [-1, -2, -3]) {
    const morningSleep = activity(
      `morning-sleep-${offset}`,
      "sleep",
      at("05:00", offset),
      at("07:00", offset),
    );
    morningSleep.details.nightWake = false;
    events.push(
      activity(
        `night-wake-${offset}`,
        "sleep",
        at("20:00", offset - 1),
        at("04:45", offset),
      ),
      morningSleep,
      activity(`morning-${offset}`, "wake", at("07:00", offset)),
      activity(
        `bedtime-${offset}`,
        "sleep",
        at("19:30", offset),
        at("22:00", offset),
      ),
    );
    for (const clock of ["09:00", "11:00", "13:30", "16:00"]) {
      const nap = activity(
        `nap-${offset}-${clock}`,
        "sleep",
        at(clock, offset),
        DateTime.fromISO(at(clock, offset))
          .plus({ minutes: 30 })
          .toUTC()
          .toISO()!,
      );
      nap.details = { sleepType: "nap" };
      events.push(nap);
    }
  }
  events.push(activity("today-morning", "wake", at("07:00")));
  const automatic = { ...child, settings: { ...defaultSettings } };
  const plan = buildStrategy(automatic, events, now("07:30"));
  assert.equal(plan.confidence, "Based on your logs");
  assert(
    plan.reasons.some(
      (reason) =>
        reason.code === "recent-routine" &&
        reason.detail.includes("logged days: 4 naps"),
    ),
  );
});

test("returning to night sleep after an early morning uses the final morning wake for the daytime plan", () => {
  const earlyWake = activity("early-morning", "wake", at("03:30"));
  earlyWake.details.dayStarted = true;
  const settled = activity("resettled", "sleep", at("04:00"), at("07:00"));
  settled.details.nightWake = false;
  const morning = activity("morning", "wake", at("07:00"));
  morning.details.dayStarted = true;
  const events = [earlyWake, settled, morning];
  const plan = buildStrategy(child, events, now("07:01"));
  assert.equal(plan.awakeSince, at("07:00"));
  assert.equal(plan.nextSleep, at("09:00"));
});

async function familyApi(t: TestContext) {
  const db = openDatabase(":memory:");
  const origin = "http://localhost:5173";
  const server = createApp(db, {
    setupToken: "test-key",
    appUrl: origin,
    rateLimits: false,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const { port } = server.address() as { port: number };
  let cookie = "";
  async function request<T = unknown>(
    path: string,
    method = "GET",
    input?: unknown,
  ) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-TomSawyer": "1",
        Origin: origin,
        Cookie: cookie,
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return { status: response.status, body: (await response.json()) as T };
  }
  assert.equal(
    (
      await request("/auth/setup", "POST", {
        name: "Parent",
        email: "parent@example.test",
        password: "a secure test passphrase",
        familyName: "Family",
        setupToken: "test-key",
      })
    ).status,
    201,
  );
  const profile = await request<Child>("/children", "POST", child);
  assert.equal(profile.status, 201);
  const created = await request<Activity>(
    `/children/${profile.body.id}/activities`,
    "POST",
    {
      kind: "sleep",
      startedAt: at("19:00", -1),
      state: "active",
      details: { sleepType: "night", settledBy: "Rocking" },
      notes: "Original night note",
    },
  );
  assert.equal(created.status, 201);
  const logs = async () =>
    (await request<Activity[]>(`/children/${profile.body.id}/activities`)).body;
  const transition = (sleep: Activity, action: TimerAction, clock: string) =>
    request(`/activities/${sleep.id}/timer`, "POST", {
      action,
      version: sleep.version,
      at: at(clock),
    });
  return {
    request,
    profile: profile.body,
    initial: created.body,
    logs,
    transition,
    db,
  };
}

test("single night actions record separate segments, preserve awake gaps and finish with one morning wake", async (t) => {
  const { initial, logs, transition } = await familyApi(t);
  assert.equal((await transition(initial, "night-wake", "02:00")).status, 200);
  assert.equal((await transition(initial, "night-wake", "02:00")).status, 409);
  let events = await logs();
  const first = events.find((entry) => entry.id === initial.id)!;
  assert.equal(first.details.nightWake, true);
  assert.equal(first.endedAt, at("02:00"));
  assert.equal(first.details.settledBy, "Rocking");
  assert.equal(first.notes, "Original night note");
  assert.equal(events.filter((entry) => entry.kind === "wake").length, 0);
  assert.equal((await transition(first, "back-asleep", "02:20")).status, 200);
  assert.equal((await transition(first, "back-asleep", "02:20")).status, 409);
  events = await logs();
  let running = events.find((entry) => entry.state === "active")!;
  assert.equal(running.details.sleepType, "night");
  assert.equal(running.startedAt, at("02:20"));
  assert.equal((await transition(running, "night-wake", "05:00")).status, 200);
  events = await logs();
  const second = events.find((entry) => entry.id === running.id)!;
  assert.equal((await transition(second, "back-asleep", "05:10")).status, 200);
  events = await logs();
  running = events.find((entry) => entry.state === "active")!;
  assert.equal((await transition(running, "up-for-day", "07:00")).status, 200);
  assert.equal((await transition(running, "up-for-day", "07:00")).status, 409);
  events = await logs();
  assert.equal(events.filter((entry) => entry.state !== "complete").length, 0);
  assert.equal(events.filter((entry) => entry.kind === "sleep").length, 3);
  const morning = events.filter((entry) => entry.kind === "wake");
  assert.equal(morning.length, 1);
  assert.equal(morning[0].startedAt, at("07:00"));
  assert.equal(morning[0].details.dayStarted, true);
  assert.equal(nightSleepState(events), null);
  const reports = buildDailyReport(
    events,
    DateTime.fromISO(date, { zone }).minus({ days: 1 }),
    2,
  );
  assert.equal(
    reports.reduce((sum, report) => sum + report.night, 0),
    690,
    "the 30 awake minutes are excluded from sleep totals",
  );
});

test("Up for the day while already awake uses the actual early wake and rejects competing caregiver actions", async (t) => {
  const { initial, logs, transition, profile } = await familyApi(t);
  assert.equal((await transition(initial, "night-wake", "03:30")).status, 200);
  const awake = (await logs()).find((entry) => entry.id === initial.id)!;
  const responses = await Promise.all([
    transition(awake, "up-for-day", "03:50"),
    transition(awake, "back-asleep", "03:50"),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 409],
  );
  const events = await logs();
  assert.equal(events.filter((entry) => entry.kind === "wake").length, 1);
  assert.equal(
    events.find((entry) => entry.kind === "wake")!.startedAt,
    at("03:30"),
  );
  assert.equal(events.filter((entry) => entry.state === "active").length, 0);
  const plan = buildStrategy(profile, events, now("04:01"));
  assert.equal(plan.day, date);
  assert.equal(plan.awakeSince, at("03:30"));
  assert.equal(plan.nextSleep, at("05:30"));
});

test("night transitions reject invalid times and unrelated entries without partially changing sleep", async (t) => {
  const { initial, logs, transition, request, profile } = await familyApi(t);
  assert.equal((await transition(initial, "back-asleep", "02:00")).status, 409);
  assert.equal(
    (
      await request(`/activities/${initial.id}/timer`, "POST", {
        action: "night-wake",
        version: 1,
        at: at("18:00", -1),
      })
    ).status,
    400,
  );
  assert.equal(
    (await transition(initial, "stop", "02:00")).status,
    200,
    "older sleep-stop clients also keep night wakes out of morning planning",
  );
  const awake = (await logs()).find((entry) => entry.id === initial.id)!;
  assert.equal((await transition(awake, "back-asleep", "01:50")).status, 400);
  assert.equal((await logs()).length, 1);
  assert.equal((await logs())[0].version, 2);
  const bottle = await request<Activity>(
    `/children/${profile.id}/activities`,
    "POST",
    {
      kind: "bottle",
      startedAt: at("02:10"),
      details: { amount: 90, unit: "ml" },
    },
  );
  assert.equal(
    (await transition(bottle.body, "up-for-day", "02:20")).status,
    409,
  );
  assert.equal(
    (await logs()).filter((entry) => entry.kind === "wake").length,
    0,
  );
});
