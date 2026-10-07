import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, type Activity, type Child } from "../shared/types";
import { activitySchema } from "../server/validation";
import { buildStrategy } from "../server/strategy";
import {
  latestBottle,
  nextNursingSide,
  quickEntry,
  sleepTypeNow,
} from "../src/lib/quick-actions";

function event(kind: Activity["kind"], details: Activity["details"]): Activity {
  return {
    ...quickEntry(kind, details),
    childId: "child",
    state: "complete",
    pausedAt: null,
    createdBy: "caregiver",
    authorName: "Alex",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const child: Child = {
  id: "child",
  familyId: "family",
  name: "Rowan",
  birthDate: "2026-03-07",
  dueDate: null,
  timezone: "Australia/Perth",
  color: "sage",
  settings: { ...defaultSettings, bedtime: "21:00", wakeTime: "08:00" },
  createdAt: "2026-03-07T00:00:00Z",
};

test("quick entries have valid API payloads without form fields or copied notes", () => {
  for (const [kind, details, state] of [
    ["sleep", { sleepType: "nap" }, "active"],
    ["nursing", { side: "Left" }, "active"],
    ["pumping", { unit: "ml" }, "active"],
    ["diaper", { diaperType: "Wet" }, "complete"],
    ["diaper", { diaperType: "Dirty" }, "complete"],
    ["bottle", { amount: 120, unit: "ml" }, "complete"],
    ["wake", {}, "complete"],
    ["skipped_nap", {}, "complete"],
  ] as const) {
    const input = quickEntry(kind, details, state);
    assert.doesNotThrow(() => activitySchema.parse(input));
    assert.equal(input.notes, "");
    assert.equal(input.endedAt, null);
  }
});

test("bottle shortcut uses the recorded amount and units without copying unrelated fields", () => {
  const previous = event("bottle", {
    amount: 4,
    unit: "oz",
    milkType: "Formula",
    reaction: "Old note",
  });
  assert.deepEqual(latestBottle([previous]), {
    amount: 4,
    unit: "oz",
    milkType: "Formula",
  });
  assert.equal(latestBottle([]), null);
  const invalidCases: Activity["details"][] = [
    { amount: 0, unit: "ml" },
    { amount: "120", unit: "ml" },
    { amount: 120, unit: "mg" },
    { amount: 120, unit: "ml", milkType: "Tube feed" },
  ];
  for (const details of invalidCases) {
    assert.equal(latestBottle([event("bottle", details), previous]), null);
  }
});

test("nursing shortcut suggests the opposite of the last completed side", () => {
  assert.equal(nextNursingSide([]), "Left");
  assert.equal(nextNursingSide([event("nursing", { side: "Left" })]), "Right");
  assert.equal(nextNursingSide([event("nursing", { side: "Right" })]), "Left");
  assert.equal(
    nextNursingSide([
      { ...event("nursing", { side: "Right" }), state: "active" },
      event("nursing", { side: "Left" }),
    ]),
    "Right",
  );
});

test("sleep shortcut follows the child's local clock and saved bedtime", () => {
  assert.equal(sleepTypeNow(child, new Date("2026-10-07T02:00:00Z")), "nap"); // 10am Perth
  assert.equal(sleepTypeNow(child, new Date("2026-10-07T11:00:00Z")), "nap"); // 7pm, before this child's evening window
  assert.equal(sleepTypeNow(child, new Date("2026-10-07T12:00:00Z")), "night"); // 8pm
  assert.equal(sleepTypeNow(child, new Date("2026-10-07T21:00:00Z")), "night"); // 5am next day
});

test("sleep shortcut follows flexible bedtime and late naps near the live plan's next step", () => {
  const local = (time: string) => new Date(`2026-10-07T${time}:00+08:00`);
  const sleep = (start: string, end: string): Activity => ({
    ...event("sleep", { sleepType: "nap" }),
    startedAt: local(start).toISOString(),
    endedAt: local(end).toISOString(),
  });
  const earlyChild = {
    ...child,
    settings: {
      ...child.settings,
      napCount: 2,
      wakeWindows: [120, 135, 150],
    },
  };
  const morning = {
    ...event("wake", {}),
    startedAt: local("08:00").toISOString(),
  };
  const earlyTime = local("19:05");
  const early = buildStrategy(
    earlyChild,
    [morning, sleep("10:00", "11:00"), sleep("14:00", "16:30")],
    earlyTime,
  );
  assert.equal(
    early.steps.find((step) => step.kind !== "wind-down")?.kind,
    "bedtime",
  );
  assert.equal(sleepTypeNow(earlyChild, earlyTime), "nap");
  assert.equal(sleepTypeNow(earlyChild, earlyTime, early), "night");
  assert.equal(
    sleepTypeNow(earlyChild, local("19:20"), early),
    "nap",
    "stale plans fall back to the saved clock",
  );
  const lateChild = {
    ...child,
    settings: {
      ...defaultSettings,
      napCount: 3,
      wakeWindows: [150, 165, 180, 180],
    },
  };
  const lateTime = local("19:10");
  const late = buildStrategy(
    lateChild,
    [
      { ...morning, startedAt: local("09:00").toISOString() },
      sleep("11:30", "12:30"),
      sleep("15:15", "16:15"),
    ],
    lateTime,
  );
  assert.equal(
    late.steps.find((step) => step.kind !== "wind-down")?.kind,
    "nap",
  );
  assert.equal(sleepTypeNow(lateChild, lateTime), "night");
  assert.equal(sleepTypeNow(lateChild, lateTime, late), "nap");
});

test("an explicit early morning makes the sleep shortcut a nap before the usual wake time", () => {
  const morning = {
    ...event("wake", { dayStarted: true }),
    startedAt: "2026-10-07T03:30:00+08:00",
  };
  const current = new Date("2026-10-07T03:35:00+08:00");
  const profile = {
    ...child,
    settings: {
      ...child.settings,
      napCount: 3,
      wakeWindows: [120, 135, 150, 165],
    },
  };
  const plan = buildStrategy(profile, [morning], current);
  assert.equal(plan.status, "ready");
  assert.equal(Date.parse(plan.nextSleep!) - current.getTime(), 115 * 60000);
  assert.equal(sleepTypeNow(profile, current), "night");
  assert.equal(sleepTypeNow(profile, current, plan), "nap");
});
