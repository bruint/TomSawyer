import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import {
  mergePendingActivities,
  type PendingActivity,
} from "../src/lib/offline-activities";
import { buildDailyReport } from "../src/lib/report-data";
import type { Activity, ActivityInput } from "../shared/types";

const input: ActivityInput = {
  id: "pending-entry",
  kind: "bottle",
  startedAt: "2026-10-07T03:00:00Z",
  endedAt: null,
  state: "complete",
  pausedMs: 0,
  details: { amount: 120, unit: "ml" },
  notes: "",
};
const user = { id: "caregiver", name: "Alex" };
const pending: PendingActivity = {
  userId: user.id,
  childId: "child",
  body: input,
};

function savedActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    ...input,
    childId: "child",
    createdBy: user.id,
    authorName: user.name,
    pausedAt: null,
    version: 1,
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
    ...overrides,
  };
}

test("offline entries stay within the signed-in caregiver and selected child", () => {
  const queue = [
    pending,
    {
      ...pending,
      userId: "other-caregiver",
      body: { ...input, id: "other-user-entry" },
    },
    {
      ...pending,
      childId: "other-child",
      body: { ...input, id: "other-child-entry" },
    },
  ];
  const result = mergePendingActivities([], queue, "child", user);
  assert.deepEqual(
    result.map((activity) => activity.id),
    [input.id],
  );
  assert.equal(result[0].authorName, user.name);
  assert.equal(result[0].details.amount, 120);
  assert.equal(queue.length, 3);
});

test("a synced server entry takes precedence over its older queued copy", () => {
  const saved = savedActivity({
    version: 2,
    notes: "Corrected on another device",
  });
  const later = {
    ...pending,
    body: { ...input, id: "later-entry", startedAt: "2026-10-07T04:00:00Z" },
  };
  const result = mergePendingActivities(
    [saved],
    [pending, later],
    "child",
    user,
  );
  assert.deepEqual(
    result.map((activity) => activity.id),
    ["later-entry", input.id],
  );
  assert.equal(result[1].version, 2);
  assert.equal(result[1].notes, "Corrected on another device");
});

test("sleep reports split overnight sleep at local midnight across a DST change", () => {
  const sleep = savedActivity({
    kind: "sleep",
    startedAt: "2026-10-03T22:00:00+10:00",
    endedAt: "2026-10-04T06:00:00+11:00",
    details: { sleepType: "night" },
  });
  const start = DateTime.fromISO("2026-10-03", { zone: "Australia/Sydney" });
  const report = buildDailyReport([sleep], start, 3);
  assert.deepEqual(
    report.map((day) => day.night),
    [120, 300, 0],
  );
  assert.equal(report[2].logged.length, 0);
  assert.equal(
    report.reduce((sum, day) => sum + day.night, 0),
    420,
  );
});
