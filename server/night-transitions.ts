import type { Activity, NightAction } from "../shared/types.js";
import { nightSleepState } from "../shared/night-sleep.js";
import { insertActivity } from "./activities.js";
import { activitiesFor, transaction, type DB } from "./db.js";
import { fail, nowIso } from "./http.js";

/** Each transition is atomic and checks the caregiver's current sleep version. */
export function transitionNightSleep(
  db: DB,
  reference: Activity,
  version: number,
  action: NightAction,
  at: string,
  userId: string,
) {
  return transaction(db, () => {
    const events = activitiesFor(db, reference.childId, reference.startedAt);
    const night = nightSleepState(events);
    if (
      !night ||
      night.activity.id !== reference.id ||
      night.activity.version !== version
    )
      return fail(
        409,
        "Night sleep changed on another device. Refresh to continue.",
      );
    const sleep = night.activity;
    if (
      (action === "night-wake" && night.phase !== "sleeping") ||
      (action === "back-asleep" && night.phase !== "awake")
    )
      fail(409, "Night sleep changed. Refresh to see the current action.");
    const earliest = night.phase === "awake" ? sleep.endedAt! : sleep.startedAt;
    if (
      Date.parse(at) < Date.parse(earliest) ||
      Date.parse(at) > Date.now() + 60000
    )
      fail(400, "Choose a time between the last sleep change and now.");

    if (action === "back-asleep") {
      // Consume the version before starting the next segment, so stale taps
      // cannot create another timer, even when made by another caregiver.
      db.prepare(
        "UPDATE activities SET version=version+1,updated_at=? WHERE id=?",
      ).run(nowIso(), sleep.id);
      insertActivity(
        db,
        sleep.childId,
        {
          kind: "sleep",
          startedAt: at,
          endedAt: null,
          state: "active",
          pausedMs: 0,
          details: { sleepType: "night" },
          notes: "",
        },
        userId,
      );
      return;
    }

    // If they were already awake, morning starts at the actual wake, rather
    // than when the caregiver later decides to start the day.
    const endedAt = night.phase === "awake" ? sleep.endedAt! : at;
    const details = { ...sleep.details, nightWake: action === "night-wake" };
    db.prepare(
      "UPDATE activities SET state='complete',ended_at=?,paused_at=NULL,details=?,version=version+1,updated_at=? WHERE id=?",
    ).run(endedAt, JSON.stringify(details), nowIso(), sleep.id);
    if (action === "up-for-day")
      insertActivity(
        db,
        sleep.childId,
        {
          kind: "wake",
          startedAt: endedAt,
          endedAt: null,
          state: "complete",
          pausedMs: 0,
          details: { dayStarted: true },
          notes: "",
        },
        userId,
      );
  });
}
